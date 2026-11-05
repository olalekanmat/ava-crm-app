import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { expiringLots, stockLots, todayIso } from '@/data/erp';
import { liveContent } from '@/data/ops';
import { can, distributorUser } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import { FUNCTION_LABEL, WAREHOUSE, type FunctionRole } from '@/data/types';
import { Card, Chip, Empty, Kpi, KpiRow, ListRow, SectionTitle } from '@/ui/components';
import { ContentCard, SafetyCard } from '@/ui/opsCards';
import { OrderRow } from '@/ui/orders';
import { Screen } from '@/ui/Screen';
import { colors, space, tone } from '@/ui/theme';
import { FinanceDesk } from './FinanceDesk';

/** The back-office desks a person can switch to on Home, besides their line role's home. */
export type Desk = 'field' | 'finance' | 'marketing' | 'medical' | 'warehouse' | 'distributor';
const DESK_FN: Record<Exclude<Desk, 'field'>, FunctionRole> = { finance: 'finance', marketing: 'marketing', medical: 'medical', warehouse: 'warehouse', distributor: 'distributor' };

/** Desks this person has in their own right (administrators switch with the same chips only when they hold the job). */
export function desksOf(me: Parameters<typeof can>[0], erp: boolean): Desk[] {
  const own = (f: FunctionRole) => !!me?.functions?.includes(f);
  const out: Desk[] = [];
  if (erp && (own('finance') || own('invoicing') || own('creditApprover'))) out.push('finance');
  if (own('marketing')) out.push('marketing');
  if (own('medical')) out.push('medical');
  if (erp && own('warehouse')) out.push('warehouse');
  if (erp && distributorUser(me)) out.push('distributor');
  return out;
}

/**
 * 2.14 role workspaces: someone with a back-office job opens on that desk, and switches between it and
 * their field home with chips at the top. The choice is remembered on this device.
 */
export function useDesk(field: ReactNode): ReactNode {
  const me = useMe();
  const { erp, data } = useStore();
  const desks = desksOf(me, erp);
  const leads = data.users.some((u) => u.managerId === me.id && u.active);
  // Someone whose job is the desk (no team, not a rep) starts there; others start in the field.
  const fallback: Desk = desks.length && me.role !== 'Rep' && !leads ? desks[0] : 'field';
  const key = `ava:desk:${me.id}`;
  const [desk, setDesk] = useState<Desk | null>(null);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .then((v) => live && setDesk((v as Desk) || null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  if (!desks.length) return field;
  const current: Desk = desk && (desk === 'field' || desks.includes(desk)) ? desk : fallback;
  const pick = (d: Desk) => {
    setDesk(d);
    AsyncStorage.setItem(key, d).catch(() => {});
  };
  const label = (d: Desk) => (d === 'field' ? (me.role === 'Rep' ? 'My field work' : 'My team') : d === 'finance' ? 'Finance desk' : FUNCTION_LABEL[DESK_FN[d]].split(' /')[0]);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space.md, paddingTop: space.sm }}>
        {(['field', ...desks] as Desk[]).map((d) => (
          <Chip key={d} label={label(d)} selected={d === current} onPress={() => pick(d)} />
        ))}
      </ScrollView>
      <View style={{ flex: 1 }}>{current === 'field' ? field : current === 'finance' ? <FinanceDesk /> : current === 'marketing' ? <MarketingDesk /> : current === 'medical' ? <MedicalDesk /> : current === 'warehouse' ? <WarehouseDesk /> : <DistributorDesk />}</View>
    </View>
  );
}

function MarketingDesk() {
  const { data } = useStore();
  const today = todayIso();
  const live = (data.campaigns ?? []).filter((c) => c.status === 'Live');
  const pending = (data.content ?? []).filter((d) => d.status === 'Pending' || d.status === 'Rejected');
  return (
    <Screen wide>
      <KpiRow>
        <Kpi icon="megaphone-outline" label="Live campaigns" value={live.length} onPress={() => router.push('/campaigns')} />
        <Kpi icon="albums-outline" label="Approved material" value={liveContent(data, today).length} onPress={() => router.push('/content')} />
        <Kpi icon="hourglass-outline" label="With Medical or sent back" value={pending.length} tone={pending.length ? tone.important : undefined} onPress={() => router.push('/content')} />
      </KpiRow>
      <Card style={{ padding: 0 }}>
        <ListRow icon="megaphone-outline" tone={colors.crimson} title="Campaigns" subtitle="Who to see, how often, and the reach so far" onPress={() => router.push('/campaigns')} />
        <ListRow icon="albums-outline" tone={colors.primaryInk} title="Content library" subtitle="Brochures, detail aids, videos and their approval" onPress={() => router.push('/content')} />
        <ListRow icon="options-outline" tone={colors.orange} title="Products & key messages" subtitle="Catalogue, presentations, brochures" onPress={() => router.push('/admin/settings')} />
        <ListRow icon="bar-chart-outline" tone={colors.success} title="Reports" subtitle="Calls by product, segment and tier" onPress={() => router.push('/reports')} />
      </Card>
    </Screen>
  );
}

