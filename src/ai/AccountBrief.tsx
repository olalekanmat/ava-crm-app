import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { todayKey } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Button, Card, Row, text } from '@/ui/components';
import { colors, space } from '@/ui/theme';
import { aiErrorMessage, runAi, useAiAvailable } from './client';
import { buildBriefInput } from './logic';
import type { BriefResult } from './types';

/** On the account page: a pre-call brief from the account's call history, made on request. */
export function AccountBrief({ accountId }: { accountId: string }) {
  const { getAccount, callsForAccount } = useStore();
  const ai = useAiAvailable();
  const [brief, setBrief] = useState<BriefResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const account = getAccount(accountId);
  if (!ai || !account || account.deletedAt) return null;

  const make = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setBrief(await runAi('brief', buildBriefInput(account, callsForAccount(account.id), todayKey())));
    } catch (e) {
      setError(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderColor: colors.primarySoft, marginTop: space.md }}>
      <Row>
        <Ionicons name="sparkles" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={text.title}>Pre-call brief</Text>
          {!brief && <Text style={text.muted}>A short summary of past calls, with talking points for your next visit.</Text>}
        </View>
        {busy ? <ActivityIndicator color={colors.primary} /> : <Button small variant={brief ? 'ghost' : 'secondary'} title={brief ? 'Refresh' : 'AI brief'} icon={brief ? 'refresh' : 'sparkles-outline'} onPress={make} />}
      </Row>
      {!!error && <View style={{ marginTop: space.sm }}><Banner tone="warn">{error}</Banner></View>}
      {brief && (
        <View style={{ marginTop: space.md }}>
          {!!brief.summary && <Text style={text.body}>{brief.summary}</Text>}
          <List title="Talking points" items={brief.talkingPoints} icon="chatbubble-ellipses-outline" color={colors.primary} />
          <List title="Watch out for" items={brief.watchOuts} icon="alert-circle-outline" color={colors.warn} />
          <Text style={[text.small, { marginTop: space.sm }]}>Made by AI from your call history. Check before relying on it.</Text>
        </View>
      )}
    </Card>
  );
}

function List({ title, items, icon, color }: { title: string; items: string[]; icon: 'chatbubble-ellipses-outline' | 'alert-circle-outline'; color: string }) {
  if (!items.length) return null;
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={styles.head}>{title}</Text>
      {items.map((x, i) => (
        <Row key={i} style={{ alignItems: 'flex-start', marginTop: 4 }}>
          <Ionicons name={icon} size={16} color={color} style={{ marginTop: 2 }} />
          <Text style={[text.body, { flex: 1 }]}>{x}</Text>
        </Row>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
});
