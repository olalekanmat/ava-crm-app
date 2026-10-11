import { useEffect, useMemo } from 'react';
import { NOTIFY_KINDS } from '@/data/alerts';
import { useStore } from '@/data/store';
import { notifyNewAlerts } from './alertNotify';
import { useAlerts } from './useAlerts';

/** Turns new approvals and decisions into phone notifications while the app runs. Renders nothing. */
export function AlertNotifier() {
  const { me, session } = useStore();
  const { alerts } = useAlerts();
  const items = useMemo(() => alerts.items.filter((i) => NOTIFY_KINDS.has(i.kind)), [alerts]);
  const key = items.map((i) => i.id).join('|');
  useEffect(() => {
    if (!me || session?.demo) return;
    const t = setTimeout(() => void notifyNewAlerts(me.id, items, true), 2000);
    return () => clearTimeout(t);
    // Only a change to the list should trigger a check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, me?.id]);
  return null;
}
