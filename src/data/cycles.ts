import type { Cycle } from './types';

/**
 * Planning cycles follow the calendar quarters, the same for every company:
 * Cycle 1 = January to March, Cycle 2 = April to June, Cycle 3 = July to September,
 * Cycle 4 = October to December. Ids are stable (q2026-1 … q2026-4), so plans made on
 * any device point at the same cycle.
 */
const MONTHS = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
const LAST_DAY = ['03-31', '06-30', '09-30', '12-31'];
const FIRST_DAY = ['01-01', '04-01', '07-01', '10-01'];

export const quarterId = (year: number, q: number) => `q${year}-${q}`;
export const QUARTER_ID_RE = /^q(\d{4})-([1-4])$/;

export function quarterCycle(year: number, q: number): Cycle {
  return { id: quarterId(year, q), name: `Cycle ${q} · ${MONTHS[q - 1]} ${year}`, start: `${year}-${FIRST_DAY[q - 1]}`, end: `${year}-${LAST_DAY[q - 1]}` };
}

/** All quarters from `fromYear` to `toYear`, inclusive, in order. */
export function quarterCycles(fromYear: number, toYear: number): Cycle[] {
  const out: Cycle[] = [];
  for (let y = fromYear; y <= toYear; y++) for (let q = 1; q <= 4; q++) out.push(quarterCycle(y, q));
  return out;
}

/** The quarters a company can plan in: from the year before it started to the year after today. */
export function companyCycles(createdAt: string, now = new Date()): Cycle[] {
  const start = new Date(createdAt).getFullYear();
  const from = Number.isFinite(start) ? Math.min(start, now.getFullYear()) - 1 : now.getFullYear() - 1;
  return quarterCycles(from, now.getFullYear() + 1);
}

export const isQuarterId = (id: string) => QUARTER_ID_RE.test(id);
