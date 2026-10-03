import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { Button, Card, Empty, SectionTitle, StatusBadge, text } from '@/ui/components';
import { confirm } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getCall, getAccount, deleteCall } = useStore();
  const call = getCall(id);

  if (!call) {
    return (
      <Screen>
        <Empty>Call not found.</Empty>
      </Screen>
    );
  }
  const account = getAccount(call.accountId);
  const locked = call.status === 'Submitted';

  return (
    <Screen>
      <Card onPress={account ? () => router.push({ pathname: '/account/[id]', params: { id: account.id } }) : undefined}>
        <View style={styles.row}>
          <Text style={[text.title, { flex: 1, fontSize: 18 }]}>{account?.name ?? 'Unknown account'}</Text>
          <StatusBadge status={call.status} />
        </View>
        <Text style={text.muted}>
          {formatDateTime(call.datetime)} · {call.channel}
        </Text>
        {locked && call.submittedAt && <Text style={[text.muted, { marginTop: 4 }]}>Submitted {formatDateTime(call.submittedAt)}</Text>}
      </Card>

      <SectionTitle>Products</SectionTitle>
      <Card>
        {call.products.length ? (
          call.products.map((p) => (
            <Text key={p.product} style={text.body}>
              {p.priority}. {p.product}
            </Text>
          ))
        ) : (
          <Text style={text.muted}>None recorded</Text>
        )}
        {call.keyMessages.length > 0 && (
          <Text style={[text.muted, { marginTop: space.sm }]}>Key messages: {call.keyMessages.join(', ')}</Text>
        )}
      </Card>

      {(call.notes || call.attendees) && (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            {!!call.attendees && <Text style={[text.muted, { marginBottom: 4 }]}>Attendees: {call.attendees}</Text>}
            {!!call.notes && <Text style={text.body}>{call.notes}</Text>}
          </Card>
        </>
      )}

      {(call.nextStep || call.followUpDate) && (
        <>
          <SectionTitle>Follow-up</SectionTitle>
          <Card>
            {!!call.nextStep && <Text style={text.body}>{call.nextStep}</Text>}
            {!!call.followUpDate && <Text style={text.muted}>By {call.followUpDate}</Text>}
          </Card>
        </>
      )}

      {locked ? (
        <Text style={[text.muted, { marginTop: space.lg, textAlign: 'center' }]}>Submitted calls are locked for compliance.</Text>
      ) : (
        <View style={styles.actions}>
          <Button title={call.status === 'Planned' ? 'Record this call' : 'Edit'} onPress={() => router.push({ pathname: '/call/edit', params: { id: call.id } })} />
          <Button
            title="Delete"
            variant="danger"
            onPress={() =>
              confirm('Delete call?', 'This removes the unsubmitted call.', () => {
                deleteCall(call.id);
                router.back();
              }, 'Delete')
            }
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
});
