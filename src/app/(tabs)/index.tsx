import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { addDays, toDateKey, todayKey } from '@/data/dates';
import { useStore } from '@/data/store';
import { CallRow } from '@/ui/CallRow';
import { Button, Card, Empty, SectionTitle, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

export default function TodayScreen() {
  const { ready, calls, getAccount, resetDemoData } = useStore();
  if (!ready) return <ActivityIndicator style={{ marginTop: 48 }} />;

  const today = todayKey();
  const weekAgo = addDays(new Date(), -7).toISOString();
  const todays = calls.filter((c) => toDateKey(new Date(c.datetime)) === today).reverse();
  const drafts = calls.filter((c) => c.status === 'Saved');
  const submittedThisWeek = calls.filter((c) => c.status === 'Submitted' && c.datetime >= weekAgo).length;
  const followUps = calls.filter((c) => c.status === 'Submitted' && c.followUpDate && c.followUpDate <= toDateKey(addDays(new Date(), 7)));

  return (
    <Screen>
      <Text style={styles.date}>
        {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>

      <View style={styles.stats}>
        <Stat label="Today" value={todays.length} />
        <Stat label="Drafts" value={drafts.length} tone={drafts.length ? 'warn' : undefined} />
        <Stat label="Submitted (7d)" value={submittedThisWeek} />
      </View>

      <View style={{ marginTop: space.md }}>
        <Button title="Log a call" onPress={() => router.push('/call/edit')} />
      </View>

      <SectionTitle>Today's calls</SectionTitle>
      {todays.length ? todays.map((c) => <CallRow key={c.id} call={c} />) : <Empty>No calls scheduled today.</Empty>}

      {drafts.length > 0 && (
        <>
          <SectionTitle>Drafts to submit</SectionTitle>
          {drafts.map((c) => (
            <CallRow key={c.id} call={c} />
          ))}
        </>
      )}

      {followUps.length > 0 && (
        <>
          <SectionTitle>Follow-ups due this week</SectionTitle>
          {followUps.map((c) => (
            <Card key={c.id} onPress={() => router.push({ pathname: '/account/[id]', params: { id: c.accountId } })}>
              <Text style={text.title}>{getAccount(c.accountId)?.name}</Text>
              <Text style={text.muted}>Due {c.followUpDate}</Text>
              {!!c.nextStep && <Text style={[text.body, { marginTop: 4 }]}>{c.nextStep}</Text>}
            </Card>
          ))}
        </>
      )}

      <View style={{ marginTop: space.xl }}>
        <Button title="Reset demo data" variant="secondary" onPress={() => resetDemoData()} />
      </View>
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <View style={[styles.stat, tone === 'warn' && { backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }]}>
      <Text style={[styles.statValue, tone === 'warn' && { color: colors.warn }]}>{value}</Text>
      <Text style={text.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  date: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: space.md },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text },
});
