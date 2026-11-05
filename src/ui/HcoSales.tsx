import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { invoiceTotals, salesSummary, todayIso } from '@/data/erp';
import type { Account } from '@/data/types';
import { Avatar, Card, Empty, Kpi, KpiRow, Row, SectionTitle, TierBadge, text } from './components';
import { InvoiceRow, useErp } from './erp';
import { Grid } from './layout';
import { space } from './theme';

/**
 * 2.14: a hospital's or pharmacy's Sales tab: what it bought this year and owes, its invoices, and
 * the doctors who work there with when each was last seen (the people who drive its orders).
 */
export function HcoSales({ account, people }: { account: Account; people: Account[] }) {
  const { data, money, me } = useErp();
  const today = todayIso();
  const invoices = (data.invoices ?? []).filter((i) => i.accountId === account.id).sort((a, b) => b.date.localeCompare(a.date));
  const year = salesSummary(invoices, `${today.slice(0, 4)}-01-01`, today, today);
  const owed = invoices.filter((i) => i.status !== 'Void').reduce((n, i) => n + invoiceTotals(i).balance, 0);
  const last = new Map<string, string>();
  for (const c of data.calls) if (c.status === 'Submitted' && people.some((p) => p.id === c.accountId) && c.datetime > (last.get(c.accountId) ?? '')) last.set(c.accountId, c.datetime);
  return (
    <View>
      <KpiRow>
        <Kpi label="Bought this year" value={money(year.sales)} />
        <Kpi label="Owes" value={money(owed)} />
        <Kpi label="Doctors here" value={people.length} />
      </KpiRow>
      {people.length > 0 && (
        <>
          <SectionTitle>Doctors who work here</SectionTitle>
          <Grid>
            {people.map((p) => (
              <Card key={p.id} onPress={() => router.push({ pathname: '/account/[id]', params: { id: p.id } })}>
                <Row gap={space.md}>
                  <Avatar name={p.name} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{p.name}</Text>
                    <Text style={text.muted}>
                      {p.specialty}
                      {last.get(p.id) ? ` · seen ${new Date(last.get(p.id)!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ' · not seen yet'}
                    </Text>
                  </View>
                  <TierBadge tier={p.tier} />
                </Row>
              </Card>
            ))}
          </Grid>
        </>
      )}
      <SectionTitle>Invoices</SectionTitle>
      {invoices.length ? (
        <Card style={{ padding: 0 }}>
          {invoices.slice(0, 50).map((i) => (
            <InvoiceRow key={i.id} inv={i} showSeller={me.role !== 'Rep'} />
          ))}
        </Card>
      ) : (
        <Empty icon="receipt-outline">No sales to {account.name} yet.</Empty>
      )}
    </View>
  );
}
