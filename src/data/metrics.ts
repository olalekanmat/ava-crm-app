import { repsUnder } from './access';
import { toDateKey } from './dates';
import { geoStatus } from './geo';
import { cyclesOfLength } from './cycles';
import type { Call, Cycle, CycleLength, CyclePlan, Snapshot, Tier, User } from './types';

export interface RepMetrics {
  rep: User;
  plan?: CyclePlan;
  /** Submitted calls in the cycle. */
  calls: number;
  /** Calls planned in the cycle plan. */
  planned: number;
  /** Planned calls done, counting each target at most up to its plan. */
  onPlan: number;
  /** onPlan / planned, 0..1. */
  attainment: number;
  /** Target accounts with at least one call / target accounts, 0..1. */
  reach: number;
  targets: number;
  reached: number;
  /** In-person calls checked in within the geofence / in-person calls, 0..1 (1 when none). */
  geoVerified: number;
  inPerson: number;
  offSite: number;
  missingCheckIn: number;
  drafts: number;
  reachByTier: Record<Tier, { targets: number; reached: number }>;
}

export function cycleCalls(calls: Call[], cycle: Cycle): Call[] {
  return calls.filter((c) => {
    if (c.status !== 'Submitted') return false;
    const day = toDateKey(new Date(c.datetime));
    return day >= cycle.start && day <= cycle.end;
  });
}

/** Saturday or Sunday (YYYY-MM-DD). 2.15: cycles count working days only. */
export const isWeekendKey = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

const nextKey = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
const prevKey = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);

/** Working days (Monday to Friday) from start to end, inclusive (YYYY-MM-DD). */
export function workDays(start: string, end: string): number {
  let n = 0;
  for (let d = start; d <= end; d = nextKey(d)) if (!isWeekendKey(d)) n++;
  return n;
}

/**
 * Share of the cycle that has passed, 0..1. Attainment is compared against this pace. 2.15: only
 * working days (Monday to Friday) count, so weekends neither pass nor count as days to visit. With
 * the person's approved leave, days off count neither as passed nor as available, so being on
 * leave does not put them behind (2.5).
 */
export function cycleElapsed(cycle: Cycle, now = new Date(), leave: DayRange[] = []): number {
  const today = toDateKey(now);
  if (today < cycle.start) return 0;
  if (today > cycle.end) return 1;
  const total = workDays(cycle.start, cycle.end) - leaveDaysIn(leave, cycle.start, cycle.end);
  if (total <= 0) return 1;
  const before = today > cycle.start ? prevKey(today) : undefined;
  const full = before ? workDays(cycle.start, before) - leaveDaysIn(leave, cycle.start, before) : 0;
  const onLeave = leave.some((l) => l.start <= today && l.end >= today);
  const part = !isWeekendKey(today) && !onLeave ? plainFraction(now) : 0;
  return Math.min(1, Math.max(0, (full + part) / total));
}

/** Part of today that has passed, 0..1. */
const plainFraction = (now: Date) => (now.getHours() * 60 + now.getMinutes()) / 1440;

export interface DayRange {
  start: string;
  end: string;
}

/** Days from start to end, inclusive (YYYY-MM-DD). */
export const spanDays = (start: string, end: string) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 864e5) + 1;

/** Working days of leave between `from` and `to` (inclusive), counting overlapping ranges once (weekends never count). */
export function leaveDaysIn(leave: DayRange[], from: string, to: string): number {
  const days = new Set<string>();
  for (const l of leave) {
    const a = l.start > from ? l.start : from;
    const b = l.end < to ? l.end : to;
    if (a > b) continue;
    for (let d = a; d <= b; d = nextKey(d)) if (!isWeekendKey(d)) days.add(d);
  }
  return days.size;
}

/** A person's approved leave. */
export function approvedLeave(s: Pick<Snapshot, 'leaves'>, userId: string): DayRange[] {
  return (s.leaves ?? []).filter((l) => l.userId === userId && l.status === 'Approved');
}

/** Working days (Monday to Friday) left in the cycle, today included. */
export function daysLeft(cycle: Cycle, now = new Date()): number {
  const today = toDateKey(now);
  if (today > cycle.end) return 0;
  return workDays(today < cycle.start ? cycle.start : today, cycle.end);
}

/**
 * The cycle running today, else the next one, else the latest. With `length`, only cycles of that
 * length count (the company's active cycle length), falling back to any cycle when there are none.
 */
