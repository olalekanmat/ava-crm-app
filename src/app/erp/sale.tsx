import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays, invoiceTotals, owedBy, priceList, round2, shortages, stockAt, todayIso, trackedProducts } from '@/data/erp';
import { newId } from '@/data/ids';
import { WAREHOUSE, PAYMENT_METHODS, type Account, type InvoiceLine, type PaymentMethod } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SearchBox, SectionTitle, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { Screen } from '@/ui/Screen';
import { colors, radius, shadowRaised, space } from '@/ui/theme';

type PaidNow = 'Not yet' | 'In full' | 'Part';

/**
 * New sale: pick the customer, tap products up and down, check the total, done. The invoice is
 * numbered and can be shared straight away. Built for a rep standing at a pharmacy counter.
 */
export default function NewSaleScreen() {
  const params = useLocalSearchParams<{ accountId?: string; callId?: string }>();
  const { me, data, accounts, products, erp, run, settings, money, manager, getAccount } = useErp();
  const [accountId, setAccountId] = useState(params.accountId);
  const [search, setSearch] = useState('');
  const [find, setFind] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState('');
  const [terms, setTerms] = useState(settings.termsDays);
  const [from, setFrom] = useState(me.role === 'Rep' && !manager ? me.id : stockAt(data, me.id).size ? me.id : WAREHOUSE);
  const [paid, setPaid] = useState<PaidNow>('Not yet');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Transfer');
  const [payRef, setPayRef] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const account = accountId ? getAccount(accountId) : undefined;
  const list = priceList(products);
  const stock = useMemo(() => stockAt(data, from), [data, from]);
  const tracked = useMemo(() => trackedProducts(data), [data]);
  const disc = Math.min(100, Math.max(0, Number(discount) || 0));
  const lines: InvoiceLine[] = list
    .filter((p) => (qty[p.name] ?? 0) > 0)
    .map((p) => ({ product: p.name, qty: qty[p.name], unitPrice: p.price ?? 0, ...(disc ? { discountPercent: disc } : {}), vatPercent: p.vatExempt ? 0 : settings.vatPercent }));
  const totals = invoiceTotals({ lines, payments: [], status: 'Issued' });
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const short = shortages(data, from, lines);
  const owed = account ? owedBy(data, account.id) : 0;
  const overLimit = account?.creditLimit !== undefined && paid !== 'In full' && round2(owed + totals.total - (paid === 'Part' ? Number(amount) || 0 : 0)) > account.creditLimit;
  const noPrice = lines.filter((l) => !l.unitPrice);

  if (!erp) return <ErpOff />;

  if (!account) return <PickCustomer accounts={accounts} search={search} setSearch={setSearch} onPick={setAccountId} />;

  const set = (name: string, n: number) => setQty((q) => ({ ...q, [name]: Math.max(0, Math.min(100000, Math.round(n) || 0)) }));
  const shown = list.filter((p) => !find.trim() || `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()));

  const save = () => {
    if (!lines.length) return;
    const pay = paid === 'In full' ? totals.total : paid === 'Part' ? round2(Number(amount) || 0) : 0;
    if (paid === 'Part' && !(pay > 0 && pay < totals.total)) return notify('Check the amount', `Enter how much they paid now, less than ${money(totals.total)}.`);
    setBusy(true);
    try {
      const id = newId('inv');
      const today = todayIso();
      run({
        type: 'invoice.create',
        invoice: { id, number: '', accountId: account.id, ownerId: me.id, date: today, dueDate: addDays(today, terms), lines, orderRef: orderRef.trim() || undefined, notes: notes.trim() || undefined, stockFrom: from, status: 'Issued', payments: [], callId: params.callId, createdAt: '' },
      });
      if (pay > 0) run({ type: 'invoice.pay', invoiceId: id, payment: { id: newId('pay'), amount: pay, method, date: today, reference: payRef.trim() || undefined, receiptNo: '', byId: me.id, at: '' } });
      router.replace({ pathname: '/erp/invoice/[id]', params: { id, created: '1' } });
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        {/* Customer */}
        <Card onPress={params.accountId ? undefined : () => setAccountId(undefined)}>
          <Row gap={space.md}>
            <View style={styles.custIcon}>
              <Ionicons name={account.type === 'HCO' ? 'business-outline' : 'person-outline'} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{account.name}</Text>
              <Text style={text.muted}>
                {account.city}
                {owed > 0 ? ` · owes ${money(owed)}` : ''}
                {account.creditLimit !== undefined ? ` · limit ${money(account.creditLimit)}` : ''}
              </Text>
            </View>
            {!params.accountId && <Text style={text.link}>Change</Text>}
          </Row>
        </Card>

        {/* Products */}
        <SectionTitle right={units ? <Text style={text.muted}>{units} item{units === 1 ? '' : 's'}</Text> : undefined}>Products</SectionTitle>
        {list.length > 8 && <SearchBox placeholder="Find a product" value={find} onChangeText={setFind} />}
        {!list.length ? (
          <Empty icon="pricetags-outline" title="No products to sell">
            {manager ? 'Add products and their prices in Ava ERP › Settings.' : 'Your administrator adds products and prices.'}
          </Empty>
        ) : (
          <Card style={{ padding: 0 }}>
            {shown.map((p) => {
              const n = qty[p.name] ?? 0;
              const have = stock.get(p.name) ?? 0;
              return (
                <View key={p.id} style={[styles.prod, n > 0 && styles.prodOn]}>
                  <Pressable style={{ flex: 1 }} onPress={() => set(p.name, n + 1)} accessibilityRole="button" accessibilityLabel={`Add one ${p.name}`}>
                    <Text style={text.title}>{p.name}</Text>
                    <Text style={text.muted}>
                      {p.price !== undefined ? money(p.price) : 'No price yet'}
                      {p.vatExempt ? ' · VAT exempt' : ''}
                      {tracked.has(p.name) ? ` · ${have} in stock` : ''}
                    </Text>
                  </Pressable>
                  <View style={styles.qtyBox}>
                    {n > 0 && (
                      <>
                        <Pressable accessibilityLabel={`One less ${p.name}`} onPress={() => set(p.name, n - 1)} style={styles.qtyBtn}>
                          <Ionicons name={n === 1 ? 'trash-outline' : 'remove'} size={18} color={colors.primary} />
                        </Pressable>
                        <TextInput value={String(n)} onChangeText={(v) => set(p.name, Number(v.replace(/\D/g, '')))} keyboardType="number-pad" style={styles.qtyInput} accessibilityLabel={`${p.name} quantity`} selectTextOnFocus />
                      </>
                    )}
                    <Pressable accessibilityLabel={`One more ${p.name}`} onPress={() => set(p.name, n + 1)} style={[styles.qtyBtn, styles.qtyAdd]}>
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {lines.length > 0 && (
          <>
            <SectionTitle>Payment</SectionTitle>
            <Card>
              <Label>Paid now?</Label>
              <Segmented options={['Not yet', 'In full', 'Part'] as PaidNow[]} value={paid} onChange={setPaid} labels={{ 'In full': `In full`, Part: 'Part' }} />
              {paid === 'Part' && <Field label="Amount paid now" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={`Less than ${money(totals.total)}`} />}
              {paid !== 'Not yet' && (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {PAYMENT_METHODS.map((m) => (
                      <Chip key={m} label={m} selected={m === method} onPress={() => setMethod(m)} />
                    ))}
                  </View>
                  {method !== 'Cash' && <Field label="Reference (optional)" value={payRef} onChangeText={setPayRef} placeholder="Transfer or POS reference" />}
                </>
              )}
              {paid !== 'In full' && (
                <>
                  <Label>Customer pays within</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {[...new Set([0, 7, 14, 30, 60, settings.termsDays])].sort((a, b) => a - b).map((d) => (
                      <Chip key={d} label={d === 0 ? 'On delivery' : `${d} days`} selected={terms === d} onPress={() => setTerms(d)} />
                    ))}
                  </View>
                </>
              )}
              <Pressable onPress={() => setMore(!more)} style={{ paddingVertical: space.sm }}>
                <Text style={text.link}>{more ? 'Fewer options' : 'Discount, order number, notes…'}</Text>
              </Pressable>
              {more && (
                <>
                  <Field label="Discount on every line (%)" value={discount} onChangeText={(v) => setDiscount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" />
                  <Field label="Customer’s order number (LPO)" value={orderRef} onChangeText={setOrderRef} placeholder="Optional" />
                  <Field label="Notes on the invoice" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
                  {manager && (
                    <>
                      <Label>Stock leaves</Label>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        <Chip label="My stock" selected={from === me.id} onPress={() => setFrom(me.id)} />
                        <Chip label="Warehouse" selected={from === WAREHOUSE} onPress={() => setFrom(WAREHOUSE)} />
                      </View>
                    </>
                  )}
                </>
              )}
            </Card>

            {short.length > 0 && (
              <Banner tone="warn">
                Not enough in {from === WAREHOUSE ? 'the warehouse' : 'your stock'}: {short.map((x) => `${x.product} (${x.have} left, selling ${x.want})`).join(', ')}. You can still sell; stock will show below zero until it is topped up.
              </Banner>
            )}
            {overLimit && <Banner tone="warn">This takes {account.name} over their credit limit of {money(account.creditLimit!)}.</Banner>}
            {noPrice.length > 0 && <Banner tone="warn">{noPrice.map((l) => l.product).join(', ')} {noPrice.length === 1 ? 'has' : 'have'} no price yet and will be invoiced at zero.</Banner>}
          </>
        )}
        <View style={{ height: 140 }} />
      </Screen>

      {/* Sticky total and the one button that matters */}
      {lines.length > 0 && (
        <View style={styles.bar}>
          <View style={{ flex: 1 }}>
            <Text style={text.small}>
              {units} item{units === 1 ? '' : 's'}
              {totals.vat ? ` · VAT ${money(totals.vat)}` : ''}
              {totals.discount ? ` · −${money(totals.discount)}` : ''}
            </Text>
            <Text style={styles.total}>{money(totals.total)}</Text>
          </View>
          <View style={{ minWidth: 170 }}>
            <Button title={paid === 'In full' ? 'Sell & take payment' : 'Create invoice'} icon="checkmark-circle-outline" onPress={save} disabled={busy} />
          </View>
        </View>
      )}
    </View>
  );
}

function PickCustomer({ accounts, search, setSearch, onPick }: { accounts: Account[]; search: string; setSearch: (v: string) => void; onPick: (id: string) => void }) {
  const { data } = useErp();
  const q = search.trim().toLowerCase();
  // Customers bought from recently come first.
  const recent = new Map<string, string>();
  for (const i of data.invoices ?? []) if ((recent.get(i.accountId) ?? '') < i.date) recent.set(i.accountId, i.date);
  const list = accounts
    .filter((a) => !q || `${a.name} ${a.city} ${a.specialty}`.toLowerCase().includes(q))
    .sort((a, b) => (recent.get(b.id) ?? '').localeCompare(recent.get(a.id) ?? '') || (a.type === b.type ? 0 : a.type === 'HCO' ? -1 : 1) || a.name.localeCompare(b.name))
    .slice(0, 60);
  return (
    <Screen>
      <Text style={[text.h2, { marginBottom: space.sm }]}>Who is buying?</Text>
      <SearchBox placeholder="Pharmacy, hospital or doctor" value={search} onChangeText={setSearch} autoFocus />
      <Card style={{ padding: 0, marginTop: space.md }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {list.map((a) => (
            <Pressable key={a.id} onPress={() => onPick(a.id)} style={({ pressed }) => [styles.cust, pressed && { opacity: 0.7 }]}>
              <Ionicons name={a.type === 'HCO' ? 'business-outline' : 'person-outline'} size={18} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{a.name}</Text>
                <Text style={text.muted}>
                  {a.city}
                  {recent.has(a.id) ? ` · last sale ${new Date(`${recent.get(a.id)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
          ))}
          {!list.length && <Text style={[text.muted, { padding: space.lg }]}>No account matches “{search}”.</Text>}
        </ScrollView>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  custIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  prod: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  prodOn: { backgroundColor: colors.primarySoft },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  qtyAdd: { backgroundColor: colors.primary, borderColor: colors.primary },
  qtyInput: { width: 52, height: 40, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text, borderRadius: radius.sm, backgroundColor: colors.card },
  cust: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingBottom: space.xl, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, ...shadowRaised },
  total: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
});
