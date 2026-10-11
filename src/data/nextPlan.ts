import type { Account, CyclePlan, PlanTarget } from './types';

export interface PlanChange {
  accountId: string;
  /** Calls planned last cycle (0 when the account is new to the plan). */
  from: number;
  /** Calls suggested now (0 when the account drops out). */
  to: number;
  reason: string;
}

/** At most this many missed visits carry over to the next cycle per account. */
export const MAX_CARRY = 2;

/**
 * Next cycle's plan from this one (2.9): the same accounts, set to their tier's frequency now (so
 * tier changes count), plus visits missed last cycle (up to two per account), plus accounts added
 * to the territory since. Accounts whose tier no longer gets visits drop out.
 *
 *   want(a)   calls per cycle for the account's tier and profile, already scaled to the cycle length
 *   done      submitted calls per account in the previous cycle
 */
export function nextCyclePlan(prev: Pick<CyclePlan, 'targets'>, territory: Account[], done: Map<string, number>, want: (a: Account) => number, prevStart: string): { targets: PlanTarget[]; changes: PlanChange[] } {
  const targets: PlanTarget[] = [];
  const changes: PlanChange[] = [];
  const byId = new Map(territory.map((a) => [a.id, a]));
  for (const t of prev.targets) {
    const a = byId.get(t.accountId);
    if (!a) {
      changes.push({ accountId: t.accountId, from: t.planned, to: 0, reason: 'No longer in your territory' });
      continue;
    }
    const base = want(a);
    if (base <= 0) {
      changes.push({ accountId: a.id, from: t.planned, to: 0, reason: `Tier ${a.tier} has no planned visits now` });
      continue;
    }
    const missed = Math.max(0, t.planned - (done.get(a.id) ?? 0));
    const carry = Math.min(MAX_CARRY, missed);
    const planned = Math.min(50, base + carry);
    targets.push({ accountId: a.id, planned });
    if (planned !== t.planned) {
      const why = [base !== t.planned ? `tier ${a.tier} is ${base} a cycle` : '', carry ? `${missed} missed last cycle` : ''].filter(Boolean).join(', ');
      changes.push({ accountId: a.id, from: t.planned, to: planned, reason: why.charAt(0).toUpperCase() + why.slice(1) });
    }
  }
  const planned = new Set(prev.targets.map((t) => t.accountId));
  for (const a of territory) {
    if (planned.has(a.id) || (a.createdAt ?? '') < prevStart) continue;
    const base = want(a);
    if (base <= 0) continue;
    targets.push({ accountId: a.id, planned: Math.min(50, base) });
    changes.push({ accountId: a.id, from: 0, to: Math.min(50, base), reason: 'New account' });
  }
  return { targets, changes };
}
