import { calendarState } from './calendar';
import { toDateKey } from './dates';
import type { Call, CyclePlan, Leave, PlanTarget, Task } from './types';

/** Calls should be recorded (submitted) within this long of the visit, for compliance. */
export const RECORD_WITHIN_MS = 24 * 60 * 60 * 1000;

export type AlertLevel = 'urgent' | 'important' | 'normal';

export interface AlertItem {
  id: string;
  level: AlertLevel;
  kind: 'overdue' | 'draft-late' | 'draft' | 'plan-returned' | 'plan-review' | 'leave-review' | 'leave-decided';
  title: string;
  /** The call or plan the alert is about. */
  callId?: string;
  planId?: string;
  accountId?: string;
  at: string;
}

export interface AlertSummary {
  items: AlertItem[];
  urgent: number;
  important: number;
  normal: number;
}

/**
 * Things that need the person's attention, most urgent first:
 * - urgent: planned visits whose day has passed, and drafts not submitted within 24 hours of the visit;
 * - important: their cycle plan sent back for changes, and (managers) plans waiting for their review;
 * - normal: drafts still inside the 24-hour window.
 * `calls` and `plans` are what the person can see; only their own calls count, plus plans to review
 * from `reviewable` owners (the reps who report to them).
 */
export function computeAlerts(
  { calls, plans, userId, reviewable = [], accountName = () => 'Account', leaves = [] }: { calls: Call[]; plans: CyclePlan[]; userId: string; reviewable?: string[]; accountName?: (id: string) => string; leaves?: Leave[] },
  now = new Date(),
): AlertSummary {
  const items: AlertItem[] = [];
  for (const c of calls) {
    if (c.ownerId !== userId || c.status === 'Submitted') continue;
    const name = accountName(c.accountId);
    if (c.status === 'Saved') {
      const late = now.getTime() - Date.parse(c.datetime) > RECORD_WITHIN_MS;
      items.push({ id: `d:${c.id}`, level: late ? 'urgent' : 'normal', kind: late ? 'draft-late' : 'draft', title: late ? `Draft not submitted within 24 h · ${name}` : `Draft to submit · ${name}`, callId: c.id, accountId: c.accountId, at: c.datetime });
    } else if (calendarState(c, now) === 'overdue') {
      items.push({ id: `o:${c.id}`, level: 'urgent', kind: 'overdue', title: `Planned visit overdue · ${name}`, callId: c.id, accountId: c.accountId, at: c.datetime });
    }
  }
  const review = new Set(reviewable);
  for (const p of plans) {
    if (p.ownerId === userId && p.status === 'Rejected') items.push({ id: `r:${p.id}`, level: 'important', kind: 'plan-returned', title: 'Your cycle plan was sent back for changes', planId: p.id, at: p.reviewedAt ?? p.updatedAt });
    if (review.has(p.ownerId) && p.status === 'Submitted') items.push({ id: `a:${p.id}`, level: 'important', kind: 'plan-review', title: 'A cycle plan is waiting for your approval', planId: p.id, at: p.submittedAt ?? p.updatedAt });
  }
  // Leave (2.5): requests waiting for this manager, and this person's requests decided in the last week.
  for (const l of leaves) {
    if (review.has(l.userId) && l.status === 'Pending') items.push({ id: `lv:${l.id}`, level: 'important', kind: 'leave-review', title: `A leave request is waiting for your approval (${l.start} to ${l.end})`, at: l.createdAt });
    if (l.userId === userId && (l.status === 'Approved' || l.status === 'Rejected') && l.reviewedAt && now.getTime() - Date.parse(l.reviewedAt) < 7 * 864e5)
      items.push({ id: `ld:${l.id}`, level: 'normal', kind: 'leave-decided', title: `Your leave from ${l.start} was ${l.status === 'Approved' ? 'approved' : 'declined'}`, at: l.reviewedAt });
  }
  const rank = { urgent: 0, important: 1, normal: 2 } as const;
  items.sort((a, b) => rank[a.level] - rank[b.level] || a.at.localeCompare(b.at));
  return {
    items,
    urgent: items.filter((i) => i.level === 'urgent').length,
    important: items.filter((i) => i.level === 'important').length,
    normal: items.filter((i) => i.level === 'normal').length,
  };
}

