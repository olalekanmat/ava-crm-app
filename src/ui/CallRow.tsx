import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import type { Call } from '@/data/types';
import { Card, StatusBadge, text } from './components';

export function CallRow({ call, showAccount = true }: { call: Call; showAccount?: boolean }) {
  const { getAccount } = useStore();
  const account = getAccount(call.accountId);
  const products = call.products.map((p) => p.product).join(', ');
  return (
    <Card onPress={() => router.push({ pathname: '/call/[id]', params: { id: call.id } })}>
      <View style={styles.row}>
        <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
          {showAccount ? account?.name ?? 'Unknown account' : formatDateTime(call.datetime)}
        </Text>
        <StatusBadge status={call.status} />
      </View>
      <Text style={text.muted}>
        {showAccount ? `${formatDateTime(call.datetime)} · ` : ''}
        {call.channel}
        {products ? ` · ${products}` : ''}
      </Text>
      {!!call.notes && (
        <Text style={[text.body, { marginTop: 6 }]} numberOfLines={2}>
          {call.notes}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
});
