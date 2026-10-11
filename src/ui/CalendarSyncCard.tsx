import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { calendarItems } from '@/data/calendarItems';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import {
  calendarSyncSupported,
  downloadIcs,
  listWritableCalendars,
  loadCalendarSync,
  saveCalendarSync,
  stopCalendarSync,
  syncCalendar,
  type CalendarSyncSettings,
  type WritableCalendar,
} from './calendarSync';
import { Banner, Button, Card, Chip, Label, Row, SectionTitle, ToggleRow, text } from './components';
import { notify } from './confirm';
import { colors, space } from './theme';

/** Re-sync this long after the person's planned visits or events last changed. */
const DEBOUNCE_MS = 3000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Settings card: puts the person's planned visits and the events they organise into the calendar
 * they choose on their phone (their Outlook or Google work calendar), and keeps it up to date.
 * On the web, where browsers cannot write to a calendar, it offers a calendar file instead.
 */
export function CalendarSyncCard() {
  const { me, data } = useStore();
  const userId = me?.id;
  // Recomputed when the data changes; `key` only changes when the calendar would.
  const items = useMemo(() => (userId ? calendarItems(data, userId, new Date()) : []), [data, userId]);
  const key = useMemo(() => JSON.stringify(items), [items]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [settings, setSettings] = useState<CalendarSyncSettings | null>(null);
  const [calendars, setCalendars] = useState<WritableCalendar[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);

  useEffect(() => {
    loadCalendarSync().then(setSettings);
  }, []);

  const update = useCallback(async (next: CalendarSyncSettings) => {
    setSettings(next);
    await saveCalendarSync(next).catch(() => {});
  }, []);

  const showCalendars = useCallback((list: WritableCalendar[]) => {
    setCalendars(list);
    setError(list.length ? undefined : 'No calendar on this phone can be changed. Add your Outlook or Google account to the phone’s calendar first.');
  }, []);

  const loadCalendars = useCallback(async () => {
    try {
      const list = await listWritableCalendars();
      showCalendars(list);
      return list;
    } catch (e) {
      setError(message(e));
      return [];
    }
  }, [showCalendars]);

  // Show the choice of calendars again when the card opens with sync on.
  useEffect(() => {
    if (!calendarSyncSupported || !settings?.enabled) return;
    listWritableCalendars()
      .then(showCalendars)
      .catch((e) => setError(message(e)));
  }, [settings?.enabled, showCalendars]);

  const syncNow = useCallback(
    async (s: CalendarSyncSettings, quiet = false) => {
      if (!s.enabled || !s.calendarId || running.current) return;
      running.current = true;
      setBusy(true);
      try {
        await syncCalendar(s.calendarId, itemsRef.current);
        setError(undefined);
        await update({ ...s, lastSynced: new Date().toISOString() });
      } catch (e) {
        setError(message(e));
        if (!quiet) notify('Calendar not updated', message(e));
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [update],
  );

  // Keep the calendar in step when planned visits or events change.
  useEffect(() => {
    if (!calendarSyncSupported || !settings?.enabled || !settings.calendarId) return;
    const t = setTimeout(() => void syncNow(settings, true), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // Only the list of entries and the chosen calendar should trigger a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings?.enabled, settings?.calendarId]);

  const toggle = async (on: boolean) => {
    if (!settings) return;
    if (on) {
      const list = await loadCalendars();
      if (!list.length) return;
      const keep = list.find((c) => c.id === settings.calendarId);
      await update({ ...settings, enabled: true, calendarId: keep?.id ?? (list.length === 1 ? list[0].id : undefined) });
    } else {
      setBusy(true);
      try {
        await stopCalendarSync();
      } catch (e) {
        notify('Could not remove the visits', message(e));
      } finally {
        setBusy(false);
      }
      setError(undefined);
      await update({ enabled: false, calendarId: settings.calendarId });
    }
  };

  const download = async () => {
    try {
      await downloadIcs(items);
    } catch (e) {
      notify('Calendar file not saved', message(e));
    }
  };

  const count = `${items.length} planned visit${items.length === 1 ? '' : 's'} and event${items.length === 1 ? '' : 's'} in the next 60 days`;

  if (!calendarSyncSupported) {
    return (
      <>
        <SectionTitle>Calendar</SectionTitle>
        <Card>
          <Text style={text.title}>Add my visits to my calendar</Text>
          <Text style={[text.muted, { marginTop: space.xs, marginBottom: space.md }]}>
            Browsers cannot add events to your calendar. Use the Ava CRM app on your phone to keep your Outlook or Google calendar up to date automatically, or download a calendar file and import it: in
            Outlook, File › Open & Export › Import/Export (or Add calendar › Upload from file on the web); in Google Calendar, Settings › Import & export.
          </Text>
          <Button title="Download calendar file (.ics)" icon="download-outline" variant="secondary" onPress={download} disabled={!items.length} />
          <Text style={[text.small, { marginTop: space.sm }]}>{items.length ? `${count}. Importing a newer file updates the same entries.` : 'You have no planned visits or events in the next 60 days.'}</Text>
        </Card>
      </>
    );
  }

  if (!settings) return null;
  const chosen = calendars.find((c) => c.id === settings.calendarId);

  return (
    <>
      <SectionTitle>Calendar</SectionTitle>
      <Card>
        <ToggleRow
          label="Add my visits to my calendar"
          value={settings.enabled}
          onChange={(v) => void toggle(v)}
          hint="Your planned visits and the events you organise appear in the calendar you choose, and change when you change them in Ava CRM. Turning this off removes them."
        />
        {!!error && <Banner tone="warn">{error}</Banner>}
        {settings.enabled && (
          <>
            <Label>Calendar to use</Label>
            {!calendars.length && !error && <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start', marginBottom: space.sm }} />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {calendars.map((c) => (
                <Chip
                  key={c.id}
                  label={c.account && c.account !== c.title ? `${c.title} · ${c.account}` : c.title}
                  icon={c.isPrimary ? 'star-outline' : 'calendar-outline'}
                  selected={c.id === settings.calendarId}
                  onPress={() => void update({ ...settings, calendarId: c.id })}
                />
              ))}
            </View>
            {!settings.calendarId && !!calendars.length && <Text style={[text.small, { marginBottom: space.sm }]}>Choose your work calendar, for example your Outlook or Google account.</Text>}
            <Row style={{ marginTop: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={text.muted}>{count}</Text>
                <Text style={text.small}>
                  {busy ? 'Updating your calendar…' : settings.lastSynced ? `Last updated ${formatDateTime(settings.lastSynced)}${chosen ? ` in ${chosen.title}` : ''}` : 'Not updated yet'}
                </Text>
              </View>
              <Button small title="Sync now" icon="sync-outline" variant="secondary" disabled={busy || !settings.calendarId} onPress={() => void syncNow(settings)} />
            </Row>
          </>
        )}
      </Card>
    </>
  );
}
