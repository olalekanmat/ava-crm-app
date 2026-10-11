import { managersOf } from './mutations';
import { batchStock } from './samples';
import type { Snapshot, SampleIssue, User } from './types';

/** What moves from one person to another when a rep (or manager) leaves (2.8). */
export interface HandoverSummary {
  accounts: number;
  /** Plans for the current and later cycles: moved whole, or merged into the new person's plan. */
  plansMoved: number;
  plansMerged: number;
  plannedCalls: number;
  tasks: number;
  events: number;
  /** Direct reports who move to the new manager (FLM and SLM handovers). */
  reports: number;
  /** Sample stock per product and batch. */
  samples: { product: string; batch?: string; expiry?: string; qty: number }[];
}

export const handoverTotal = (h: HandoverSummary) => h.accounts + h.plansMoved + h.plansMerged + h.plannedCalls + h.tasks + h.events + h.reports + h.samples.length;

/** Who can take over from `from`: active people with the same role, other than them. */
export const handoverCandidates = (users: User[], from: User) => users.filter((u) => u.role === from.role && u.active && !u.deletedAt && u.id !== from.id);

/**
 * Moves `fromId`'s work to `toId` and says what moved. Submitted calls, past plans and drafts stay
 * with the person who made them (they are the company's record). `nowIso` is the change's time, so
 * every device makes the same sample movements with the same ids.
 */
export function handover(s: Snapshot, fromId: string, toId: string, byId: string, nowIso: string): { snapshot: Snapshot; summary: HandoverSummary } {
  const today = nowIso.slice(0, 10);
  const cycleEnd = new Map(s.cycles.map((c) => [c.id, c.end]));
  const live = (cycleId: string) => (cycleEnd.get(cycleId) ?? '') >= today;
  const summary: HandoverSummary = { accounts: 0, plansMoved: 0, plansMerged: 0, plannedCalls: 0, tasks: 0, events: 0, reports: 0, samples: [] };

  const accounts = s.accounts.map((a) => {
    if (a.ownerId !== fromId || a.deletedAt) return a;
    summary.accounts++;
    return { ...a, ownerId: toId };
  });

  let plans = s.plans;
  for (const p of s.plans.filter((x) => x.ownerId === fromId && live(x.cycleId))) {
    const theirs = plans.find((x) => x.ownerId === toId && x.cycleId === p.cycleId);
    if (!theirs) {
      summary.plansMoved++;
      // The new owner checks it and sends it to their own manager.
      plans = plans.map((x) => (x.id === p.id ? { ...x, ownerId: toId, status: 'Draft', submittedAt: undefined, reviewedAt: undefined, reviewerId: undefined, reviewNote: undefined, updatedAt: nowIso } : x));
    } else {
      summary.plansMerged++;
      const by = new Map(theirs.targets.map((t) => [t.accountId, t.planned]));
      for (const t of p.targets) by.set(t.accountId, Math.min(50, (by.get(t.accountId) ?? 0) + t.planned));
      plans = plans
        .filter((x) => x.id !== p.id)
        .map((x) => (x.id === theirs.id ? { ...x, targets: [...by].map(([accountId, planned]) => ({ accountId, planned })), status: 'Draft', updatedAt: nowIso } : x));
    }
  }

  const coaches = new Set(managersOf(s.users, toId).map((u) => u.id));
  const calls = s.calls.map((c) => {
    if (c.ownerId !== fromId || c.status !== 'Planned') return c;
    summary.plannedCalls++;
    return { ...c, ownerId: toId, coachId: c.coachId && coaches.has(c.coachId) ? c.coachId : undefined, updatedAt: nowIso };
  });

  const tasks = (s.tasks ?? []).map((t) => {
    if (t.ownerId !== fromId || t.doneAt) return t;
    summary.tasks++;
    return { ...t, ownerId: toId };
  });

  const events = (s.events ?? []).map((e) => {
    if (e.ownerId !== fromId || e.status !== 'Planned') return e;
    summary.events++;
    return { ...e, ownerId: toId, updatedAt: nowIso };
  });

  const users = s.users.map((u) => {
    if (u.managerId !== fromId || u.deletedAt) return u;
    summary.reports++;
    return { ...u, managerId: toId };
  });

  // Sample stock: taken back from the person leaving and issued to the one taking over, batch by batch.
  const moves: SampleIssue[] = [];
  batchStock(s, fromId)
    .filter((b) => b.balance > 0)
    .forEach((b, i) => {
      summary.samples.push({ product: b.product, batch: b.batch, expiry: b.expiry, qty: b.balance });
      const base = { product: b.product, batch: b.batch, expiry: b.expiry, byId, at: nowIso };
      moves.push({ ...base, id: `hand-${fromId}-${nowIso}-${i}-out`, repId: fromId, qty: -b.balance, note: 'Handed over' });
      moves.push({ ...base, id: `hand-${fromId}-${nowIso}-${i}-in`, repId: toId, qty: b.balance, note: 'Handover' });
    });

  return { snapshot: { ...s, users, accounts, plans, calls, tasks, events, samples: [...(s.samples ?? []), ...moves] }, summary };
}

export function describeHandover(h: HandoverSummary): string[] {
  const n = (k: number, one: string, many = `${one}s`) => (k ? `${k} ${k === 1 ? one : many}` : '');
  const sampleUnits = h.samples.reduce((t, x) => t + x.qty, 0);
  return [
    n(h.accounts, 'account'),
    n(h.plansMoved, 'cycle plan'),
    h.plansMerged ? `${n(h.plansMerged, 'cycle plan')} merged into theirs` : '',
    n(h.plannedCalls, 'planned visit'),
    n(h.tasks, 'open task'),
    n(h.events, 'upcoming event'),
    n(h.reports, 'direct report'),
    sampleUnits ? `${sampleUnits} samples (${n(h.samples.length, 'batch', 'batches')})` : '',
  ].filter(Boolean);
}
