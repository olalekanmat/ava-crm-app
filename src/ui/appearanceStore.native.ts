import * as SecureStore from 'expo-secure-store';

const KEY = 'ava.appearance';

/** Read synchronously at start-up, before any screen or style exists. */
export function readRaw(): string | null {
  try {
    return SecureStore.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeRaw(value: string): void {
  try {
    SecureStore.setItem(KEY, value);
  } catch {
    // Not saved: the app keeps its current look.
  }
}
