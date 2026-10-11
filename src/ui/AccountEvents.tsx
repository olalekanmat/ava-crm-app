import { router } from 'expo-router';
import { View } from 'react-native';
import { useStore } from '@/data/store';
import type { AttendeeStatus, EventKind, EventStatus, MeetingEvent } from '@/data/types';
import { Badge, Card, ListRow, SectionTitle, type IconName } from './components';
import { colors } from './theme';

// ----- shared helpers for the Events screens (2.7) -----

/** ₦450,000 */
export function naira(n: number | undefined): string {
  const v = Math.round(n ?? 0);
  return `${v < 0 ? '-' : ''}₦${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "Sat 14 Nov 2026" from YYYY-MM-DD, read as a local date. */
export function eventDate(date: string, long = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString('en-GB', long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

/** "Sat 14 Nov 2026 · 18:00" */
export const eventWhen = (e: Pick<MeetingEvent, 'date' | 'time'>) => (e.time ? `${eventDate(e.date)} · ${e.time}` : eventDate(e.date));

/** "Eko Hotel, Lagos" */
export const eventPlace = (e: Pick<MeetingEvent, 'venue' | 'city'>) => [e.venue, e.city].filter(Boolean).join(', ');

export const KIND_ICON: Record<EventKind, IconName> = {
  CME: 'school-outline',
  'Round table': 'people-circle-outline',
  'Lunch & learn': 'restaurant-outline',
  Symposium: 'mic-outline',
  Webinar: 'videocam-outline',
  Other: 'calendar-outline',
};

export const EVENT_STATUS_STYLE: Record<EventStatus, { fg: string; bg: string; label: string }> = {
  Planned: { fg: colors.primary, bg: colors.primarySoft, label: 'Planned' },
  Done: { fg: colors.success, bg: colors.successSoft, label: 'Held' },
  Cancelled: { fg: colors.muted, bg: colors.sunken, label: 'Cancelled' },
};

export const ATTENDEE_STYLE: Record<AttendeeStatus, { fg: string; bg: string }> = {
  Invited: { fg: colors.muted, bg: colors.sunken },
  Confirmed: { fg: colors.primary, bg: colors.primarySoft },
  Attended: { fg: colors.success, bg: colors.successSoft },
  'No-show': { fg: colors.warn, bg: colors.warnSoft },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const s = EVENT_STATUS_STYLE[status];
  return <Badge label={s.label} fg={s.fg} bg={s.bg} />;
}

/** Invited, confirmed (including those who then came) and attended. */
export function eventCounts(e: Pick<MeetingEvent, 'attendees'>) {
  const n = (...st: AttendeeStatus[]) => e.attendees.filter((a) => st.includes(a.status)).length;
  return { invited: e.attendees.length, confirmed: n('Confirmed', 'Attended'), attended: n('Attended') };
}

// ----- account page section -----

/** The events an account was invited to, newest first, with their attendance. Renders nothing when there are none. */
export function AccountEvents({ accountId }: { accountId: string }) {
  const { data } = useStore();
  const events = (data.events ?? [])
    .map((e) => ({ e, a: e.attendees.find((x) => x.accountId === accountId) }))
    .filter((x): x is { e: MeetingEvent; a: MeetingEvent['attendees'][number] } => !!x.a)
    .sort((x, y) => y.e.date.localeCompare(x.e.date));
  if (!events.length) return null;
  return (
    <View>
      <SectionTitle>Events</SectionTitle>
      <Card style={{ padding: 0 }}>
        {events.map(({ e, a }) => {
          const st = e.status === 'Cancelled' ? EVENT_STATUS_STYLE.Cancelled : { label: a.status, ...ATTENDEE_STYLE[a.status] };
          return (
            <ListRow
              key={e.id}
              icon={KIND_ICON[e.kind]}
              title={e.title}
              subtitle={`${e.kind} · ${eventWhen(e)}`}
              right={<Badge label={st.label} fg={st.fg} bg={st.bg} />}
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })}
            />
          );
        })}
      </Card>
    </View>
  );
}
