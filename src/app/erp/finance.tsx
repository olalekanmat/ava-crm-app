import { router } from 'expo-router';
import { useMemo } from 'react';
import { debtAge, dso, formatMoneyShort, todayIso } from '@/data/erp';
import { Card, Empty, Kpi, KpiRow, ListRow, SectionTitle } from '@/ui/components';
import { ErpOff, useErp } from '@/ui/erp';
import { ClaimCard, CreditCard } from '@/ui/financeCards';
import { Grid } from '@/ui/layout';
import { OrderRow } from '@/ui/orders';
import { Screen } from '@/ui/Screen';
import { colors, tone } from '@/ui/theme';

/** 2.13 Finance desk: payments to confirm, orders on hold, credit changes, and the debt at a glance. */
export default function FinanceDesk() {
  const { data, erp, settings, finance, approver, invoicer } = useErp();
  const today = todayIso();
  const claims = (data.paymentClaims ?? []).filter((c) => c.status === 'Pending').sort((a, b) => a.at.localeCompare(b.at));
  const holds = (data.orders ?? []).filter((o) => o.status === 'On hold');
  const toInvoice = (data.orders ?? []).filter((o) => o.status === 'Submitted');
  const credit = (data.creditRequests ?? []).filter((r) => r.status === 'Pending');
  const age = useMemo(() => debtAge(data.invoices ?? [], () => 'all', today).get('all'), [data.invoices, today]);
  const days = useMemo(() => dso(data.invoices ?? [], today), [data.invoices, today]);
  if (!erp) return <ErpOff />;
  const cur = settings.currency;
  return (
    <Screen wide>
      <KpiRow>
        <Kpi icon="wallet-outline" label="Owed to us" value={formatMoneyShort(age?.total ?? 0, cur)} sub={days !== undefined ? `${days} days of sales outstanding` : 'No recent sales'} onPress={() => router.push('/erp/debt')} />
        <Kpi icon="alarm-outline" label="Overdue" value={formatMoneyShort(age?.overdue ?? 0, cur)} tone={(age?.overdue ?? 0) > 0 ? tone.urgent : undefined} sub={age ? `${formatMoneyShort(age['91-120'] + age['120+'], cur)} over 90 days` : 'Nothing owed'} onPress={() => router.push('/erp/debt')} />
        <Kpi icon="cash-outline" label="Payments to confirm" value={claims.length} tone={claims.length ? tone.important : undefined} sub={claims.length ? 'Reported by reps' : 'All confirmed'} />
      </KpiRow>

      <Card style={{ padding: 0 }}>
        <ListRow icon="hourglass-outline" tone={colors.crimson} title="Debt summary and age" subtitle="By customer, rep, team or region · export" onPress={() => router.push('/erp/debt')} />
        <ListRow icon="speedometer-outline" tone={colors.primaryInk} title="Credit limits & days" subtitle={`Default ${formatMoneyShort(settings.defaultCreditLimit ?? 0, cur)} · ${settings.defaultCreditDays ? `${settings.defaultCreditDays} days` : 'cash and carry'} · change one or many`} onPress={() => router.push('/erp/credit')} />
        <ListRow icon="cart-outline" title="Orders" subtitle={`${toInvoice.length} to invoice · ${holds.length} on hold`} onPress={() => router.push('/erp/orders')} />
        {(finance || invoicer) && <ListRow icon="git-network-outline" tone={colors.orange} title="Distributors" subtitle="Who customers buy through" onPress={() => router.push('/erp/distributors')} />}
      </Card>

      {finance && (
        <>
          <SectionTitle>Payments to confirm ({claims.length})</SectionTitle>
          {claims.length ? (
            <Grid>
              {claims.map((c) => (
                <ClaimCard key={c.id} c={c} />
              ))}
            </Grid>
          ) : (
            <Empty icon="checkmark-done-outline" title="Nothing to confirm">Payments reps report appear here. Confirm each one against the bank before the receipt goes out.</Empty>
          )}
        </>
      )}

      {(finance || approver) && holds.length > 0 && (
        <>
          <SectionTitle>Orders on hold ({holds.length})</SectionTitle>
          <Card style={{ padding: 0 }}>
            {holds.map((o) => (
              <OrderRow key={o.id} o={o} />
            ))}
          </Card>
        </>
      )}

      {(approver || finance) && credit.length > 0 && (
        <>
          <SectionTitle>Credit changes waiting ({credit.length})</SectionTitle>
          <Grid>
            {credit.map((r) => (
              <CreditCard key={r.id} r={r} />
            ))}
          </Grid>
        </>
      )}
    </Screen>
  );
}
