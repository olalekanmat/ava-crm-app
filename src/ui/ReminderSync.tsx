import { useEffect } from 'react';
import { useStore } from '@/data/store';
import { syncReminders } from './reminders';

/** Keeps this phone's task reminders in step with the signed-in person's tasks. Renders nothing. */
export function ReminderSync() {
  const { me, data, getAccount } = useStore();
  const tasks = data.tasks;
  useEffect(() => {
    if (!me) return;
    const t = setTimeout(() => {
      syncReminders(tasks ?? [], me.id, (id) => getAccount(id)?.name ?? 'Account').catch((e) => console.warn('Reminders not scheduled', e));
    }, 1500);
    return () => clearTimeout(t);
  }, [me, tasks, getAccount]);
  return null;
}