export interface FollowUp {
  call: Call;
  due: string;
  overdue: boolean;
}

/**
 * Follow-ups the person promised in submitted calls that are not done yet: due within `days` days
 * or already overdue. A follow-up counts as done once a later call to the same account is submitted.
 */
export function openFollowUps(calls: Call[], userId: string, now = new Date(), days = 7): { overdue: FollowUp[]; current: FollowUp[] } {
  const today = toDateKey(now);
  const horizon = toDateKey(new Date(now.getTime() + days * 864e5));
  const lastSubmitted = new Map<string, string>();
  for (const c of calls) if (c.ownerId === userId && c.status === 'Submitted' && (lastSubmitted.get(c.accountId) ?? '') < c.datetime) lastSubmitted.set(c.accountId, c.datetime);
  const out = { overdue: [] as FollowUp[], current: [] as FollowUp[] };
  for (const c of calls) {
    if (c.ownerId !== userId || c.status !== 'Submitted' || !c.followUpDate) continue;
    if ((lastSubmitted.get(c.accountId) ?? '') > c.datetime) continue;
    if (c.followUpDate < today) out.overdue.push({ call: c, due: c.followUpDate, overdue: true });
    else if (c.followUpDate <= horizon) out.current.push({ call: c, due: c.followUpDate, overdue: false });
  }
  out.overdue.sort((a, b) => a.due.localeCompare(b.due));
  out.current.sort((a, b) => a.due.localeCompare(b.due));
  return out;
}

/** One open to-do: a task (2.5) or a follow-up promised in a call that has no task of its own. */
export interface TodoItem {
  id: string;
  title: string;
  due: string;
  overdue: boolean;
  accountId?: string;
  task?: Task;
  call?: Call;
}

/** Open tasks and call follow-ups, overdue and due within `days` days, soonest first. */
export function openTodos(tasks: Task[], calls: Call[], userId: string, now = new Date(), days = 7, accountName: (id: string) => string = () => 'account'): { overdue: TodoItem[]; current: TodoItem[] } {
  const today = toDateKey(now);
  const horizon = toDateKey(new Date(now.getTime() + days * 864e5));
  const withTask = new Set(tasks.map((t) => t.callId).filter(Boolean));
  const items: TodoItem[] = [];
  for (const t of tasks) if (t.ownerId === userId && !t.doneAt && t.due <= horizon) items.push({ id: t.id, title: t.title, due: t.due, overdue: t.due < today, accountId: t.accountId, task: t });
  const f = openFollowUps(calls, userId, now, days);
  for (const x of [...f.overdue, ...f.current]) {
    if (withTask.has(x.call.id)) continue;
    items.push({ id: `f:${x.call.id}`, title: x.call.nextStep ? `${x.call.nextStep} · ${accountName(x.call.accountId)}` : `Follow up ${accountName(x.call.accountId)}`, due: x.due, overdue: x.overdue, accountId: x.call.accountId, call: x.call });
  }
  items.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
  return { overdue: items.filter((i) => i.overdue), current: items.filter((i) => !i.overdue) };
}

export type Pace = 'onTrack' | 'atRisk' | 'behind';

/** Same thresholds as the pace colours: on track at 95% of where you should be by now, at risk from 70%. */
export function paceOf(done: number, planned: number, elapsed: number): Pace {
  if (planned <= 0) return 'onTrack';
  const value = done / planned;
  if (value >= 1 || value >= elapsed * 0.95) return 'onTrack';
  if (value >= elapsed * 0.7) return 'atRisk';
  return 'behind';
}

/** How many plan targets are on track, at risk and behind, given calls done per account. */
export function planHealth(targets: PlanTarget[], done: (accountId: string) => number, elapsed: number): Record<Pace, number> {
  const out = { onTrack: 0, atRisk: 0, behind: 0 };
  for (const t of targets) out[paceOf(done(t.accountId), t.planned, elapsed)]++;
  return out;
}
