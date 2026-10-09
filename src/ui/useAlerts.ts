import { useMemo } from 'react';
import { computeAlerts, openTodos } from '@/data/alerts';
import { useStore } from '@/data/store';

/** The signed-in person's alerts (header bell and the My alerts tile) and open tasks and follow-ups (My tasks). */
export function useAlerts() {
  const { me, calls, data, getAccount } = useStore();
  return useMemo(() => {
    const userId = me?.id ?? '';
    const reviewable = data.users.filter((u) => u.managerId === userId).map((u) => u.id);
    const accountName = (id: string) => getAccount(id)?.name ?? 'Account';
    const alerts = computeAlerts({ calls, plans: data.plans, userId, reviewable, accountName, leaves: data.leaves ?? [] });
    const tasks = openTodos(data.tasks ?? [], calls, userId, new Date(), 7, accountName);
    return { alerts, tasks };
  }, [me?.id, calls, data.plans, data.users, data.leaves, data.tasks, getAccount]);
}
