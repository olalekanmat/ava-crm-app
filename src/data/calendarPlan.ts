import { activeCycleLength, cyclesOfLength } from './cycles';
import { toDateKey } from './dates';
import type { Account, Call, Cycle, CyclePlan, Snapshot } from './types';

/** One doctor or institution in the rep's cycle plan, with how many visits are still to be put in the calendar. */
export interface PlanDoctor {
  account: Account;
  /** Calls the plan commits to this cycle (0 for an account outside the plan). */
  planned: number;
  /** Submitted calls this cycle. */
  done: number;
  /** Planned or draft calls already in the calendar this cycle. */
  scheduled: number;
  /** Visits still to schedule: planned − done − scheduled, never below 0. */
  left: number;
  inPlan: boolean;
}

/** The cycle (of the company's length) that contains `day`, if any. */
export function cycleOn(s: Pick<Snapshot, 'cycles' | 'settings'>, day: string): Cycle | undefined {
  return cyclesOfLength(s.cycles, activeCycleLength(s.settings)).find((c) => c.start <= day && c.end >= day);
}

/**
 * 2.15: the doctors in a rep's plan for the cycle containing `day`, most visits left first; then, when
 * `all` is set, the rep's other accounts (name order) so any account can be dragged onto the calendar.
 */
export function planDoctors(
  s: Pick<Snapshot, 'cycles' | 'settings' | 'plans' | 'calls' | 'accounts'>,
  ownerId: string,
  day: string,
  all = false,
): { cycle?: Cycle; plan?: CyclePlan; doctors: PlanDoctor[] } {
  const cycle = cycleOn(s, day);
  const plan = cycle ? s.plans.find((p) => p.ownerId === ownerId && p.cycleId === cycle.id) : undefined;
  const done = new Map<string, number>();
  const scheduled = new Map<string, number>();
  if (cycle) {
    for (const c of s.calls) {
      if (c.ownerId !== ownerId) continue;
      const k = toDateKey(new Date(c.datetime));
      if (k < cycle.start || k > cycle.end) continue;
      const m = c.status === 'Submitted' ? done : scheduled;
      m.set(c.accountId, (m.get(c.accountId) ?? 0) + 1);
    }
  }
  const live = new Map(s.accounts.filter((a) => !a.deletedAt).map((a) => [a.id, a]));
  const row = (account: Account, planned: number, inPlan: boolean): PlanDoctor => {
    const d = done.get(account.id) ?? 0;
    const sc = scheduled.get(account.id) ?? 0;
    return {
      account,
      planned,
      done: d,
      scheduled: sc,
      left: Math.max(0, planned - d - sc),
      inPlan,
    };
  };
  const doctors: PlanDoctor[] = [];
  for (const t of plan?.targets ?? []) {
    const a = live.get(t.accountId);
    if (a) doctors.push(row(a, t.planned, true));
  }
  doctors.sort((a, b) => b.left - a.left || a.account.name.localeCompare(b.account.name));
  if (all) {
    const inPlan = new Set(doctors.map((d) => d.account.id));
    const rest = [...live.values()].filter((a) => a.ownerId === ownerId && !inPlan.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
    for (const a of rest) doctors.push(row(a, 0, false));
  }
  return { cycle, plan, doctors };
}

/** Rounds an hour of the day to the nearest quarter hour, kept between 00:00 and 23:45. */
export const snapHour = (h: number) => Math.min(23.75, Math.max(0, Math.round(h * 4) / 4));

/** The date-time a call moves to when dropped on `day`: the same time of day, or `hour` (e.g. 14.5) when given. */
export function movedDatetime(iso: string, day: string, hour?: number): string {
  const old = new Date(iso);
  const [y, m, d] = day.split('-').map(Number);
  const h = hour === undefined ? old.getHours() + old.getMinutes() / 60 : snapHour(hour);
  return new Date(y, m - 1, d, Math.floor(h), Math.round((h % 1) * 60)).toISOString();
}

/** Whether a call can be dragged to another time by this person: their own, not yet submitted. */
export const canMoveCall = (c: Pick<Call, 'ownerId' | 'status'>, meId: string) => c.ownerId === meId && c.status !== 'Submitted';

/** A planned visit made by dropping a doctor on the calendar (default 09:00, products and messages added later). */
export function droppedCall(id: string, accountId: string, ownerId: string, day: string, hour = 9, nowIso = new Date().toISOString()): Call {
  return {
    id,
    accountId,
    ownerId,
    datetime: movedDatetime(new Date().toISOString(), day, hour),
    channel: 'In person',
    status: 'Planned',
    products: [],
    keyMessages: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
