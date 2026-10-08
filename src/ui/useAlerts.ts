import { useMemo } from 'react';
import { computeAlerts, openFollowUps } from '@/data/alerts';
import { useStore } from '@/data/store';

/** The signed-in person's alerts (header bell and the My alerts tile) and open follow-ups (My tasks). */
export function useAlerts() {
  const { me, calls, data, getAccount } = useStore();
  return useMemo(() => {
    const userId = me?.id ?? '';
    const reviewable = data.users.filter((u) => u.managerId === userId).map((u) => u.id);
    const alerts = computeAlerts({ calls, plans: data.plans, userId, reviewable, accountName: (id) => getAccount(id)?.name ?? 'Account' });
    const tasks = openFollowUps(calls, userId);
    return { alerts, tasks };
  }, [me?.id, calls, data.plans, data.users, getAccount]);
}
