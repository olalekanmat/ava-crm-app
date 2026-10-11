import { cycleCalls } from './metrics';
import { tierRank, tiersFor } from './tiers';
import type { Account, Cycle, Snapshot } from './types';

export interface TierSuggestion {
  account: Account;
  from: string;
  to: string;
  direction: 'up' | 'down';
  reasons: string[];
}

/** Days before a cycle ends (and after it ended) when the review is offered on Home and Approvals. */
export const REVIEW_WINDOW_DAYS = 21;

export function inReviewWindow(cycle: Cycle | undefined, now = new Date()): boolean {
  if (!cycle) return false;
  const end = Date.parse(`${cycle.end}T23:59:59`);
  const t = now.getTime();
  return t >= end - REVIEW_WINDOW_DAYS * 864e5 && t <= end + 14 * 864e5;
}

/**
 * Ava's tier suggestions at the end of a cycle (2.9), for doctors (HCPs) owned by `ownerIds`. It
 * weighs prescribing potential, key-opinion-leader status and how the doctor reacted to the
 * presentations in recent visits:
 *   up    potential High or KOL, at least one positive reaction and more positive than negative
 *   down  potential Low (and not a KOL), or no positive reaction in 3+ detailed visits with a negative one
 * Moves are one tier at a time. A manager approves each.
 */
export function tierSuggestions(s: Snapshot, cycle: Cycle, ownerIds: Set<string>, prev?: Cycle): TierSuggestion[] {
  const recent = [...cycleCalls(s.calls, cycle), ...(prev ? cycleCalls(s.calls, prev) : [])].filter((c) => c.status === 'Submitted');
  const byAccount = new Map<string, typeof recent>();
  for (const c of recent) byAccount.set(c.accountId, [...(byAccount.get(c.accountId) ?? []), c]);
  const out: TierSuggestion[] = [];
  for (const a of s.accounts) {
    if (a.deletedAt || a.type !== 'HCP' || !ownerIds.has(a.ownerId)) continue;
    const scheme = tiersFor(s.settings, s.users, a.ownerId);
    const rank = tierRank(scheme, a.tier);
    if (rank >= scheme.length) continue; // a tier name the team's scheme does not know
    const calls = byAccount.get(a.id) ?? [];
    const pos = calls.filter((c) => c.reaction === 'Positive').length;
    const neg = calls.filter((c) => c.reaction === 'Negative').length;
    const detailed = calls.filter((c) => c.reaction).length;
    const visits = `${calls.length} visit${calls.length === 1 ? '' : 's'}`;
    if (rank > 0 && (a.potential === 'High' || a.kol) && pos >= 1 && pos > neg) {
      out.push({ account: a, from: a.tier, to: scheme[rank - 1].name, direction: 'up', reasons: [a.kol ? 'Key opinion leader' : '', a.potential === 'High' ? 'High potential' : '', `${pos} positive reaction${pos === 1 ? '' : 's'} in ${visits}`].filter(Boolean) });
    } else if (rank < scheme.length - 1 && !a.kol && (a.potential === 'Low' || (detailed >= 3 && pos === 0 && neg >= 1))) {
      out.push({ account: a, from: a.tier, to: scheme[rank + 1].name, direction: 'down', reasons: [a.potential === 'Low' ? 'Low potential' : '', neg ? `${neg} negative reaction${neg === 1 ? '' : 's'}` : '', pos ? '' : `no positive reaction in ${visits}`].filter(Boolean) });
    }
  }
  return out.sort((x, y) => (x.direction === y.direction ? x.account.name.localeCompare(y.account.name) : x.direction === 'up' ? -1 : 1));
}
