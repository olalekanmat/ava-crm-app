import { addDays, toDateKey } from './dates';
import type { Call } from './types';

/** Calendar colours: green submitted, blue planned and not yet due, red planned and overdue. */
export type CalendarState = 'submitted' | 'planned' | 'overdue';

/** A planned (or draft) call is overdue once its day has passed without being submitted. */
export function calendarState(c: Pick<Call, 'status' | 'datetime'>, now = new Date()): CalendarState {
  if (c.status === 'Submitted') return 'submitted';
  return toDateKey(new Date(c.datetime)) < toDateKey(now) ? 'overdue' : 'planned';
}

/** The weeks shown for a month, Monday first, as YYYY-MM-DD keys (with days from the months around it). */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1, 12);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => toDateKey(addDays(start, w * 7 + d)));
    if (w > 3 && !week.some((k) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))) break;
    weeks.push(week);
  }
  return weeks;
}

export interface DaySummary {
  calls: Call[];
  submitted: number;
  planned: number;
  overdue: number;
}

export function byDay(calls: Call[], now = new Date()): Map<string, DaySummary> {
  const out = new Map<string, DaySummary>();
  for (const c of calls) {
    const key = toDateKey(new Date(c.datetime));
    const d = out.get(key) ?? { calls: [], submitted: 0, planned: 0, overdue: 0 };
    d.calls.push(c);
    d[calendarState(c, now)]++;
    out.set(key, d);
  }
  for (const d of out.values()) d.calls.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return out;
}
