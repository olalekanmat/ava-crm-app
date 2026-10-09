import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { geoStatus } from '@/data/geo';
import { useStore } from '@/data/store';
import type { Call, CallChannel } from '@/data/types';
import { Card, GeoBadge, StatusBadge, text, type IconName } from './components';
import { colors } from './theme';

const CHANNEL_ICON: Record<CallChannel, IconName> = { 'In person': 'walk-outline', Phone: 'call-outline', Video: 'videocam-outline', Email: 'mail-outline', WhatsApp: 'logo-whatsapp' };

export function CallRow({ call, showAccount = true, showRep = false }: { call: Call; showAccount?: boolean; showRep?: boolean }) {
  const { getAccount, getUser, data } = useStore();
  const account = getAccount(call.accountId);
  const products = call.products.map((p) => p.product).join(', ');
  const geo = call.status === 'Submitted' ? geoStatus(call, data.settings.geofenceM) : 'Remote';
  return (
    <Card onPress={() => router.push({ pathname: '/call/[id]', params: { id: call.id } })}>
      <View style={styles.row}>
        <Ionicons name={CHANNEL_ICON[call.channel]} size={16} color={colors.primary} />
        <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
          {showAccount ? account?.name ?? 'Unknown account' : formatDateTime(call.datetime)}
        </Text>
        <StatusBadge status={call.status} />
      </View>
      <Text style={text.muted} numberOfLines={1}>
        {showAccount ? `${formatDateTime(call.datetime)} · ` : ''}
        {call.channel}
        {products ? ` · ${products}` : ''}
      </Text>
      {(showRep || geo !== 'Remote') && (
        <View style={[styles.row, { marginTop: 6, marginBottom: 0 }]}>
          {showRep && <Text style={[text.small, { flex: 1 }]}>{getUser(call.ownerId)?.name}</Text>}
          {!showRep && <View style={{ flex: 1 }} />}
          <GeoBadge status={geo} />
        </View>
      )}
      {!!call.notes && (
        <Text style={[text.body, { marginTop: 6, color: colors.muted }]} numberOfLines={2}>
          {call.notes}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
});
