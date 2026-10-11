import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { addDays, parseLocal, toDateKey } from '@/data/dates';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { EVENT_KINDS, type EventKind, type MeetingEvent } from '@/data/types';
import { naira } from '@/ui/AccountEvents';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SearchBox, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** "450,000" or "₦450000" → 450000; blank → undefined; anything else → NaN. */
function parseAmount(v: string): number | undefined {
  const s = v.replace(/[₦,\s]/g, '');
  if (!s) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
}

/** Plan a new event (no params) or edit one (?id=). */
export default function EditEventScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const me = useMe();
  const { data, accounts, products, canEdit, getAccount, getUser, run } = useStore();
  const existing = params.id ? (data.events ?? []).find((e) => e.id === params.id) : undefined;
  const team = useMemo(() => (me.role === 'Rep' ? [] : repsUnder(data.users, me).filter((u) => u.active && u.id !== me.id)), [data.users, me]);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<EventKind>(existing?.kind ?? 'CME');
  const [date, setDate] = useState(existing?.date ?? toDateKey(addDays(new Date(), 7)));
  const [time, setTime] = useState(existing?.time ?? '18:00');
  const [venue, setVenue] = useState(existing?.venue ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [chosen, setChosen] = useState<string[]>(existing?.products ?? []);
  const [budget, setBudget] = useState(existing?.budget !== undefined ? String(existing.budget) : '');
  const [spent, setSpent] = useState(existing?.spent !== undefined ? String(existing.spent) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [attendees, setAttendees] = useState<MeetingEvent['attendees']>(existing?.attendees ?? []);
  const [ownerId, setOwnerId] = useState(existing?.ownerId ?? me.id);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const invited = useMemo(() => new Set(attendees.map((a) => a.accountId)), [attendees]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return accounts
      .filter((a) => !invited.has(a.id) && (me.role === 'Rep' ? a.ownerId === me.id : true))
      .filter((a) => a.name.toLowerCase().includes(q) || a.specialty.toLowerCase().includes(q) || a.city.toLowerCase().includes(q))
      .slice(0, 12);
  }, [accounts, query, invited, me]);

  if (params.id && !existing) {
    return (
      <Screen>
        <Empty icon="calendar-outline" title="Event not found">It may have been deleted.</Empty>
      </Screen>
    );
  }

  // Products to choose from: active ones, plus any already on the event.
  const productNames = [...new Set([...products.map((p) => p.name), ...chosen])];
  const toggleProduct = (p: string) => setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]));
  const invite = (accountId: string) => {
    setAttendees((list) => [...list, { accountId, status: 'Invited' }]);
    setQuery('');
  };
  const uninvite = (accountId: string) => setAttendees((list) => list.filter((a) => a.accountId !== accountId));

  const save = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Give the event a title.';
    else if (title.trim().length > 120) errs.title = 'Keep the title to 120 characters.';
    if (!parseLocal(date, time.trim() || '00:00')) errs.when = time.trim() ? 'Use date YYYY-MM-DD and time HH:MM.' : 'Use YYYY-MM-DD for the date.';
    const b = parseAmount(budget);
    const s = parseAmount(spent);
    if (Number.isNaN(b)) errs.budget = 'Enter an amount in naira, e.g. 450000.';
    if (Number.isNaN(s)) errs.spent = 'Enter an amount in naira, e.g. 380000.';
    if (chosen.length > 10) errs.products = 'Choose up to 10 products.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      notify('Check the form', Object.values(errs)[0]);
      return;
    }

    const id = existing?.id ?? newId('evt');
    const now = new Date().toISOString();
    try {
      run({
        type: 'event.save',
        event: {
          id,
          title: title.trim(),
          kind,
          date,
          time: time.trim() || undefined,
          venue: venue.trim() || undefined,
          city: city.trim() || undefined,
          ownerId,
          products: chosen,
          budget: b,
          spent: s,
          status: existing?.status ?? 'Planned',
          attendees,
          notes: notes.trim() || undefined,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        },
      });
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
      return;
    }
    if (existing) router.back();
    else router.replace({ pathname: '/events/[id]', params: { id } });
  };

  const setDay = (d: Date) => setDate(toDateKey(d));

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit event' : 'New event' }} />
      {!canEdit && <Banner tone="warn">Your licence is read-only, so changes cannot be saved.</Banner>}

      {!existing && team.length > 0 && (
        <>
          <Label>Organiser</Label>
          <View style={styles.wrap}>
            <Chip label="Me" selected={ownerId === me.id} onPress={() => setOwnerId(me.id)} />
            {team.map((u) => (
              <Chip key={u.id} label={u.name} selected={ownerId === u.id} onPress={() => setOwnerId(u.id)} />
            ))}
          </View>
        </>
      )}
      {existing && existing.ownerId !== me.id && <Text style={[text.muted, { marginBottom: space.md }]}>Organiser: {getUser(existing.ownerId)?.name ?? 'Unknown'}</Text>}

      <Field label="Title *" value={title} onChangeText={setTitle} placeholder="e.g. Hypertension update for GPs" error={errors.title} maxLength={120} />

      <Label>Kind</Label>
      <View style={styles.wrap}>
        {EVENT_KINDS.map((k) => (
          <Chip key={k} label={k} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Date *" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Time" value={time} onChangeText={setTime} placeholder="HH:MM" />
        </View>
      </View>
      <View style={[styles.wrap, { marginTop: -space.sm }]}>
        <Chip label="Tomorrow" icon="time-outline" onPress={() => setDay(addDays(new Date(), 1))} />
        <Chip label="Next week" onPress={() => setDay(addDays(new Date(), 7))} />
        <Chip label="In 2 weeks" onPress={() => setDay(addDays(new Date(), 14))} />
        <Chip label="13:00 lunch" selected={time === '13:00'} onPress={() => setTime('13:00')} />
        <Chip label="18:00 evening" selected={time === '18:00'} onPress={() => setTime('18:00')} />
      </View>
      {!!errors.when && <Text style={styles.error}>{errors.when}</Text>}

      <View style={styles.row}>
        <View style={{ flex: 3 }}>
          <Field label="Venue" value={venue} onChangeText={setVenue} placeholder="e.g. Eko Hotel, Victoria Island" />
        </View>
        <View style={{ flex: 2 }}>
          <Field label="City" value={city} onChangeText={setCity} placeholder="e.g. Lagos" />
        </View>
      </View>

      {productNames.length > 0 && (
        <>
          <Label>Products</Label>
          <View style={styles.wrap}>
            {productNames.map((p) => (
              <Chip key={p} label={p} selected={chosen.includes(p)} onPress={() => toggleProduct(p)} />
            ))}
          </View>
          {!!errors.products && <Text style={styles.error}>{errors.products}</Text>}
        </>
      )}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="Budget (₦)"
            value={budget}
            onChangeText={setBudget}
            keyboardType="number-pad"
            placeholder="e.g. 450000"
            error={errors.budget}
            hint={parseAmount(budget) ? naira(parseAmount(budget)) : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Spent (₦)"
            value={spent}
            onChangeText={setSpent}
            keyboardType="number-pad"
            placeholder="Fill in after the event"
            error={errors.spent}
            hint={parseAmount(spent) ? naira(parseAmount(spent)) : undefined}
          />
        </View>
      </View>

      <Label>Invitations ({attendees.length})</Label>
      <SearchBox value={query} onChangeText={setQuery} placeholder={me.role === 'Rep' ? 'Search your accounts to invite' : 'Search your team’s accounts to invite'} />
      {matches.map((a) => (
        <Card key={a.id} onPress={() => invite(a.id)} style={{ paddingVertical: space.md }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{a.name}</Text>
              <Text style={text.muted}>
                {a.specialty} · {a.city}
                {a.ownerId !== me.id ? ` · ${getUser(a.ownerId)?.name ?? ''}` : ''}
              </Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          </Row>
        </Card>
      ))}
      {!!query.trim() && !matches.length && <Text style={[text.muted, { marginBottom: space.md }]}>No accounts match.</Text>}
      {attendees.length > 0 ? (
        <Card style={{ padding: 0 }}>
          {attendees.map((x) => {
            const a = getAccount(x.accountId);
            return (
              <Row key={x.accountId} style={styles.invitee}>
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>{a?.name ?? 'Deleted account'}</Text>
                  <Text style={text.muted}>
                    {a?.specialty ?? ''}
                    {x.status !== 'Invited' ? ` · ${x.status}` : ''}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${a?.name ?? 'account'}`} hitSlop={10} onPress={() => uninvite(x.accountId)}>
                  <Ionicons name="close-circle" size={22} color={colors.faint} />
                </Pressable>
              </Row>
            );
          })}
        </Card>
      ) : (
        <Text style={[text.small, { marginBottom: space.md }]}>Search above to add doctors and hospitals. You can add more later.</Text>
      )}

      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Speaker, agenda, catering, anything to remember" />

      <View style={styles.actions}>
        <Button title="Save" icon="checkmark-circle-outline" onPress={save} disabled={!canEdit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  error: { color: colors.danger, fontSize: 12, marginBottom: space.sm },
  invitee: { paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
});
