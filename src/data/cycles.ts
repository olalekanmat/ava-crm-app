import type { Cycle, CycleLength, Settings } from './types';

/**
 * Planning cycles follow the calendar, the same for every company. The administrator chooses
 * whether the company plans by quarter (the default) or by month:
 *
 *   quarters  q2026-1 … q2026-4    Cycle 1 = January to March … Cycle 4 = October to December
 *   months    m2026-01 … m2026-12  "Jan 2026" … "Dec 2026"
 *
 * Ids are stable, so plans made on any device point at the same cycle. Both kinds always exist
 * in the data, so plans keep their original cycle when the administrator changes the length.
 */
const MONTHS = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
const LAST_DAY = ['03-31', '06-30', '09-30', '12-31'];
const FIRST_DAY = ['01-01', '04-01', '07-01', '10-01'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const quarterId = (year: number, q: number) => `q${year}-${q}`;
export const QUARTER_ID_RE = /^q(\d{4})-([1-4])$/;
export const monthId = (year: number, month: number) => `m${year}-${String(month).padStart(2, '0')}`;
export const MONTH_ID_RE = /^m(\d{4})-(0[1-9]|1[0-2])$/;

export const CYCLE_LENGTHS: CycleLength[] = ['quarter', 'month'];
export const CYCLE_LENGTH_LABEL: Record<CycleLength, string> = { quarter: 'Quarterly', month: 'Monthly' };

export function quarterCycle(year: number, q: number): Cycle {
  return { id: quarterId(year, q), name: `Cycle ${q} · ${MONTHS[q - 1]} ${year}`, start: `${year}-${FIRST_DAY[q - 1]}`, end: `${year}-${LAST_DAY[q - 1]}` };
}

/** `month` is 1–12. */
export function monthCycle(year: number, month: number): Cycle {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return { id: monthId(year, month), name: `${MONTH_NAMES[month - 1]} ${year}`, start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

/** All quarters from `fromYear` to `toYear`, inclusive, in order. */
export function quarterCycles(fromYear: number, toYear: number): Cycle[] {
  const out: Cycle[] = [];
  for (let y = fromYear; y <= toYear; y++) for (let q = 1; q <= 4; q++) out.push(quarterCycle(y, q));
  return out;
}

/** All months from `fromYear` to `toYear`, inclusive, in order. */
export function monthCycles(fromYear: number, toYear: number): Cycle[] {
  const out: Cycle[] = [];
  for (let y = fromYear; y <= toYear; y++) for (let m = 1; m <= 12; m++) out.push(monthCycle(y, m));
  return out;
}

function yearRange(createdAt: string, now: Date): [number, number] {
  const start = new Date(createdAt).getFullYear();
  const from = Number.isFinite(start) ? Math.min(start, now.getFullYear()) - 1 : now.getFullYear() - 1;
  return [from, now.getFullYear() + 1];
}

/** The quarters a company can plan in: from the year before it started to the year after today. */
export function companyCycles(createdAt: string, now = new Date()): Cycle[] {
  const [from, to] = yearRange(createdAt, now);
  return quarterCycles(from, to);
}

/** The months a company can plan in, over the same years as companyCycles. */
export function companyMonthCycles(createdAt: string, now = new Date()): Cycle[] {
  const [from, to] = yearRange(createdAt, now);
  return monthCycles(from, to);
}

export const isQuarterId = (id: string) => QUARTER_ID_RE.test(id);
export const isMonthId = (id: string) => MONTH_ID_RE.test(id);

/** The length of a cycle. Custom cycles from early versions count as quarterly. */
export const lengthOfCycle = (c: Pick<Cycle, 'id'>): CycleLength => (isMonthId(c.id) ? 'month' : 'quarter');

/** The cycle length the company uses (quarterly unless an administrator chose monthly). */
export const activeCycleLength = (s?: Pick<Settings, 'cycleLength'>): CycleLength => (s?.cycleLength === 'month' ? 'month' : 'quarter');

/** Cycles of one length, oldest first. */
export function cyclesOfLength(cycles: Cycle[], length: CycleLength): Cycle[] {
  return cycles.filter((c) => lengthOfCycle(c) === length).sort((a, b) => a.start.localeCompare(b.start));
}

/** Tier frequencies are calls per quarter. A monthly cycle suggests a third of that, at least one call. */
export function scaleFrequency(perQuarter: number, length: CycleLength): number {
  if (length === 'quarter' || perQuarter <= 0) return perQuarter;
  return Math.max(1, Math.round(perQuarter / 3));
}

/** The current cycle and the one after it, of the given length (the plan tab's picker). */
export function planningCycles(cycles: Cycle[], length: CycleLength, today: string): Cycle[] {
  const list = cyclesOfLength(cycles, length);
  const i = list.findIndex((c) => c.end >= today);
  return i < 0 ? list.slice(-1) : list.slice(i, i + 2);
}

/** The cycle of the given length that ended before `cycle` started (the latest one). */
export function previousCycle(cycles: Cycle[], cycle: Cycle, length: CycleLength = lengthOfCycle(cycle)): Cycle | undefined {
  return cyclesOfLength(cycles, length)
    .filter((c) => c.end < cycle.start)
    .at(-1);
}

/** The cycles of the given length that overlap a calendar month (`month` 0–11), for the calendar. */
export function cyclesInMonth(cycles: Cycle[], length: CycleLength, year: number, month: number): Cycle[] {
  const mm = String(month + 1).padStart(2, '0');
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-31`;
  return cyclesOfLength(cycles, length).filter((c) => c.start <= last && c.end >= first);
}
