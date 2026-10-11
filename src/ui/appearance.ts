import { Appearance, StyleSheet } from 'react-native';
import { readRaw, writeRaw } from './appearanceStore';
import { colors, darkColors } from './theme';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type TextChoice = 'normal' | 'large' | 'larger';
export interface AppearancePrefs {
  theme: ThemeChoice;
  text: TextChoice;
}

export const TEXT_SCALE: Record<TextChoice, number> = { normal: 1, large: 1.12, larger: 1.25 };
/** Light until the person picks otherwise, so nobody's app changes look without asking. */
const DEFAULTS: AppearancePrefs = { theme: 'light', text: 'normal' };

export function readPrefs(): AppearancePrefs {
  try {
    const raw = JSON.parse(readRaw() ?? '{}') as Partial<AppearancePrefs>;
    return {
      theme: raw.theme === 'system' || raw.theme === 'dark' ? raw.theme : 'light',
      text: raw.text === 'large' || raw.text === 'larger' ? raw.text : 'normal',
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(p: AppearancePrefs): void {
  writeRaw(JSON.stringify(p));
}

/** What this run of the app uses. Styles are made once, so a change shows after a restart. */
export const active: { scheme: 'light' | 'dark'; prefs: AppearancePrefs } = { scheme: 'light', prefs: DEFAULTS };

const scaleStyle = (style: Record<string, unknown>, k: number) => {
  const out = { ...style };
  if (typeof out.fontSize === 'number') out.fontSize = Math.round(out.fontSize * k);
  if (typeof out.lineHeight === 'number') out.lineHeight = Math.round(out.lineHeight * k);
  return out;
};

let booted = false;

/**
 * Applies the saved look: swaps in the dark palette and scales text. Runs from the app's entry
 * file, before any screen module (and its StyleSheet.create) loads.
 */
export function bootAppearance(): void {
  if (booted) return;
  booted = true;
  const prefs = readPrefs();
  const scheme = prefs.theme === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : prefs.theme;
  active.prefs = prefs;
  active.scheme = scheme;
  if (scheme === 'dark') Object.assign(colors, darkColors);
  const k = TEXT_SCALE[prefs.text];
  if (k !== 1) {
    try {
      const create = StyleSheet.create;
      (StyleSheet as { create: typeof StyleSheet.create }).create = ((styles: Record<string, Record<string, unknown>>) =>
        create(Object.fromEntries(Object.entries(styles).map(([name, st]) => [name, st && typeof st === 'object' ? scaleStyle(st, k) : st])) as never)) as typeof StyleSheet.create;
    } catch {
      // Some platforms freeze StyleSheet: text keeps its normal size.
    }
  }
}
