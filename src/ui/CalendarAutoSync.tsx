import { useEffect, useMemo } from 'react';
import { calendarItems } from '@/data/calendarItems';
import { useStore } from '@/data/store';
import { calendarSyncSupported, loadCalendarSync, saveCalendarSync, syncCalendar } from './calendarSync';

/**
 * Keeps the phone calendar in step with planned visits and events while the app runs, once the
 * person has turned calendar sync on (in Display & calendar). Renders nothing.
 */
export function CalendarAutoSync() {
  const { me, data, session } = useStore();
  const userId = session?.demo ? undefined : me?.id;
  const items = useMemo(() => (userId && calendarSyncSupported ? calendarItems(data, userId, new Date()) : []), [data, userId]);
  const key = useMemo(() => JSON.stringify(items), [items]);

  useEffect(() => {
    if (!calendarSyncSupported || !userId) return;
    const t = setTimeout(async () => {
      try {
        const s = await loadCalendarSync();
        if (!s.enabled || !s.calendarId) return;
        await syncCalendar(s.calendarId, items);
        await saveCalendarSync({ ...s, lastSynced: new Date().toISOString() });
      } catch {
        // Shown on the settings card next time it opens; nothing to interrupt here.
      }
    }, 5000);
    return () => clearTimeout(t);
    // Only a change to the entries should trigger a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId]);

  return null;
}
