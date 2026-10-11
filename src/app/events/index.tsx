import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { todayKey } from '@/data/dates';
import { useMe, useStore } from '@/data/store';
import type { MeetingEvent } from '@/data/types';
import { EventStatusBadge, eventCounts, eventPlace, eventWhen, KIND_ICON, naira } from '@/ui/AccountEvents';
import { Button, Card, Empty, Kpi, KpiRow, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type Filter = 'Upcoming' | 'Past' | 'All';

/** Upcoming: on or after today and not yet held. Past: everything else. */
const isUpcoming = (e: MeetingEvent, today: string) => e.date >= today && e.status !== 'Done';

/** CMEs, round tables and other meetings: the person's own and (managers) their team's. */
export default function EventsScreen() {
  const me = useMe();
  const { data, canEdit, getUser, sync, syncNow } = useStore();
  const [filter, setFilter] = useState<Filter>('Upcoming');
  const today = todayKey();
  const events = useMemo(() => data.events ?? [], [data.events]);

  const shown = useMemo(() => {
    const list = events.filter((e) => (filter === 'All' ? true : filter === 'Upcoming' ? isUpcoming(e, today) : !isUpcoming(e, today)));
    // Upcoming soonest first; past and all newest first.
    const key = (e: MeetingEvent) => `${e.date} ${e.time ?? ''}`;
    return list.sort((a, b) => (filter === 'Upcoming' ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))));
  }, [events, filter, today]);

  const month = today.slice(0, 7);
  const summary = useMemo(() => {
    const inMonth = events.filter((e) => e.date.startsWith(month) && e.status !== 'Cancelled');
    const held = inMonth.filter((e) => e.status === 'Done');
    return {
      held: held.length,
      planned: inMonth.length - held.length,
      attended: held.reduce((n, e) => n + eventCounts(e).attended, 0),
      budget: inMonth.reduce((n, e) => n + (e.budget ?? 0), 0),
      spent: inMonth.reduce((n, e) => n + (e.spent ?? 0), 0),
    };
  }, [events, month]);
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  const newEvent = () => router.push('/events/edit');

  return (
    <Screen wide onRefresh={() => syncNow()} refreshing={sync.syncing}>
      <SectionTitle right={canEdit ? <Button small title="New event" icon="add" onPress={newEvent} /> : undefined}>{monthName} so far</SectionTitle>
      <KpiRow>
        <Kpi label="Events held" value={summary.held} sub={summary.planned ? `${summary.planned} more planned` : undefined} icon="checkmark-done-outline" />
        <Kpi label="Doctors attended" value={summary.attended} icon="people-outline" />
        <Kpi
          label="Spent"
          value={naira(summary.spent)}
          sub={summary.budget ? `of ${naira(summary.budget)} budget` : 'No budget set'}
          tone={summary.budget && summary.spent > summary.budget ? colors.danger : undefined}
          icon="wallet-outline"
        />
      </KpiRow>

      <View style={{ marginTop: space.lg }}>
        <Segmented options={['Upcoming', 'Past', 'All'] as Filter[]} value={filter} onChange={setFilter} />
      </View>

      {!shown.length && (
        <Empty
          icon="calendar-outline"
          title={filter === 'Upcoming' ? 'Nothing planned' : 'No events yet'}
          action={canEdit && filter !== 'Past' ? <Button small title="Plan an event" icon="add" onPress={newEvent} /> : undefined}
        >
          {filter === 'Upcoming' ? 'Plan a CME, round table or lunch & learn and invite your doctors.' : 'Events you have held show here.'}
        </Empty>
      )}

      <Grid>
        {shown.map((e) => {
          const c = eventCounts(e);
          const place = eventPlace(e);
          const organiser = e.ownerId !== me.id ? getUser(e.ownerId)?.name : undefined;
          return (
            <Card key={e.id} onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Ionicons name={KIND_ICON[e.kind]} size={20} color={colors.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={text.small}>{e.kind.toUpperCase()}</Text>
                  <Text style={text.title}>{e.title}</Text>
                </View>
                <EventStatusBadge status={e.status} />
              </Row>
              <View style={{ marginTop: space.sm, gap: 2 }}>
                <Text style={text.muted}>{eventWhen(e)}</Text>
                {!!place && <Text style={text.muted}>{place}</Text>}
                {!!organiser && <Text style={text.muted}>Organiser: {organiser}</Text>}
              </View>
              <Row gap={space.lg} style={{ marginTop: space.sm }}>
                <Count n={c.invited} label="invited" />
                <Count n={c.confirmed} label="confirmed" />
                <Count n={c.attended} label="attended" />
              </Row>
            </Card>
          );
        })}
      </Grid>
    </Screen>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <Text style={text.muted}>
      <Text style={[text.title, { fontVariant: ['tabular-nums'] }]}>{n}</Text> {label}
    </Text>
  );
}
