import { addDays, toDateKey } from './dates';
import type { Call } from './types';

/** Monday of the week containing `d`, at noon (safe across daylight-saving changes). */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  return addDays(x, -((x.getDay() + 6) % 7));
}

/** The 7 day keys (YYYY-MM-DD), Monday first, of the week starting at `monday`. */
export function weekKeys(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toDateKey(addDays(monday, i)));
}

/** Hour of the day as a fraction, e.g. 9:30 → 9.5. */
export const hourOf = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};

/** First and last hour a week grid shows: working hours, stretched to fit every call. */
export function hourRange(calls: Pick<Call, 'datetime'>[], from = 8, to = 18): [number, number] {
  let lo = from;
  let hi = to;
  for (const c of calls) {
    const h = hourOf(c.datetime);
    lo = Math.min(lo, Math.floor(h));
    hi = Math.max(hi, Math.min(24, Math.floor(h) + 1));
  }
  return [lo, hi];
}

export interface AgendaDay {
  key: string;
  calls: Call[];
}

/** Calls grouped by day, earliest first, from `fromKey` on (days without calls left out). */
export function agenda(calls: Call[], fromKey: string, days = 60): AgendaDay[] {
  const toKey = toDateKey(addDays(new Date(`${fromKey}T12:00:00`), days));
  const map = new Map<string, Call[]>();
  for (const c of calls) {
    const k = toDateKey(new Date(c.datetime));
    if (k < fromKey || k > toKey) continue;
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, cs]) => ({ key, calls: cs.sort((a, b) => a.datetime.localeCompare(b.datetime)) }));
}
