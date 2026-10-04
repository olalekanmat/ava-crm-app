/** Ava palette, taken from the logo: deep blue to sky, with orange, crimson and lime accents. */
export const colors = {
  bg: '#F4F6FB',
  card: '#FFFFFF',
  text: '#0E1A2B',
  muted: '#5B6779',
  faint: '#8A94A6',
  border: '#E2E7F0',
  primary: '#1846C8',
  primaryDark: '#0F2E8A',
  primarySoft: '#E8EEFC',
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

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadow = { boxShadow: '0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.04)' } as const;

/** Stable colour per person, for avatars. */
const AVATAR = ['#1846C8', '#12A5EC', '#F26B1D', '#C8114B', '#7DB52F', '#6D4AD8', '#0E8C8C'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

/** Green when on pace, amber when a little behind, red when far behind. */
export function paceColor(value: number, expected: number): string {
  if (value >= expected * 0.95) return colors.success;
  if (value >= expected * 0.7) return colors.warn;
  return colors.danger;
}

/** Call calendar edges: green submitted, blue planned (not due yet), red planned and overdue. */
export const calendarColors = {
  submitted: '#1E9E5A',
  planned: '#1846C8',
  overdue: '#D92D20',
} as const;
