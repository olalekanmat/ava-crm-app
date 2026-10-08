import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { aiErrorMessage, runAi, useAiAvailable } from '@/ai/client';
import { buildAskContext } from '@/ai/context';
import { filterAskActions } from '@/ai/logic';
import { MicButton } from '@/ai/MicButton';
import type { AskAction } from '@/ai/types';
import { appendText } from '@/ai/useDictation';
import { roleLabel } from '@/data/access';
import { todayKey } from '@/data/dates';
import { useMe, useStore } from '@/data/store';
import { Banner, Button, Empty, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, radius, space } from '@/ui/theme';

type Message = { id: number; from: 'me' | 'ava'; text: string; actions?: AskAction[]; error?: boolean };

/** Ask Ava: questions about your own accounts, calls and plans (or your team's), answered by AI. */
export default function AskScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const me = useMe();
  const { data } = useStore();
  const ai = useAiAvailable();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const asked = useRef<string | undefined>(undefined);
  const nextId = useRef(1);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft('');
    setMessages((m) => [...m, { id: nextId.current++, from: 'me', text: q }]);
    setBusy(true);
    try {
      const r = await runAi('ask', { question: q, role: roleLabel(me), context: buildAskContext(data, me), today: todayKey() });
      const known = new Set(data.accounts.map((a) => a.id));
      setMessages((m) => [...m, { id: nextId.current++, from: 'ava', text: r.answer || 'I could not find an answer to that.', actions: filterAskActions(r.actions, known) }]);
    } catch (e) {
      setMessages((m) => [...m, { id: nextId.current++, from: 'ava', text: aiErrorMessage(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  // The question typed on the home screen.
  useEffect(() => {
    const q = typeof params.q === 'string' ? params.q : undefined;
    if (ai && q && asked.current !== q) {
      asked.current = q;
      void ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, ai]);

  const act = (a: AskAction) => {
    if (a.type === 'open_account' && a.accountId) router.push({ pathname: '/account/[id]', params: { id: a.accountId } });
    else if (a.type === 'plan_visit') router.push(a.accountId ? { pathname: '/call/edit', params: { accountId: a.accountId, plan: '1' } } : '/ai/schedule');
    else router.push(me.role === 'Rep' ? '/plan' : me.role === 'FLM' ? '/' : '/overview');
  };

  if (!ai) {
    return (
      <Screen>
        <Empty icon="sparkles-outline">AI features are turned off for your company.</Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Ask Ava' }} />
      {messages.length === 0 && (
        <Banner icon="sparkles">Ask about your accounts, calls, plans{me.role === 'Rep' ? '' : ' and team'}. Ava only uses data you can already see in the app.</Banner>
      )}
      {messages.map((m) => (
        <View key={m.id} style={[styles.bubble, m.from === 'me' ? styles.mine : m.error ? styles.err : styles.theirs]}>
          {m.from === 'ava' && !m.error && (
            <View style={styles.who}>
              <Ionicons name="sparkles" size={14} color={colors.primary} />
              <Text style={styles.whoText}>Ava</Text>
            </View>
          )}
          <Text style={[text.body, m.from === 'me' && { color: '#fff' }]} selectable>
            {m.text}
          </Text>
          {!!m.actions?.length && (
            <View style={styles.actions}>
              {m.actions.map((a, i) => (
                <Button key={i} small variant="secondary" title={a.label} icon={a.type === 'open_account' ? 'business-outline' : a.type === 'plan_visit' ? 'calendar-outline' : 'stats-chart-outline'} onPress={() => act(a)} />
              ))}
            </View>
          )}
        </View>
      ))}
      {busy && (
        <View style={[styles.bubble, styles.theirs, { flexDirection: 'row', gap: space.sm, alignItems: 'center' }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={text.muted}>Thinking…</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={messages.length ? 'Ask a follow-up' : 'How can I help?'}
          placeholderTextColor={colors.faint}
          accessibilityLabel="Question"
          style={styles.input}
          multiline
          onSubmitEditing={() => ask(draft)}
          blurOnSubmit
        />
        <MicButton size={36} showInterim={false} onText={(t) => setDraft((x) => appendText(x, t))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => ask(draft)} disabled={!draft.trim() || busy} style={[styles.send, (!draft.trim() || busy) && { opacity: 0.4 }]}>
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
      <Text style={[text.small, { marginTop: space.sm }]}>Answers are made by AI and can be wrong. Check important details in the app.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { padding: space.md, borderRadius: radius.lg, marginBottom: space.sm, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  err: { alignSelf: 'flex-start', backgroundColor: colors.warnSoft },
  who: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  whoText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingLeft: space.md, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 8, maxHeight: 120, minWidth: 0 },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
