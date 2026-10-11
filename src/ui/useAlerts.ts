import { useMemo } from 'react';
import { manages } from '@/data/access';
import { computeAlerts, openTodos } from '@/data/alerts';
import { useStore } from '@/data/store';

/** The signed-in person's alerts (header bell and the My alerts tile) and open tasks and follow-ups (My tasks). */
export function useAlerts() {
  const { me, calls, data, getAccount, admin } = useStore();
  return useMemo(() => {
    const userId = me?.id ?? '';
    const reviewable = data.users.filter((u) => u.managerId === userId).map((u) => u.id);
    const accountName = (id: string) => getAccount(id)?.name ?? 'Account';
    const canReviewAccount = (ownerId: string) => !!me && (admin || manages(data.users, me, ownerId));
    const alerts = computeAlerts({
      calls, plans: data.plans, userId, reviewable, accountName, leaves: data.leaves ?? [],
      accountChanges: data.accountChanges ?? [], accounts: data.accounts, canReviewAccount, tasks: data.tasks ?? [], events: data.events ?? [],
    });
    const tasks = openTodos(data.tasks ?? [], calls, userId, new Date(), 7, accountName);
    return { alerts, tasks };
  }, [me, admin, calls, data.plans, data.users, data.leaves, data.tasks, data.accountChanges, data.accounts, data.events, getAccount]);
}
