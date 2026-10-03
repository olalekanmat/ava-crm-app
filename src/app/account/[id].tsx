import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useStore } from '@/data/store';
import { CallRow } from '@/ui/CallRow';
import { Button, Card, Empty, SectionTitle, TierBadge, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getAccount, callsForAccount, accounts } = useStore();
  const account = getAccount(id);

  if (!account) {
    return (
      <Screen>
        <Empty>Account not found.</Empty>
      </Screen>
    );
  }

  const calls = callsForAccount(account.id);
  const people = account.type === 'HCO' ? accounts.filter((a) => a.affiliation === account.name) : [];

  return (
    <Screen>
      <Stack.Screen options={{ title: account.name }} />
      <Card>
        <View style={styles.row}>
          <Text style={[text.title, { fontSize: 20, flex: 1 }]}>{account.name}</Text>
          <TierBadge tier={account.tier} />
        </View>
        <Text style={text.muted}>
          {account.type === 'HCP' ? 'Healthcare professional' : 'Healthcare organization'} · {account.specialty}
        </Text>
        {!!account.affiliation && <Text style={[text.body, { marginTop: space.sm }]}>Works at {account.affiliation}</Text>}
        <Text style={[text.body, { marginTop: space.sm }]}>
          {account.address}, {account.city}
        </Text>
        {!!account.phone && (
          <Text style={[text.body, styles.link]} onPress={() => Linking.openURL(`tel:${account.phone}`)}>
            {account.phone}
          </Text>
        )}
        {!!account.email && (
          <Text style={[text.body, styles.link]} onPress={() => Linking.openURL(`mailto:${account.email}`)}>
            {account.email}
          </Text>
        )}
        {!!account.notes && <Text style={[text.muted, { marginTop: space.sm }]}>{account.notes}</Text>}
      </Card>

      <View style={{ marginTop: space.sm }}>
        <Button title="Log a call" onPress={() => router.push({ pathname: '/call/edit', params: { accountId: account.id } })} />
      </View>

      {people.length > 0 && (
        <>
          <SectionTitle>People at this organization</SectionTitle>
          {people.map((p) => (
            <Card key={p.id} onPress={() => router.push({ pathname: '/account/[id]', params: { id: p.id } })}>
              <Text style={text.title}>{p.name}</Text>
              <Text style={text.muted}>{p.specialty}</Text>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Call history ({calls.length})</SectionTitle>
      {calls.length ? calls.map((c) => <CallRow key={c.id} call={c} showAccount={false} />) : <Empty>No calls yet.</Empty>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  link: { marginTop: 4, color: '#1557B0' },
});
