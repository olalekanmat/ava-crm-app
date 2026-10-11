import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { manages } from '@/data/access';
import { addDays, toDateKey, todayKey } from '@/data/dates';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { ATTENDEE_STATUSES, type AttendeeStatus, type MeetingEvent } from '@/data/types';
import { ATTENDEE_STYLE, EventStatusBadge, eventCounts, eventPlace, eventWhen, KIND_ICON, naira } from '@/ui/AccountEvents';
import { Badge, Banner, Button, Card, Empty, ProgressBar, Row, SectionTitle, Segmented, text, type IconName } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** One event: details, budget, attendance (saved as you tap), and held / cancel / delete. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { data, canEdit, getAccount, getUser, run } = useStore();
  const event = (data.events ?? []).find((e) => e.id === id);

  if (!event) {
    return (
      <Screen>
        <Empty icon="calendar-outline" title="Event not found">It may have been deleted.</Empty>
      </Screen>
    );
  }

  const mayManage = canEdit && (event.ownerId === me.id || manages(data.users, me, event.ownerId));
  const counts = eventCounts(event);
  const place = eventPlace(event);
  const organiser = getUser(event.ownerId);
  const today = todayKey();

  const attempt = (f: () => void) => {
    try {
      f();
      return true;
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const saveEvent = (patch: Partial<MeetingEvent>) => attempt(() => run({ type: 'event.save', event: { ...event, ...patch } }));

  const setAttendance = (accountId: string, status: AttendeeStatus) =>
    saveEvent({ attendees: event.attendees.map((a) => (a.accountId === accountId ? { ...a, status } : a)) });

  /** A follow-up task for every account that attended (skips ones that already have this open task). */
  const createFollowUps = () => {
    const title = `Follow up after ${event.title}`;
    const due = toDateKey(addDays(new Date(), 7));
    const open = new Set((data.tasks ?? []).filter((t) => t.ownerId === event.ownerId && t.title === title && !t.doneAt).map((t) => t.accountId));
    let made = 0;
    for (const a of event.attendees) {
      if (a.status !== 'Attended' || open.has(a.accountId) || !getAccount(a.accountId) || getAccount(a.accountId)?.deletedAt) continue;
      const ok = attempt(() =>
        run({ type: 'task.save', task: { id: newId('tsk'), ownerId: event.ownerId, title, due, remindAt: '09:00', accountId: a.accountId, createdAt: new Date().toISOString() } }),
      );
      if (!ok) break;
      made++;
    }
    if (made) notify('Follow-ups added', `${made} follow-up task${made === 1 ? '' : 's'} due ${eventDateShort(due)}, with a reminder at 09:00. They are in Tasks.`);
  };

  const markHeld = () => {
    if (event.date > today) {
      notify('Not yet', `This event is on ${eventWhen(event)}. Mark it as held on the day or after.`);
      return;
    }
    const n = counts.attended;
    const held = (withTasks: boolean) => {
      if (saveEvent({ status: 'Done' }) && withTasks) createFollowUps();
    };
    if (!n) {
      confirm('Mark as held?', 'Nobody is marked as attended yet. You can still update attendance afterwards.', () => held(false), 'Mark as held');
      return;
    }
    const ask = `${n} ${n === 1 ? 'doctor' : 'doctors'} attended. Create a follow-up task for each, due in 7 days with a reminder at 09:00?`;
    if (Platform.OS === 'web') {
      if (!window.confirm('Mark as held?\n\nThe event is recorded as held and can no longer be deleted.')) return;
      held(window.confirm(`Follow-up calls\n\n${ask}`));
      return;
    }
    Alert.alert('Mark as held?', ask, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Held, no tasks', onPress: () => held(false) },
      { text: 'Held + follow-ups', onPress: () => held(true) },
    ]);
  };

  const cancelEvent = () =>
    confirm('Cancel this event?', `${event.title}, ${eventWhen(event)}. It stays on the list as cancelled. Let your invited doctors know.`, () => saveEvent({ status: 'Cancelled' }), 'Cancel event');

  const deleteEvent = () =>
    confirm('Delete this event?', `${event.title} and its invitation list are removed for everyone. This cannot be undone.`, () => {
      if (attempt(() => run({ type: 'event.delete', id: event.id }))) router.back();
    }, 'Delete');

  const share = async () => {
    const lines = [
      `You are invited: ${event.title}`,
      `${event.kind} · ${eventWhen(event)}`,
      place ? `Venue: ${place}` : '',
      event.products.length ? `Topics: ${event.products.join(', ')}` : '',
      organiser ? `Kindly confirm with ${organiser.name}.` : 'Kindly confirm your attendance.',
    ].filter(Boolean);
    const message = lines.join('\n');
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
        if (nav.share) await nav.share({ text: message });
        else window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
      } else await Share.share({ message });
    } catch {
      // Closed the share sheet.
    }
  };

  const budgetShare = event.budget ? (event.spent ?? 0) / event.budget : 0;
  const over = !!event.budget && (event.spent ?? 0) > event.budget;

  return (
    <Screen>
      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={styles.icon}>
            <Ionicons name={KIND_ICON[event.kind]} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={text.small}>{event.kind.toUpperCase()}</Text>
            <Text style={text.h2}>{event.title}</Text>
          </View>
          <EventStatusBadge status={event.status} />
        </Row>
        <View style={{ marginTop: space.md, gap: space.xs }}>
          <Line icon="calendar-outline">{eventWhen(event)}</Line>
          {!!place && <Line icon="location-outline">{place}</Line>}
          {!!organiser && <Line icon="person-outline">Organiser: {organiser.id === me.id ? 'you' : organiser.name}</Line>}
          <Line icon="people-outline">
            {counts.invited} invited · {counts.confirmed} confirmed · {counts.attended} attended
          </Line>
        </View>
        <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          {mayManage && <Button small variant="secondary" title="Edit" icon="create-outline" onPress={() => router.push({ pathname: '/events/edit', params: { id: event.id } })} />}
          {event.status !== 'Cancelled' && <Button small variant="secondary" title="Share invitation" icon="share-social-outline" onPress={share} />}
        </Row>
      </Card>

      {event.status === 'Cancelled' && <Banner tone="warn">This event was cancelled.</Banner>}

      {event.products.length > 0 && (
        <>
          <SectionTitle>Products</SectionTitle>
          <Row style={{ flexWrap: 'wrap' }}>
            {event.products.map((p) => (
              <Badge key={p} label={p} fg={colors.primary} bg={colors.primarySoft} />
            ))}
          </Row>
        </>
      )}

      {(event.budget !== undefined || event.spent !== undefined) && (
        <>
          <SectionTitle>Budget</SectionTitle>
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
              <Text style={text.title}>{naira(event.spent)} spent</Text>
              <Text style={text.muted}>{event.budget !== undefined ? `of ${naira(event.budget)}` : 'No budget set'}</Text>
            </Row>
            {!!event.budget && <ProgressBar value={budgetShare} color={over ? colors.danger : colors.success} />}
            {over && <Text style={[text.small, { color: colors.danger, marginTop: space.sm }]}>{naira((event.spent ?? 0) - event.budget!)} over budget</Text>}
            {!!event.budget && !over && event.spent !== undefined && <Text style={[text.small, { marginTop: space.sm }]}>{naira(event.budget - event.spent)} left</Text>}
          </Card>
        </>
      )}

      {!!event.notes && (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            <Text style={text.body}>{event.notes}</Text>
          </Card>
        </>
      )}

      <SectionTitle>Attendance</SectionTitle>
      {!event.attendees.length ? (
        <Empty icon="people-outline">{mayManage ? 'No one invited yet. Tap Edit to add doctors.' : 'No one invited.'}</Empty>
      ) : (
        <Card style={{ padding: 0 }}>
          {event.attendees.map((x) => {
            const a = getAccount(x.accountId);
            const editable = mayManage && event.status !== 'Cancelled';
            return (
              <View key={x.accountId} style={styles.attendee}>
                <Pressable onPress={a && !a.deletedAt ? () => router.push({ pathname: '/account/[id]', params: { id: x.accountId } }) : undefined} style={({ pressed }) => [styles.who, pressed && { opacity: 0.7 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{a?.name ?? 'Deleted account'}</Text>
                    {!!a && <Text style={text.muted}>{[a.specialty, a.city].filter(Boolean).join(' · ')}</Text>}
                  </View>
                  {!editable && <Badge label={x.status} {...ATTENDEE_STYLE[x.status]} />}
                  {!!a && !a.deletedAt && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
                </Pressable>
                {editable && <Segmented options={ATTENDEE_STATUSES} value={x.status} onChange={(s) => setAttendance(x.accountId, s)} />}
              </View>
            );
          })}
        </Card>
      )}

      {mayManage && (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          {event.status === 'Planned' && <Button title="Mark as held" icon="checkmark-done-outline" onPress={markHeld} />}
          {event.status === 'Planned' && <Button title="Cancel event" variant="secondary" icon="close-circle-outline" onPress={cancelEvent} />}
          {event.status === 'Cancelled' && <Button title="Plan it again" variant="secondary" icon="refresh-outline" onPress={() => saveEvent({ status: 'Planned' })} />}
          {event.status !== 'Done' && <Button title="Delete" variant="danger" icon="trash-outline" onPress={deleteEvent} />}
        </View>
      )}
      {event.status === 'Done' && mayManage && <Text style={[text.small, { marginTop: space.sm }]}>A held event stays on record. You can still edit the spend and attendance.</Text>}
    </Screen>
  );
}

const eventDateShort = (d: string) => eventWhen({ date: d });

function Line({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <Row>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={[text.body, { flex: 1 }]}>{children}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  attendee: { paddingTop: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.md },
});
