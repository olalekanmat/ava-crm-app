import { lengthOfCycle, scaleFrequency } from './cycles';
import { toDateKey } from './dates';
import { approvedLeave, callsByAccount, cycleCalls, cycleElapsed, spanDays } from './metrics';
import { profileBoost } from './profile';
import { tierFrequency, tiersFor } from './tiers';
import type { Account, Cycle, Snapshot } from './types';

export interface NextVisit {
  account: Account;
  score: number;
  /** Why, most important first, e.g. "2 calls behind plan", "Follow-up due today". */
  reasons: string[];
  lastCall?: string;
}

/**
 * Whom a rep should see next, best first. Works offline from the rep's own data: how far each
 * planned account is behind the plan's pace, how long since the last visit against the tier's
 * frequency, follow-ups and tasks that are due, and key opinion leaders or high potential. Accounts
 * already booked in the next week are left out.
 */
export function nextVisits(s: Snapshot, repId: string, cycle: Cycle | undefined, now = new Date(), limit = 5): NextVisit[] {
  const today = toDateKey(now);
  const weekAhead = toDateKey(new Date(now.getTime() + 7 * 864e5));
  const own = s.calls.filter((c) => c.ownerId === repId);
  const booked = new Set(own.filter((c) => c.status === 'Planned' && toDateKey(new Date(c.datetime)) >= today && toDateKey(new Date(c.datetime)) <= weekAhead).map((c) => c.accountId));
  const last = new Map<string, string>();
  for (const c of own) if (c.status === 'Submitted' && (last.get(c.accountId) ?? '') < c.datetime) last.set(c.accountId, c.datetime);
  const plan = cycle ? s.plans.find((p) => p.ownerId === repId && p.cycleId === cycle.id && p.status !== 'Rejected') : undefined;
  const done = cycle ? callsByAccount(cycleCalls(own, cycle)) : new Map();
  const elapsed = cycle ? cycleElapsed(cycle, now, approvedLeave(s, repId)) : 0;
  const scheme = tiersFor(s.settings, s.users, repId);
  const length = cycle ? lengthOfCycle(cycle) : 'quarter';
  const cycleDays = cycle ? spanDays(cycle.start, cycle.end) : 91;
  const due = new Map<string, string>();
  for (const c of own) if (c.status === 'Submitted' && c.followUpDate && c.followUpDate <= weekAhead && (last.get(c.accountId) ?? '') <= c.datetime) due.set(c.accountId, c.followUpDate);
  for (const t of s.tasks ?? []) if (t.ownerId === repId && !t.doneAt && t.accountId && t.due <= weekAhead) due.set(t.accountId, (due.get(t.accountId) ?? t.due) < t.due ? due.get(t.accountId)! : t.due);

  const out: NextVisit[] = [];
  for (const a of s.accounts) {
    if (a.ownerId !== repId || a.deletedAt || booked.has(a.id)) continue;
    const reasons: string[] = [];
    let score = 0;
    const target = plan?.targets.find((t) => t.accountId === a.id);
    const n = done.get(a.id)?.length ?? 0;
    if (target) {
      const behind = Math.floor(target.planned * elapsed - n);
      if (behind >= 1) {
        score += behind * 3;
        reasons.push(`${behind} call${behind > 1 ? 's' : ''} behind plan`);
      } else if (n < target.planned) score += 1;
      if (n === 0 && elapsed > 0.25) {
        score += 2;
        reasons.push('Not seen this cycle');
      }
    }
    const d = due.get(a.id);
    if (d) {
      score += d < today ? 5 : d === today ? 4 : 2;
      reasons.push(d < today ? 'Follow-up overdue' : d === today ? 'Follow-up due today' : 'Follow-up due this week');
    }
    const freq = scaleFrequency(tierFrequency(scheme, a.tier), length) + profileBoost(a, length);
    const lastAt = last.get(a.id);
    if (freq > 0) {
      const interval = cycleDays / freq;
      const since = lastAt ? (now.getTime() - Date.parse(lastAt)) / 864e5 : Infinity;
      if (since > interval) {
        score += Math.min(4, since === Infinity ? 3 : since / interval);
        reasons.push(lastAt ? `Last seen ${Math.round(since)} days ago` : 'Never visited');
      }
    }
    if (a.kol) {
      score += 2;
      reasons.push('Key opinion leader');
    }
    if (a.potential === 'High') {
      score += 1;
      reasons.push('High potential');
    }
    if (score > 0 && reasons.length) out.push({ account: a, score, reasons, lastCall: lastAt });
  }
  return out.sort((x, y) => y.score - x.score || x.account.name.localeCompare(y.account.name)).slice(0, limit);
}
