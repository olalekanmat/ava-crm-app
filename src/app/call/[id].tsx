import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { formatDistance, geoStatus, mapsUrl } from '@/data/geo';
import { useMe, useStore } from '@/data/store';
import { Button, Card, Empty, GeoBadge, Row, SectionTitle, StatusBadge, UserAvatar, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { getCall, getAccount, getUser, run, data } = useStore();
  const call = getCall(id);

  if (!call) {
    return (
      <Screen>
        <Empty>Call not found.</Empty>
      </Screen>
    );
  }
  const account = getAccount(call.accountId);
  const owner = getUser(call.ownerId);
  const locked = call.status === 'Submitted';
  const mine = call.ownerId === me.id;
  const geo = geoStatus(call, data.settings.geofenceM);

  return (
    <Screen>
      <Card onPress={account ? () => router.push({ pathname: '/account/[id]', params: { id: account.id } }) : undefined}>
        <Row>
          <Text style={[text.h2, { flex: 1 }]}>{account?.name ?? 'Unknown account'}</Text>
          <StatusBadge status={call.status} />
        </Row>
        <Text style={[text.muted, { marginTop: 4 }]}>
          {formatDateTime(call.datetime)} · {call.channel}
        </Text>
        {locked && call.submittedAt && <Text style={[text.small, { marginTop: 4 }]}>Submitted {formatDateTime(call.submittedAt)}</Text>}
        {!mine && owner && (
          <Row style={{ marginTop: space.md }}>
            <UserAvatar user={owner} size={26} />
            <Text style={text.muted}>Logged by {owner.name}</Text>
          </Row>
        )}
      </Card>

      {call.channel === 'In person' && (
        <Card>
          <Row>
            <Ionicons name="navigate-circle-outline" size={20} color={colors.primary} />
            <Text style={[text.title, { flex: 1 }]}>Check-in</Text>
            {locked ? <GeoBadge status={geo} /> : null}
          </Row>
          {call.checkIn ? (
            <>
              <Text style={[text.body, { marginTop: space.sm }]}>
                {formatDateTime(call.checkIn.at)}
                {call.checkIn.distanceM !== undefined ? ` · ${formatDistance(call.checkIn.distanceM)} from the account` : ' · account has no pinned location'}
                {call.checkIn.accuracy ? ` · GPS ±${call.checkIn.accuracy} m` : ''}
              </Text>
              <Text style={[text.link, { marginTop: 4 }]} onPress={() => Linking.openURL(mapsUrl(call.checkIn!.lat, call.checkIn!.lng))}>
                Open check-in on map
              </Text>
            </>
          ) : (
            <Text style={[text.muted, { marginTop: space.sm }]}>No check-in recorded.</Text>
          )}
        </Card>
      )}

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
        {call.keyMessages.length > 0 && <Text style={[text.muted, { marginTop: space.sm }]}>Key messages: {call.keyMessages.join(', ')}</Text>}
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
        <Row style={{ marginTop: space.lg, justifyContent: 'center' }}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
          <Text style={text.muted}>Submitted calls are locked for compliance.</Text>
        </Row>
      ) : mine ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button title={call.status === 'Planned' ? 'Record this call' : 'Edit'} icon="create-outline" onPress={() => router.push({ pathname: '/call/edit', params: { id: call.id } })} />
          <Button
            title="Delete"
            variant="danger"
            onPress={() =>
              confirm(
                'Delete call?',
                'This removes the unsubmitted call.',
                () => {
                  try {
                    run({ type: 'call.delete', id: call.id });
                    router.back();
                  } catch (e) {
                    notify('Not deleted', e instanceof Error ? e.message : String(e));
                  }
                },
                'Delete',
              )
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}
