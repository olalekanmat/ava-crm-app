import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { erpSettings, orderTotal } from '@/data/erp';
import { HOLD_LABEL, type Order, type OrderStatus } from '@/data/types';
import { Badge, ListRow, text } from '@/ui/components';
import { useErp } from '@/ui/erp';
import { colors } from '@/ui/theme';

const STATUS_COLORS: Record<OrderStatus, { fg: string; bg: string }> = {
  Submitted: { fg: colors.primaryInk, bg: colors.primarySoft },
  'On hold': { fg: colors.warn, bg: colors.warnSoft },
  Invoiced: { fg: colors.success, bg: colors.successSoft },
  Forwarded: { fg: colors.success, bg: colors.successSoft },
  Rejected: { fg: colors.danger, bg: colors.dangerSoft },
  Cancelled: { fg: colors.muted, bg: colors.sunken },
};

export function OrderBadge({ status }: { status: OrderStatus }) {
  const c = STATUS_COLORS[status];
  return <Badge label={status === 'Submitted' ? 'Waiting' : status} fg={c.fg} bg={c.bg} />;
}

export function OrderRow({ o }: { o: Order }) {
  const { getAccount, getUser, money, data } = useErp();
  const total = orderTotal(o.lines, data.products, erpSettings(data.settings));
  return (
    <ListRow
      icon="cart-outline"
      tone={o.status === 'On hold' ? colors.warn : o.status === 'Submitted' ? colors.primary : colors.muted}
      title={getAccount(o.accountId)?.name ?? 'Customer'}
      subtitle={`${o.number} · ${getUser(o.ownerId)?.name ?? ''} · ${new Date(o.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${o.channel === 'Distributor' ? ' · via distributor' : ''}${o.holds?.length ? ` · ${o.holds.map((h) => HOLD_LABEL[h]).join(', ')}` : ''}`}
      onPress={() => router.push({ pathname: '/erp/order/[id]', params: { id: o.id } })}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[text.title, { fontVariant: ['tabular-nums'] }]}>{money(total)}</Text>
          <OrderBadge status={o.status} />
        </View>
      }
    />
  );
}

