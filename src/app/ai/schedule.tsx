import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { aiErrorMessage, runAi, useAiAvailable } from '@/ai/client';
import { accountsForTranscript, checkVisits, visitsToCalls, weekdayName, type ProposedVisit } from '@/ai/logic';
import { MicButton } from '@/ai/MicButton';
import { appendText } from '@/ai/useDictation';
import { formatDateTime, parseLocal, timeKey, todayKey } from '@/data/dates';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { Banner, Button, Card, Empty, Field, Row, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** Say or type the visits you want ("Dr Ade on Tuesday at 10, the pharmacy on Friday"); confirm; they become planned calls. */
export default function ScheduleByVoiceScreen() {
  const me = useMe();
  const { accounts, run } = useStore();
  const ai = useAiAvailable();
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [visits, setVisits] = useState<ProposedVisit[]>();
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  // Reps plan their own territory; managers can plan visits to any account they can see.
  const mine = me.role === 'Rep' ? accounts.filter((a) => a.ownerId === me.id) : accounts;

  const plan = async () => {
    setBusy(true);
    setError(undefined);
    setVisits(undefined);
    try {
      const now = new Date();
      const sent = accountsForTranscript(mine, transcript);
      const r = await runAi('schedule', { transcript: transcript.trim(), today: todayKey(), now: timeKey(now), weekdayToday: weekdayName(now), accounts: sent });
      const checked = checkVisits(r.visits, sent, now);
      setVisits(checked);
      setSkip(new Set(checked.map((v, i) => (v.problem ? i : -1)).filter((i) => i >= 0)));
      setUnmatched(r.unmatched);
      setMessage(r.message);
    } catch (e) {
      setError(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!visits) return;
    const chosen = visits.filter((v, i) => !skip.has(i) && !v.problem);
    const calls = visitsToCalls(chosen, me.id, new Date(), () => newId('call'));
    const failed: string[] = [];
    for (const [i, call] of calls.entries()) {
      try {
        run({ type: 'call.save', call });
      } catch (e) {
        failed.push(`${chosen[i].accountName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const ok = calls.length - failed.length;
    if (failed.length) notify(ok ? `${ok} visit${ok === 1 ? '' : 's'} planned` : 'Not planned', failed.join('\n'));
    if (ok) router.back();
  };

  if (!ai) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Plan visits' }} />
        <Empty icon="sparkles-outline">Ava AI features are turned off for your company.</Empty>
        <Button title="Plan a visit" icon="calendar-outline" onPress={() => router.replace({ pathname: '/call/edit', params: { plan: '1' } })} />
      </Screen>
    );
  }

  const count = visits ? visits.filter((v, i) => !skip.has(i) && !v.problem).length : 0;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Plan visits by voice' }} />
      <Card>
        <Text style={text.title}>Which visits do you want to plan?</Text>
        <Text style={[text.muted, { marginBottom: space.md }]}>For example: “Visit Dr Ade at Lagoon Hospital on Tuesday at 10am and the pharmacy on Friday.”</Text>
        <Field label="Your visits" value={transcript} onChangeText={setTranscript} multiline placeholder="Say or type the visits" />
        <Row style={{ flexWrap: 'wrap' }}>
          <MicButton label="Speak" size={34} onText={(t) => setTranscript((x) => appendText(x, t))} />
          {busy ? <ActivityIndicator color={colors.primary} /> : <Button small title="Plan with Ava AI" icon="sparkles-outline" onPress={plan} disabled={!transcript.trim() || !mine.length} />}
        </Row>
        {!mine.length && <Text style={[text.small, { marginTop: space.sm }]}>You have no accounts to plan visits to yet.</Text>}
      </Card>
      {!!error && <Banner tone="warn">{error}</Banner>}

      {visits && (
        <>
          {!!message && <Banner icon="sparkles">{message}</Banner>}
          {visits.length === 0 && <Empty icon="calendar-outline">No visits to your accounts were found. Try naming the account as it appears in the app.</Empty>}
          {visits.map((v, i) => {
            const on = !skip.has(i) && !v.problem;
            const when = parseLocal(v.date, v.time);
            return (
              <Card key={`${v.accountId}-${i}`} onPress={v.problem ? undefined : () => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} style={{ paddingVertical: space.md, opacity: on ? 1 : 0.6 }}>
                <Row>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.faint} />
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{v.accountName}</Text>
                    <Text style={text.muted}>{when ? formatDateTime(when.toISOString()) : 'No date'}{v.note ? ` · ${v.note}` : ''}</Text>
                    {!!v.problem && <Text style={styles.problem}>{v.problem}</Text>}
                  </View>
                  <Pressable
                    accessibilityLabel="Edit this visit"
                    hitSlop={8}
                    onPress={() => router.push({ pathname: '/call/edit', params: { accountId: v.accountId, plan: '1' } })}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.primary} />
                  </Pressable>
                </Row>
              </Card>
            );
          })}
          {unmatched.length > 0 && <Banner tone="warn">Not matched to an account: {unmatched.join('; ')}</Banner>}
          {visits.length > 0 && (
            <View style={{ marginTop: space.sm }}>
              <Button title={count ? `Add ${count} planned visit${count === 1 ? '' : 's'}` : 'Nothing selected'} icon="calendar-outline" onPress={save} disabled={!count} />
              <Text style={[text.small, { marginTop: space.sm }]}>Check the dates and times. Visits are added to your calls as planned; you can change them later.</Text>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  problem: { color: colors.danger, fontSize: 12, marginTop: 2 },
});
