import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Empty } from '@/ui/components';
import { ErpOff, useErp } from '@/ui/erp';
import { OrderRow } from '@/ui/orders';
import { Screen } from '@/ui/Screen';

type View_ = 'To invoice' | 'On hold' | 'Mine' | 'All';

/** Orders: the invoicing officer's queue, holds for Finance and credit approvers, and a rep's own orders. */
export default function OrdersScreen() {
  const { me, data, erp, invoicer, finance, approver } = useErp();
  const orders = useMemo(() => [...(data.orders ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.orders]);
  const views: View_[] = [...(invoicer ? (['To invoice'] as View_[]) : []), ...(finance || approver ? (['On hold'] as View_[]) : []), 'Mine', 'All'];
  const [view, setView] = useState<View_>(views[0]);
  if (!erp) return <ErpOff />;
  const shown = orders.filter((o) => (view === 'To invoice' ? o.status === 'Submitted' : view === 'On hold' ? o.status === 'On hold' : view === 'Mine' ? o.ownerId === me.id : true));
  return (
    <Screen wide>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {views.map((v) => (
          <Chip key={v} label={`${v}${v === 'To invoice' ? ` (${orders.filter((o) => o.status === 'Submitted').length})` : v === 'On hold' ? ` (${orders.filter((o) => o.status === 'On hold').length})` : ''}`} selected={view === v} onPress={() => setView(v)} />
        ))}
      </View>
      {shown.length ? (
        <Card style={{ padding: 0 }}>
          {shown.slice(0, 100).map((o) => (
            <OrderRow key={o.id} o={o} />
          ))}
        </Card>
      ) : (
        <Empty icon="cart-outline" title="No orders here" action={me.role === 'Rep' ? <Button title="Place an order" icon="add-circle-outline" onPress={() => router.push({ pathname: '/erp/sale', params: { mode: 'order' } })} /> : undefined}>
          {view === 'To invoice' ? 'Reps’ new orders wait here for you to invoice them.' : view === 'On hold' ? 'Orders over a credit limit, with old debt or a big discount wait here.' : 'Orders reps place for their customers show here.'}
        </Empty>
      )}
    </Screen>
  );
}
