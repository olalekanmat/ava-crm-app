/** Ava palette, taken from the logo: deep blue to sky, with orange, crimson and lime accents. */
export const colors = {
  bg: '#F4F6FB',
  card: '#FFFFFF',
  /** Subtle fill for inset areas (segmented controls, inputs on cards, table stripes). */
  sunken: '#EEF1F7',
  text: '#0B1526',
  muted: '#566276',
  faint: '#8A94A6',
  border: '#E3E8F1',
  hairline: '#EEF1F6',
  primary: '#1846C8',
  primaryDark: '#0F2E8A',
  /** Deepest brand navy, for premium headers. */
  ink: '#081A44',
  primarySoft: '#EAF0FD',
  sky: '#12A5EC',
  orange: '#F26B1D',
  crimson: '#C8114B',
  lime: '#7DB52F',
  danger: '#C21F3A',
  dangerSoft: '#FDECEF',
  success: '#11803F',
  successSoft: '#E4F5EA',
  warn: '#A15C00',
  warnSoft: '#FFF3DF',
};

/** Signal colours for big numbers on home tiles: red urgent, amber important, blue normal, green good. */
export const tone = {
  urgent: '#D92D20',
  important: '#D97706',
  normal: colors.primary,
  good: '#12963F',
} as const;

/** Spacing scale (4-point). Use these, not ad-hoc numbers. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
/** Smallest comfortable touch target. */
export const touch = 44;

/** Soft, layered card shadow. */
export const shadow = { boxShadow: '0 1px 2px rgba(10, 25, 60, 0.04), 0 6px 20px rgba(10, 25, 60, 0.06)' } as const;
/** Glow under primary buttons. */
export const shadowPrimary = { boxShadow: '0 1px 2px rgba(15, 46, 138, 0.25), 0 6px 16px rgba(24, 70, 200, 0.22)' } as const;
/** Raised surfaces: popovers, sheets, floating buttons. */
export const shadowRaised = { boxShadow: '0 10px 30px rgba(15, 30, 70, 0.16), 0 2px 6px rgba(15, 30, 70, 0.08)' } as const;

/** Stable colour per person, for avatars. */
const AVATAR = ['#1846C8', '#12A5EC', '#F26B1D', '#C8114B', '#7DB52F', '#6D4AD8', '#0E8C8C'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

/** Green when on pace, amber when a little behind, red when far behind. */
export function paceColor(value: number, expected: number): string {
  if (value >= expected * 0.95) return tone.good;
  if (value >= expected * 0.7) return tone.important;
  return tone.urgent;
}

/** Call calendar edges: green submitted, blue planned (not due yet), red planned and overdue. */
export const calendarColors = {
  submitted: '#1E9E5A',
  planned: '#1846C8',
  overdue: '#D92D20',
} as const;
