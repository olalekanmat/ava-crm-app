import { isAdmin, manages, scopeSnapshot } from './access';
import { computeAlerts, NOTIFY_KINDS, type AlertItem } from './alerts';
import type { Snapshot, User } from './types';

/** The alerts worth a phone notification for this person (approvals and decisions), from the whole company's data. */
export function notifiableAlerts(full: Snapshot, user: User, now = new Date()): AlertItem[] {
  const s = scopeSnapshot(full, user);
  const admin = isAdmin(user);
  const accountName = (id: string) => s.accounts.find((a) => a.id === id)?.name ?? 'Account';
  const { items } = computeAlerts(
    {
      calls: s.calls, plans: s.plans, userId: user.id, reviewable: s.users.filter((u) => u.managerId === user.id).map((u) => u.id), accountName, leaves: s.leaves ?? [],
      accountChanges: s.accountChanges ?? [], accounts: s.accounts, canReviewAccount: (ownerId) => admin || manages(s.users, user, ownerId), tasks: s.tasks ?? [], events: s.events ?? [],
    },
    now,
  );
  return items.filter((i) => NOTIFY_KINDS.has(i.kind));
}

/** Where tapping the notification for an alert should open. */
export function alertRoute(i: AlertItem): string {
  switch (i.kind) {
    case 'account-review':
    case 'account-new':
    case 'change-decided':
      return '/approvals';
    case 'task-assigned':
      return '/tasks';
    case 'leave-review':
    case 'leave-decided':
      return '/leave';
    case 'event-soon':
      return i.eventId ? `/events/${i.eventId}` : '/events';
    default:
      return i.planId ? `/plan/${i.planId}` : '/';
  }
}
