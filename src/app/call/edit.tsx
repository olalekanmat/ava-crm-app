import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { CallNoteAssist } from '@/ai/CallNoteAssist';
import { addDays, parseLocal, timeKey, toDateKey } from '@/data/dates';
import { distanceM, formatDistance, hasLocation } from '@/data/geo';
import { newId } from '@/data/ids';
import { callProblems, managersOf } from '@/data/mutations';
import { sampleStock } from '@/data/samples';
import { useMe, useStore } from '@/data/store';
import { CHANNELS, type CallChannel, type CallStatus, type GeoTag, type SampleGiven } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SearchBox, ToggleRow, text, type IconName } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { currentFix } from '@/ui/location';
import { Screen } from '@/ui/Screen';
import { remindersSupported } from '@/ui/reminders';
import { colors, radius, space } from '@/ui/theme';

/** Create a call (optionally for ?accountId=, or ?plan=1 to schedule one) or edit an unsubmitted one (?id=). */
export default function EditCallScreen() {
  const params = useLocalSearchParams<{ id?: string; accountId?: string; plan?: string }>();
  const me = useMe();
  const { accounts, products, data, getAccount, getCall, run } = useStore();
  const existing = params.id ? getCall(params.id) : undefined;
  const start = existing ? new Date(existing.datetime) : params.plan ? new Date(addDays(new Date(), 1).setHours(9, 0, 0, 0)) : new Date();

  const [accountId, setAccountId] = useState(existing?.accountId ?? params.accountId);
  const [accountQuery, setAccountQuery] = useState('');
  const [date, setDate] = useState(toDateKey(start));
  const [time, setTime] = useState(timeKey(start));
  const [channel, setChannel] = useState<CallChannel>(existing?.channel ?? 'In person');
  const [chosen, setChosen] = useState<string[]>(existing?.products.map((p) => p.product) ?? []);
  const [messages, setMessages] = useState<string[]>(existing?.keyMessages ?? []);
  const [attendees, setAttendees] = useState(existing?.attendees ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [nextStep, setNextStep] = useState(existing?.nextStep ?? '');
  const [followUp, setFollowUp] = useState(existing?.followUpDate ?? '');
  const [checkIn, setCheckIn] = useState<GeoTag | undefined>(existing?.checkIn);
  const [pinAccount, setPinAccount] = useState(true);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [samples, setSamples] = useState<Record<string, string>>(() => Object.fromEntries((existing?.samples ?? []).map((x) => [x.product, String(x.qty)])));
  const [coachId, setCoachId] = useState(existing?.coachId);
  const followTask = existing ? (data.tasks ?? []).find((t) => t.callId === existing.id && !t.doneAt) : undefined;
  const [remind, setRemind] = useState(followTask ? !!followTask.remindAt : true);
  const [remindAt, setRemindAt] = useState(followTask?.remindAt ?? '09:00');
  const managers = useMemo(() => managersOf(data.users, existing?.ownerId ?? me.id), [data.users, existing?.ownerId, me.id]);
  const stock = useMemo(() => new Map(sampleStock(data, me.id, existing?.id).map((x) => [x.product, x.balance])), [data, me.id, existing?.id]);

  const account = accountId ? getAccount(accountId) : undefined;
  const when = parseLocal(date, time);
  const isFuture = !!when && when.getTime() > Date.now();
  const keyMessagesFor = (name: string) => data.products.find((p) => p.name === name)?.keyMessages ?? [];

  const accountMatches = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    return accounts.filter((a) => (me.role === 'Rep' ? a.ownerId === me.id : true) && (!q || a.name.toLowerCase().includes(q) || a.specialty.toLowerCase().includes(q))).slice(0, 8);
  }, [accounts, accountQuery, me]);

  if (existing?.status === 'Submitted') {
    return (
      <Screen>
        <Empty icon="lock-closed-outline">This call is submitted and locked.</Empty>
      </Screen>
    );
  }

  // Products discussed, then any with stock or already entered.
  const sampleRows = [...new Set([...chosen, ...[...stock.keys()].filter((p) => (stock.get(p) ?? 0) > 0), ...Object.keys(samples)])].filter((p) => products.some((x) => x.name === p));

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleProduct = (p: string) => {
    const next = toggle(chosen, p);
    setChosen(next);
    // Drop key messages that belong to a product that is no longer selected.
    const allowed = new Set(next.flatMap(keyMessagesFor));
    setMessages((m) => m.filter((x) => allowed.has(x)));
  };

  const doCheckIn = async () => {
    setLocating(true);
    try {
      const fix = await currentFix();
      setCheckIn({ ...fix, distanceM: hasLocation(account) ? distanceM(fix, { lat: account.lat, lng: account.lng }) : undefined });
    } catch (e) {
      notify('Check-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  };

  const save = (status: CallStatus) => {
    const productDetails = chosen.map((product, i) => ({ product, priority: i + 1 }));
    const errs: Record<string, string> = when
      ? callProblems({ status, datetime: when.toISOString(), products: productDetails, channel, checkIn }, data.settings)
      : { when: 'Use date YYYY-MM-DD and time HH:MM.' };
    if (!accountId) errs.account = 'Choose an account.';
    if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) errs.followUp = 'Use YYYY-MM-DD.';
    if (followUp && remind && !/^([01]\d|2[0-3]):[0-5]\d$/.test(remindAt)) errs.followUp = 'Use HH:MM for the reminder time.';
    const given: SampleGiven[] = isFuture ? [] : Object.entries(samples).filter(([, q]) => +q > 0).map(([product, q]) => ({ product, qty: Math.min(1000, Math.floor(+q)) }));
    setErrors(errs);
    if (Object.keys(errs).length || !accountId || !when) return;

    const doSave = () => {
      const id = existing?.id ?? newId('call');
      const now = new Date().toISOString();
      try {
        run({
          type: 'call.save',
          call: {
            id,
            accountId,
            ownerId: existing?.ownerId ?? me.id,
            datetime: when.toISOString(),
            channel,
            status,
            products: productDetails,
            keyMessages: messages,
            attendees: attendees.trim() || undefined,
            notes: notes.trim() || undefined,
            nextStep: nextStep.trim() || undefined,
            followUpDate: followUp || undefined,
            checkIn: channel === 'In person' ? checkIn : undefined,
            samples: given.length ? given : undefined,
            coachId: coachId && channel === 'In person' ? coachId : undefined,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          },
        });
        // A follow-up becomes a task with a reminder (one per call; it moves when the date changes).
        if (followUp && !isFuture && account) {
          run({
            type: 'task.save',
            task: {
              id: followTask?.id ?? newId('tsk'),
              ownerId: existing?.ownerId ?? me.id,
              title: nextStep.trim() || `Follow up with ${account.name}`,
              due: followUp,
              remindAt: remind ? remindAt : undefined,
              accountId,
              callId: id,
              createdAt: followTask?.createdAt ?? now,
            },
          });
        } else if (followTask && !followUp) run({ type: 'task.delete', id: followTask.id });
        // Pinned after saving: this call stays "unverified"; later check-ins are verified against the pin.
        if (checkIn && pinAccount && account && !hasLocation(account) && account.ownerId === me.id) {
          run({ type: 'account.pin', id: account.id, lat: checkIn.lat, lng: checkIn.lng });
        }
        router.dismissTo({ pathname: '/call/[id]', params: { id } });
      } catch (e) {
        notify('Not saved', e instanceof Error ? e.message : String(e));
      }
    };

    if (status === 'Submitted') {
      const warn = channel === 'In person' && !checkIn ? ' This in-person call has no check-in, so your manager will see it as unverified.' : '';
      confirm('Submit call?', `Submitted calls are locked and can no longer be edited.${warn}`, doSave, 'Submit');
    } else {
      doSave();
    }
  };

  const geoLine = checkIn
    ? checkIn.distanceM === undefined
      ? 'Checked in. This account has no pinned location yet.'
      : checkIn.distanceM <= data.settings.geofenceM
        ? `Verified: ${formatDistance(checkIn.distanceM)} from the account.`
        : `Off-site: ${formatDistance(checkIn.distanceM)} from the account (limit ${data.settings.geofenceM} m).`
    : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? (existing.status === 'Planned' ? 'Record call' : 'Edit call') : params.plan ? 'Plan a visit' : 'Log call' }} />

      <Label>Account *</Label>
      {account ? (
        <Card>
          <Text style={text.title}>{account.name}</Text>
          <Text style={text.muted}>
            {account.type} · {account.specialty} · Tier {account.tier}
          </Text>
          {!existing && !params.accountId && (
            <Text style={styles.change} onPress={() => setAccountId(undefined)}>
              Change
            </Text>
          )}
        </Card>
      ) : (
        <View style={{ marginBottom: space.sm }}>
          <SearchBox value={accountQuery} onChangeText={setAccountQuery} placeholder="Search your accounts" />
          {!!errors.account && <Text style={styles.error}>{errors.account}</Text>}
          {accountMatches.map((a) => (
            <Card key={a.id} onPress={() => setAccountId(a.id)} style={{ paddingVertical: space.md }}>
              <Text style={text.title}>{a.name}</Text>
              <Text style={text.muted}>{a.specialty}</Text>
            </Card>
          ))}
        </View>
      )}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Time" value={time} onChangeText={setTime} placeholder="HH:MM" />
        </View>
      </View>
      <View style={[styles.wrap, { marginTop: -space.sm }]}>
        <Chip label="Now" icon="time-outline" onPress={() => { const n = new Date(); setDate(toDateKey(n)); setTime(timeKey(n)); }} />
        <Chip label="Tomorrow 9:00" onPress={() => { setDate(toDateKey(addDays(new Date(), 1))); setTime('09:00'); }} />
        <Chip label="Next week" onPress={() => { setDate(toDateKey(addDays(new Date(), 7))); setTime('10:00'); }} />
      </View>
      {!!errors.when && <Text style={styles.error}>{errors.when}</Text>}

      <Label>Channel</Label>
      <View style={styles.wrap}>
        {CHANNELS.map((c) => (
          <Chip key={c} label={c} icon={CHANNEL_ICON[c]} selected={channel === c} onPress={() => setChannel(c)} />
        ))}
      </View>

      {channel === 'In person' && !isFuture && (
        <Card style={{ borderColor: checkIn ? (checkIn.distanceM !== undefined && checkIn.distanceM > data.settings.geofenceM ? colors.danger : colors.success) : colors.border }}>
          <Row>
            <Ionicons name="navigate-circle" size={22} color={!checkIn ? colors.primary : checkIn.distanceM !== undefined && checkIn.distanceM > data.settings.geofenceM ? colors.danger : colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={text.title}>Check-in</Text>
              <Text style={text.muted}>{geoLine ?? 'Records where you are, to verify the visit.'}</Text>
            </View>
            {locating ? <ActivityIndicator color={colors.primary} /> : <Button small title={checkIn ? 'Redo' : 'Check in'} variant={checkIn ? 'ghost' : 'primary'} onPress={doCheckIn} />}
          </Row>
          {checkIn && account && !hasLocation(account) && account.ownerId === me.id && (
            <ToggleRow label="Pin this as the account's location" value={pinAccount} onChange={setPinAccount} hint="Future check-ins will be verified against it." />
          )}
        </Card>
      )}
      {!!errors.checkIn && <Banner tone="danger">{errors.checkIn}</Banner>}

      <Label>Products discussed (tap in the order presented)</Label>
      <View style={styles.wrap}>
        {products.map(({ name: p }) => {
          const i = chosen.indexOf(p);
          return <Chip key={p} label={i >= 0 ? `${i + 1}. ${p}` : p} selected={i >= 0} onPress={() => toggleProduct(p)} />;
        })}
      </View>
      {!!errors.products && <Text style={styles.error}>{errors.products}</Text>}

      {chosen.length > 0 && (
        <>
          <Label>Key messages</Label>
          {chosen.map((p) => (
            <View key={p} style={{ marginBottom: space.xs }}>
              <Text style={[text.muted, { marginBottom: 4 }]}>{p}</Text>
              <View style={styles.wrap}>
                {keyMessagesFor(p).map((m) => (
                  <Chip key={m} label={m} selected={messages.includes(m)} onPress={() => setMessages(toggle(messages, m))} />
                ))}
              </View>
            </View>
          ))}
        </>
      )}

      {!isFuture && sampleRows.length > 0 && (
        <>
          <Label>Samples given</Label>
          <Card style={{ paddingVertical: space.sm }}>
            {sampleRows.map((p) => {
              const left = stock.get(p);
              const q = +(samples[p] || 0);
              return (
                <Row key={p} style={{ paddingVertical: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={text.body}>{p}</Text>
                    {left !== undefined && <Text style={[text.small, left - q < 0 && { color: colors.danger }]}>{left - q} left in your stock</Text>}
                  </View>
                  <TextInput
                    value={samples[p] ?? ''}
                    onChangeText={(v) => setSamples({ ...samples, [p]: v.replace(/\D/g, '').slice(0, 4) })}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.faint}
                    accessibilityLabel={`${p} samples given`}
                    style={styles.qty}
                  />
                </Row>
              );
            })}
          </Card>
        </>
      )}

      {channel === 'In person' && managers.length > 0 && (
        <>
          <ToggleRow label="Coached visit" value={!!coachId} onChange={(v) => setCoachId(v ? managers[0].id : undefined)} hint="Your manager came along. They score the call and their feedback shows on it." />
          {!!coachId && managers.length > 1 && (
            <View style={styles.wrap}>
              {managers.map((m) => (
                <Chip key={m.id} label={m.name} selected={coachId === m.id} onPress={() => setCoachId(m.id)} />
              ))}
            </View>
          )}
        </>
      )}

      {!isFuture && <Field label="Attendees" value={attendees} onChangeText={setAttendees} placeholder="Others present, if any" />}
      <CallNoteAssist
        accountName={account?.name}
        tidy={!isFuture}
        fields={{ notes, chosen, messages, nextStep, followUp, attendees }}
        onChange={(f) => { setNotes(f.notes); setChosen(f.chosen); setMessages(f.messages); setNextStep(f.nextStep); setFollowUp(f.followUp); setAttendees(f.attendees); }}
      />
      <Field label={isFuture ? 'Objective' : 'Call notes'} value={notes} onChangeText={setNotes} multiline placeholder={isFuture ? 'What you want to achieve in this visit' : 'What was discussed, objections, requests'} />
      {!isFuture && (
        <>
          <Field label="Next step" value={nextStep} onChangeText={setNextStep} placeholder="e.g. Bring study reprint" />
          <Field label="Follow-up date" value={followUp} onChangeText={setFollowUp} placeholder="YYYY-MM-DD" error={errors.followUp} />
          {!!followUp && (
            <>
              <ToggleRow label="Remind me" value={remind} onChange={setRemind} hint={remindersSupported ? 'A phone notification on the follow-up day. It also shows in Tasks.' : 'It shows in Tasks; phones running the app also get a notification.'} />
              {remind && <Field label="Reminder time" value={remindAt} onChangeText={setRemindAt} placeholder="HH:MM" />}
            </>
          )}
        </>
      )}

      <View style={styles.actions}>
        {isFuture ? (
          <Button title="Save as planned" icon="calendar-outline" onPress={() => save('Planned')} />
        ) : (
          <>
            <Button title="Save draft" variant="secondary" onPress={() => save('Saved')} />
            <Button title="Submit" icon="checkmark-circle-outline" onPress={() => save('Submitted')} />
          </>
        )}
      </View>
    </Screen>
  );
}

const CHANNEL_ICON: Record<CallChannel, IconName> = { 'In person': 'walk-outline', Phone: 'call-outline', Video: 'videocam-outline', Email: 'mail-outline', WhatsApp: 'logo-whatsapp' };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  error: { color: colors.danger, fontSize: 12, marginBottom: space.sm },
  qty: { width: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: space.sm, textAlign: 'center', color: colors.text, backgroundColor: colors.card, fontVariant: ['tabular-nums'] },
  change: { color: colors.primary, marginTop: space.sm, fontWeight: '600' },
});
