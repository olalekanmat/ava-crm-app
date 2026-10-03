import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, parseLocal, timeKey, toDateKey } from '@/data/dates';
import { useStore } from '@/data/store';
import { CHANNELS, KEY_MESSAGES, PRODUCTS, type CallChannel, type CallStatus } from '@/data/types';
import { validateCall } from '@/data/validate';
import { Button, Card, Chip, Empty, Field, Label, text } from '@/ui/components';
import { confirm } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** Create a call (optionally for ?accountId=) or edit an unsubmitted one (?id=). */
export default function EditCallScreen() {
  const params = useLocalSearchParams<{ id?: string; accountId?: string }>();
  const { accounts, getAccount, getCall, saveCall } = useStore();
  const existing = params.id ? getCall(params.id) : undefined;
  const start = existing ? new Date(existing.datetime) : new Date();

  const [accountId, setAccountId] = useState(existing?.accountId ?? params.accountId);
  const [accountQuery, setAccountQuery] = useState('');
  const [date, setDate] = useState(toDateKey(start));
  const [time, setTime] = useState(timeKey(start));
  const [channel, setChannel] = useState<CallChannel>(existing?.channel ?? 'In person');
  const [products, setProducts] = useState<string[]>(existing?.products.map((p) => p.product) ?? []);
  const [messages, setMessages] = useState<string[]>(existing?.keyMessages ?? []);
  const [attendees, setAttendees] = useState(existing?.attendees ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [nextStep, setNextStep] = useState(existing?.nextStep ?? '');
  const [followUp, setFollowUp] = useState(existing?.followUpDate ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const account = accountId ? getAccount(accountId) : undefined;
  const when = parseLocal(date, time);
  const isFuture = !!when && when.getTime() > Date.now();

  const accountMatches = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    return accounts.filter((a) => !q || a.name.toLowerCase().includes(q) || a.specialty.toLowerCase().includes(q)).slice(0, 8);
  }, [accounts, accountQuery]);

  if (existing?.status === 'Submitted') {
    return (
      <Screen>
        <Empty>This call is submitted and locked.</Empty>
      </Screen>
    );
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleProduct = (p: string) => {
    const next = toggle(products, p);
    setProducts(next);
    // Drop key messages that belong to a product that is no longer selected.
    const allowed = new Set(next.flatMap((x) => KEY_MESSAGES[x] ?? []));
    setMessages((m) => m.filter((x) => allowed.has(x)));
  };

  const save = (status: CallStatus) => {
    const productDetails = products.map((product, i) => ({ product, priority: i + 1 }));
    const errs = validateCall({ accountId, when, products: productDetails }, status);
    if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) errs.followUp = 'Use YYYY-MM-DD.';
    setErrors(errs);
    if (Object.keys(errs).length || !accountId || !when) return;

    const doSave = () => {
      const call = saveCall(
        {
          accountId,
          datetime: when.toISOString(),
          channel,
          status,
          products: productDetails,
          keyMessages: messages,
          attendees: attendees.trim() || undefined,
          notes: notes.trim() || undefined,
          nextStep: nextStep.trim() || undefined,
          followUpDate: followUp || undefined,
        },
        existing?.id,
      );
      router.dismissTo({ pathname: '/call/[id]', params: { id: call.id } });
    };

    if (status === 'Submitted') {
      confirm('Submit call?', 'Submitted calls are locked and can no longer be edited.', doSave, 'Submit');
    } else {
      doSave();
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit call' : 'Log call' }} />

      <Label>Account *</Label>
      {account ? (
        <Card>
          <Text style={text.title}>{account.name}</Text>
          <Text style={text.muted}>
            {account.type} · {account.specialty}
          </Text>
          {!existing && !params.accountId && (
            <Text style={styles.change} onPress={() => setAccountId(undefined)}>
              Change
            </Text>
          )}
        </Card>
      ) : (
        <View style={{ marginBottom: space.sm }}>
          <Field label="Search accounts" value={accountQuery} onChangeText={setAccountQuery} placeholder="Name or specialty" error={errors.account} />
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
        <Chip label="Now" onPress={() => { const n = new Date(); setDate(toDateKey(n)); setTime(timeKey(n)); }} />
        <Chip label="Tomorrow 9:00" onPress={() => { setDate(toDateKey(addDays(new Date(), 1))); setTime('09:00'); }} />
      </View>
      {!!errors.when && <Text style={styles.error}>{errors.when}</Text>}

      <Label>Channel</Label>
      <View style={styles.wrap}>
        {CHANNELS.map((c) => (
          <Chip key={c} label={c} selected={channel === c} onPress={() => setChannel(c)} />
        ))}
      </View>

      <Label>Products discussed (tap in the order presented)</Label>
      <View style={styles.wrap}>
        {PRODUCTS.map((p) => {
          const i = products.indexOf(p);
          return <Chip key={p} label={i >= 0 ? `${i + 1}. ${p}` : p} selected={i >= 0} onPress={() => toggleProduct(p)} />;
        })}
      </View>
      {!!errors.products && <Text style={styles.error}>{errors.products}</Text>}

      {products.length > 0 && (
        <>
          <Label>Key messages</Label>
          {products.map((p) => (
            <View key={p} style={{ marginBottom: space.xs }}>
              <Text style={[text.muted, { marginBottom: 4 }]}>{p}</Text>
              <View style={styles.wrap}>
                {(KEY_MESSAGES[p] ?? []).map((m) => (
                  <Chip key={m} label={m} selected={messages.includes(m)} onPress={() => setMessages(toggle(messages, m))} />
                ))}
              </View>
            </View>
          ))}
        </>
      )}

      <Field label="Attendees" value={attendees} onChangeText={setAttendees} placeholder="Others present, if any" />
      <Field label="Call notes" value={notes} onChangeText={setNotes} multiline placeholder="What was discussed, objections, requests" />
      <Field label="Next step" value={nextStep} onChangeText={setNextStep} placeholder="e.g. Bring study reprint" />
      <Field label="Follow-up date" value={followUp} onChangeText={setFollowUp} placeholder="YYYY-MM-DD" error={errors.followUp} />

      <View style={styles.actions}>
        {isFuture ? (
          <Button title="Save as planned" onPress={() => save('Planned')} />
        ) : (
          <>
            <Button title="Save draft" variant="secondary" onPress={() => save('Saved')} />
            <Button title="Submit" onPress={() => save('Submitted')} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  error: { color: colors.danger, fontSize: 12, marginBottom: space.sm },
  change: { color: colors.primary, marginTop: space.sm, fontWeight: '600' },
});