function MedicalDesk() {
  const { data } = useStore();
  const safety = (data.safetyReports ?? []).filter((r) => r.status !== 'Closed').sort((a, b) => Number(!!b.serious) - Number(!!a.serious) || a.at.localeCompare(b.at));
  const content = (data.content ?? []).filter((d) => d.status === 'Pending');
  return (
    <Screen wide>
      <KpiRow>
        <Kpi icon="warning-outline" label="Open safety reports" value={safety.length} tone={safety.some((r) => r.serious) ? tone.urgent : safety.length ? tone.important : undefined} onPress={() => router.push('/safety')} />
        <Kpi icon="albums-outline" label="Material to approve" value={content.length} tone={content.length ? tone.important : undefined} onPress={() => router.push('/content')} />
      </KpiRow>
      <SectionTitle>Safety reports</SectionTitle>
      {safety.length ? safety.map((r) => <SafetyCard key={r.id} r={r} />) : <Empty icon="shield-checkmark-outline">No open reports.</Empty>}
      {content.length > 0 && (
        <>
          <SectionTitle>Material to approve</SectionTitle>
          {content.map((d) => (
            <ContentCard key={d.id} d={d} />
          ))}
        </>
      )}
    </Screen>
  );
}

function WarehouseDesk() {
  const { data } = useStore();
  const today = todayIso();
  const lots = (stockLots(data).get(WAREHOUSE) ?? []).filter((l) => l.qty > 0);
  const { expired, soon } = expiringLots(lots, today, data.settings.erp?.nearExpiryDays ?? 90);
  const toDeliver = (data.invoices ?? []).filter((i) => i.status !== 'Void' && i.stockFrom === WAREHOUSE && !i.delivery && i.channel !== 'Distributor').length;
  const orders = (data.orders ?? []).filter((o) => o.status === 'Submitted');
  return (
    <Screen wide>
      <KpiRow>
        <Kpi icon="cube-outline" label="Units in warehouse" value={lots.reduce((n, l) => n + l.qty, 0).toLocaleString()} onPress={() => router.push('/erp/stock')} />
        <Kpi icon="hourglass-outline" label="Expired / expiring" value={`${expired.length} / ${soon.length}`} tone={expired.length ? tone.urgent : soon.length ? tone.important : undefined} onPress={() => router.push('/erp/stock')} />
        <Kpi icon="car-outline" label="Invoices to deliver" value={toDeliver} />
      </KpiRow>
      <Card style={{ padding: 0 }}>
        <ListRow icon="cube-outline" tone={colors.orange} title="Stock" subtitle="Receive with batch and expiry, give to reps, counts" onPress={() => router.push('/erp/stock')} />
        <ListRow icon="cart-outline" title="Orders" subtitle={`${orders.length} waiting`} onPress={() => router.push('/erp/orders')} />
      </Card>
      {orders.length > 0 && (
        <>
          <SectionTitle>Orders waiting</SectionTitle>
          <Card style={{ padding: 0 }}>
            {orders.slice(0, 20).map((o) => (
              <OrderRow key={o.id} o={o} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function DistributorDesk() {
  const me = useMe();
  const { data } = useStore();
  const name = data.distributors?.find((d) => d.id === me.distributorId)?.name ?? 'Your company';
  const orders = (data.orders ?? []).filter((o) => o.distributorId === me.distributorId && o.status === 'Forwarded');
  return (
    <Screen wide>
      <SectionTitle>{name}</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="cloud-upload-outline" tone={colors.success} title="Upload monthly sales" subtitle="Sell-out and stock, as a CSV" onPress={() => router.push('/erp/secondary')} />
      </Card>
      <SectionTitle>Orders sent to you ({orders.length})</SectionTitle>
      {orders.length ? (
        <Card style={{ padding: 0 }}>
          {orders.map((o) => (
            <OrderRow key={o.id} o={o} />
          ))}
        </Card>
      ) : (
        <Empty icon="cart-outline">Orders the company forwards to you appear here.</Empty>
      )}
    </Screen>
  );
}