export function currentCycle(cycles: Cycle[], now = new Date(), length?: CycleLength): Cycle | undefined {
  const today = toDateKey(now);
  const ofLength = length ? cyclesOfLength(cycles, length) : [];
  const sorted = ofLength.length ? ofLength : [...cycles].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.find((c) => c.start <= today && today <= c.end) ?? sorted.find((c) => c.start > today) ?? sorted[sorted.length - 1];
}

export function planFor(s: Snapshot, repId: string, cycleId: string): CyclePlan | undefined {
  return s.plans.find((p) => p.ownerId === repId && p.cycleId === cycleId);
}

/** Calls done per target account in the cycle. */
export function callsByAccount(calls: Call[]): Map<string, Call[]> {
  const m = new Map<string, Call[]>();
  for (const c of calls) m.set(c.accountId, [...(m.get(c.accountId) ?? []), c]);
  return m;
}

export function repMetrics(s: Snapshot, rep: User, cycle: Cycle): RepMetrics {
  const own = s.calls.filter((c) => c.ownerId === rep.id);
  const inCycle = cycleCalls(own, cycle);
  const plan = planFor(s, rep.id, cycle.id);
  const byAccount = callsByAccount(inCycle);
  const targets = plan?.targets ?? [];
  const planned = targets.reduce((n, t) => n + t.planned, 0);
  const onPlan = targets.reduce((n, t) => n + Math.min(t.planned, byAccount.get(t.accountId)?.length ?? 0), 0);
  const reached = targets.filter((t) => byAccount.has(t.accountId)).length;

  const reachByTier: RepMetrics['reachByTier'] = {};
  for (const t of targets) {
    const tier = s.accounts.find((a) => a.id === t.accountId)?.tier;
    if (!tier) continue;
    reachByTier[tier] ??= { targets: 0, reached: 0 };
    reachByTier[tier].targets++;
    if (byAccount.has(t.accountId)) reachByTier[tier].reached++;
  }

  const statuses = inCycle.map((c) => geoStatus(c, s.settings.geofenceM)).filter((g) => g !== 'Remote');
  const verified = statuses.filter((g) => g === 'Verified').length;

  return {
    rep,
    plan,
    calls: inCycle.length,
    planned,
    onPlan,
    attainment: planned ? onPlan / planned : 0,
    reach: targets.length ? reached / targets.length : 0,
    targets: targets.length,
    reached,
    geoVerified: statuses.length ? verified / statuses.length : 1,
    inPerson: statuses.length,
    offSite: statuses.filter((g) => g === 'Off-site').length,
    missingCheckIn: statuses.filter((g) => g === 'Missing').length,
    drafts: own.filter((c) => c.status === 'Saved').length,
    reachByTier,
  };
}

export interface Rollup {
  reps: RepMetrics[];
  calls: number;
  planned: number;
  onPlan: number;
  attainment: number;
  targets: number;
  reached: number;
  reach: number;
  inPerson: number;
  geoVerified: number;
  drafts: number;
  plansPending: number;
  plansMissing: number;
  reachByTier: Record<Tier, { targets: number; reached: number }>;
}

export function rollup(reps: RepMetrics[]): Rollup {
  const sum = (f: (r: RepMetrics) => number) => reps.reduce((n, r) => n + f(r), 0);
  const planned = sum((r) => r.planned);
  const onPlan = sum((r) => r.onPlan);
  const targets = sum((r) => r.targets);
  const reached = sum((r) => r.reached);
  const inPerson = sum((r) => r.inPerson);
  const verified = sum((r) => r.geoVerified * r.inPerson);
  const tiers: Rollup['reachByTier'] = {};
  for (const r of reps) {
    for (const [t, x] of Object.entries(r.reachByTier)) {
      tiers[t] ??= { targets: 0, reached: 0 };
      tiers[t].targets += x.targets;
      tiers[t].reached += x.reached;
    }
  }
  return {
    reps,
    calls: sum((r) => r.calls),
    planned,
    onPlan,
    attainment: planned ? onPlan / planned : 0,
    targets,
    reached,
    reach: targets ? reached / targets : 0,
    inPerson,
    geoVerified: inPerson ? verified / inPerson : 1,
    drafts: sum((r) => r.drafts),
    plansPending: reps.filter((r) => r.plan?.status === 'Submitted').length,
    plansMissing: reps.filter((r) => !r.plan).length,
    reachByTier: tiers,
  };
}

/** Metrics for every rep under a user (an FLM's team, an SLM's region). */
export function teamRollup(s: Snapshot, manager: User, cycle: Cycle): Rollup {
  return rollup(repsUnder(s.users, manager).map((r) => repMetrics(s, r, cycle)));
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
