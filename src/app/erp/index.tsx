import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatMoneyShort, invoiceTotals, lineTotals, payState, salesSummary, stockLevels, todayIso } from '@/data/erp';
import { WAREHOUSE } from '@/data/types';
import { Button, Card, Chip, Empty, Kpi, KpiRow, ListRow, ProgressBar, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, InvoiceRow, useErp } from '@/ui/erp';
import { saveTextFile } from '@/ui/files';
import { Screen } from '@/ui/Screen';
import { colors, radius, space, tone } from '@/ui/theme';

type Period = 'Today' | 'Week' | 'Month' | 'Year';
type Filter = 'All' | 'Owed' | 'Overdue' | 'Paid';

function range(p: Period, today: string): [string, string] {
  const d = new Date(`${today}T12:00:00`);
  if (p === 'Today') return [today, today];
  if (p === 'Week') {
    const s = new Date(d);
    s.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return [todayIso(s), today];
  }
  if (p === 'Month') return [`${today.slice(0, 7)}-01`, today];
  return [`${today.slice(0, 4)}-01-01`, today];
}

/** Ava ERP home: what was sold, what came in, who owes, what is low, and the big New sale button. */
export default function ErpHome() {
  const { me, data, erp, money, settings, manager, products, getUser, admin } = useErp();
  const [period, setPeriod] = useState<Period>('Month');
  const [filter, setFilter] = useState<Filter>('All');
  const today = todayIso();
  const [from, to] = range(period, today);
  const invoices = useMemo(() => [...(data.invoices ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [data.invoices]);
  const sum = useMemo(() => salesSummary(invoices, from, to, today), [invoices, from, to, today]);
  // Managers watch the warehouse; reps what they carry. Only products ever stocked at that place count.
  const stockPlace = manager ? WAREHOUSE : me.id;
  const low = useMemo(() => stockLevels(data, stockPlace, products).filter((x) => (data.stockMoves ?? []).some((m) => m.product === x.product && (m.to === stockPlace || m.from === stockPlace)) && x.qty <= settings.lowStock), [data, stockPlace, products, settings.lowStock]);

  if (!erp) return <ErpOff />;

  const shown = invoices.filter((i) => {
    const st = payState(i, today);
    return filter === 'All' ? true : filter === 'Paid' ? st === 'Paid' : filter === 'Overdue' ? st === 'Overdue' : st === 'Unpaid' || st === 'Part paid' || st === 'Overdue';
  });
  const collectedShare = sum.sales ? Math.min(1, sum.collected / sum.sales) : 0;
  const best = sum.byDay.reduce((m, d) => Math.max(m, d.value), 0);

  const exportCsv = () => {
    const q = (v: unknown) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const rows = [['invoice', 'date', 'due', 'status', 'customer', 'seller', 'product', 'qty', 'unit_price', 'discount_pct', 'vat_pct', 'line_total', 'invoice_total', 'paid', 'balance']];
    for (const i of invoices) {
      const t = invoiceTotals(i);
      for (const l of i.lines) rows.push([i.number, i.date, i.dueDate, payState(i, today), data.accounts.find((a) => a.id === i.accountId)?.name ?? '', getUser(i.ownerId)?.name ?? '', l.product, String(l.qty), String(l.unitPrice), String(l.discountPercent ?? ''), String(l.vatPercent), String(lineTotals(l).total), String(t.total), String(t.paid), String(t.balance)]);
    }
    saveTextFile(`Ava ERP - invoices ${today}.csv`, rows.map((r) => r.map(q).join(',')).join('\n')).catch((e) => notify('Export failed', e instanceof Error ? e.message : String(e)));
  };

  return (
    <Screen wide>
      <LinearGradient colors={[colors.ink, colors.primaryDark, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={styles.kicker}>{period === 'Today' ? 'SOLD TODAY' : period === 'Week' ? 'SOLD THIS WEEK' : period === 'Month' ? 'SOLD THIS MONTH' : 'SOLD THIS YEAR'}{me.role !== 'Rep' ? ' · YOUR TEAM' : ''}</Text>
          <Text style={styles.heroValue}>{money(sum.sales)}</Text>
          <Text style={styles.heroSub}>
            {sum.invoices} invoice{sum.invoices === 1 ? '' : 's'} · {money(sum.collected)} collected
          </Text>
          <View style={{ marginTop: space.sm, maxWidth: 320 }}>
            <ProgressBar value={collectedShare} color="#fff" track="rgba(255,255,255,0.25)" height={6} />
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/erp/sale')} style={({ pressed }) => [styles.sellBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add-circle" size={28} color={colors.primary} />
          <Text style={styles.sellText}>New sale</Text>
        </Pressable>
      </LinearGradient>

      <Segmented options={['Today', 'Week', 'Month', 'Year'] as Period[]} value={period} onChange={setPeriod} labels={{ Week: 'This week', Month: 'This month', Year: 'This year' }} />

      <KpiRow>
        <Kpi icon="wallet-outline" label="Owed to us" value={formatMoneyShort(sum.owed, settings.currency)} sub="All unpaid invoices" onPress={() => router.push('/erp/customers')} />
        <Kpi icon="alarm-outline" label="Overdue" value={formatMoneyShort(sum.overdue, settings.currency)} tone={sum.overdue > 0 ? tone.urgent : undefined} sub={sum.overdue > 0 ? 'Chase these first' : 'Nothing overdue'} onPress={() => setFilter('Overdue')} />
        <Kpi icon="cube-outline" label="Low stock" value={low.length} tone={low.length ? tone.important : undefined} sub={low.length ? `${low.slice(0, 2).map((x) => x.product).join(', ')}${low.length > 2 ? ` +${low.length - 2}` : ''}` : manager ? 'Warehouse is fine' : 'All good'} onPress={() => router.push('/erp/stock')} />
      </KpiRow>

      <Card style={{ padding: 0 }}>
        <ListRow icon="people-outline" title="Customers & balances" subtitle="Who owes what, statements" onPress={() => router.push('/erp/customers')} />
        <ListRow icon="cube-outline" tone={colors.orange} title="Stock" subtitle={manager ? 'Warehouse and team stock, receive and move' : 'What you hold, return to warehouse'} onPress={() => router.push('/erp/stock')} />
        {admin && <ListRow icon="settings-outline" tone={colors.muted} title="Prices & invoice settings" subtitle={`VAT ${settings.vatPercent}% · ${settings.prefix} numbers · ${settings.termsDays}-day terms`} onPress={() => router.push('/erp/settings')} />}
      </Card>

      {sum.byDay.length > 1 && (
        <>
          <SectionTitle>Sales by day</SectionTitle>
          <Card>
            <View style={styles.chart}>
              {sum.byDay.slice(-31).map((d) => (
                <View key={d.day} style={styles.barCol} accessibilityLabel={`${d.day}: ${money(d.value)}`}>
                  <View style={[styles.bar, { height: `${Math.max(4, (d.value / (best || 1)) * 100)}%` }]} />
                </View>
              ))}
            </View>
            <Row>
              <Text style={[text.small, { flex: 1 }]}>{sum.byDay[0].day.slice(5)}</Text>
              <Text style={text.small}>{sum.byDay.at(-1)!.day.slice(5)}</Text>
            </Row>
          </Card>
        </>
      )}

      {sum.byProduct.length > 0 && (
        <>
          <SectionTitle>Top products</SectionTitle>
          <Card>
            {sum.byProduct.slice(0, 6).map((p) => (
              <View key={p.product} style={{ marginBottom: space.md }}>
                <Row>
                  <Text style={[text.title, { flex: 1 }]}>{p.product}</Text>
                  <Text style={[text.body, { fontVariant: ['tabular-nums'] }]}>
                    {p.qty} · {money(p.value)}
                  </Text>
                </Row>
                <ProgressBar value={p.value / (sum.byProduct[0].value || 1)} />
              </View>
            ))}
          </Card>
        </>
      )}

      {manager && sum.bySeller.length > 0 && (
        <>
          <SectionTitle>By person</SectionTitle>
          <Card style={{ padding: 0 }}>
            {sum.bySeller.map((s) => (
              <Row key={s.userId} style={styles.sellerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>{getUser(s.userId)?.name ?? 'Someone'}</Text>
                  <Text style={text.muted}>
                    {s.invoices} invoice{s.invoices === 1 ? '' : 's'} · {money(s.collected)} collected
                  </Text>
                </View>
                <Text style={[text.title, { fontVariant: ['tabular-nums'] }]}>{money(s.value)}</Text>
              </Row>
            ))}
          </Card>
        </>
      )}

      <SectionTitle right={manager && invoices.length ? <Button small variant="ghost" icon="download-outline" title="Export" onPress={exportCsv} /> : undefined}>Invoices</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(['All', 'Owed', 'Overdue', 'Paid'] as Filter[]).map((f) => (
          <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {shown.length ? (
        <Card style={{ padding: 0 }}>
          {shown.slice(0, 50).map((i) => (
            <InvoiceRow key={i.id} inv={i} showSeller={me.role !== 'Rep'} />
          ))}
        </Card>
      ) : (
        <Empty icon="receipt-outline" title={invoices.length ? 'Nothing here' : 'No sales yet'} action={invoices.length ? undefined : <Button title="Make your first sale" icon="add-circle-outline" onPress={() => router.push('/erp/sale')} />}>
          {invoices.length ? `No ${filter.toLowerCase()} invoices.` : 'Open an account and tap New sale, or start here. The invoice is ready to share on WhatsApp in seconds.'}
        </Empty>
      )}
      {manager && !(data.stockMoves ?? []).some((m) => m.to === WAREHOUSE) && <Text style={[text.small, { marginTop: space.md }]}>Tip: receive stock into the warehouse in Stock to start counting it. Sales work without it.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.lg, padding: space.xl, borderRadius: radius.lg, marginBottom: space.md },
  kicker: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroValue: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'], marginVertical: 2 },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  sellBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#fff', paddingVertical: space.md, paddingHorizontal: space.xl, borderRadius: radius.pill },
  sellText: { fontSize: 17, fontWeight: '800', color: colors.primary },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 3, marginBottom: space.sm },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 3 },
  sellerRow: { paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
});
