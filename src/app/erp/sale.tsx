import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays, creditDaysOf, creditLimitOf, creditTermsLabel, holdsFor, invoiceTotals, owedBy, priceList, round2, shortages, stockAt, todayIso, trackedProducts } from '@/data/erp';
import { notifyOrder } from '@/ui/notify';
import { newId } from '@/data/ids';
import { HOLD_LABEL, WAREHOUSE, PAYMENT_METHODS, type Account, type InvoiceLine, type PaymentMethod, type SalesChannel } from '@/data/types';
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
  const params = useLocalSearchParams<{ accountId?: string; callId?: string; mode?: string }>();
  const { me, data, accounts, products, erp, run, settings, money, manager, getAccount, v2, ordersOnly, finance, getUser } = useErp();
  // 2.13: reps place orders (the office invoices them) unless the company allows invoicing on the spot.
  const orderMode = ordersOnly || params.mode === 'order';
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ title: orderMode ? 'New order' : 'New sale' }), [navigation, orderMode]);
  const [accountId, setAccountId] = useState(params.accountId);
  const [channel, setChannel] = useState<SalesChannel | undefined>(undefined);
  const [distributorId, setDistributorId] = useState<string | undefined>(undefined);
  const [delivery, setDelivery] = useState('');
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

  const picked = accountId ? getAccount(accountId) : undefined;
  // HCOs only: an order started from a doctor goes to one of the places they work.
  const needsHco = v2 && settings.hcoOnly && picked?.type === 'HCP';
  const account = needsHco ? undefined : picked;
  const ch: SalesChannel = channel ?? account?.channel ?? 'Direct';
  const dist = distributorId ?? account?.distributorId;
  const distributors = (data.distributors ?? []).filter((d) => d.active);
  const list = priceList(products);
  const stock = useMemo(() => stockAt(data, from), [data, from]);
  const tracked = useMemo(() => trackedProducts(data), [data]);
  const disc = Math.min(100, Math.max(0, Number(discount) || 0));
  const lines: InvoiceLine[] = list
    .filter((p) => (qty[p.name] ?? 0) > 0)
    .map((p) => ({ product: p.name, qty: qty[p.name], unitPrice: p.price ?? 0, ...(disc ? { discountPercent: disc } : {}), vatPercent: p.vatExempt ? 0 : settings.vatPercent }));
  const totals = invoiceTotals({ lines, payments: [], status: 'Issued' });
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const short = ch === 'Distributor' ? [] : shortages(data, from, lines);
  const owed = account ? owedBy(data, account.id) : 0;
  const limit = account ? (v2 ? creditLimitOf(account, settings) : account.creditLimit) : undefined;
  const overLimit = ch === 'Direct' && limit !== undefined && paid !== 'In full' && round2(owed + totals.total - (paid === 'Part' ? Number(amount) || 0 : 0)) > limit;
  const holds = account && orderMode ? holdsFor(data, { id: '', accountId: account.id, channel: ch, lines }) : [];
  const days = account && v2 ? creditDaysOf(account, settings) : terms;
  const noPrice = lines.filter((l) => !l.unitPrice);

  if (!erp) return <ErpOff />;

  if (needsHco && picked) return <PickWorkplace hcp={picked} onPick={setAccountId} />;
  if (!account) return <PickCustomer accounts={v2 && settings.hcoOnly ? accounts.filter((a) => a.type === 'HCO') : accounts} search={search} setSearch={setSearch} onPick={setAccountId} title={orderMode ? 'Who is ordering?' : undefined} />;

  const set = (name: string, n: number) => setQty((q) => ({ ...q, [name]: Math.max(0, Math.min(100000, Math.round(n) || 0)) }));
  const shown = list.filter((p) => !find.trim() || `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()));

  const saveOrder = () => {
    if (!lines.length) return;
    if (ch === 'Distributor' && !dist) return notify('Choose the distributor', 'Pick the distributor this customer buys through.');
    setBusy(true);
    try {
      const id = newId('ord');
      const order = {
        id, number: '', accountId: account.id, ownerId: me.id, channel: ch, ...(ch === 'Distributor' ? { distributorId: dist } : {}),
        lines: lines.map((l) => ({ product: l.product, qty: l.qty, unitPrice: l.unitPrice, ...(l.discountPercent ? { discountPercent: l.discountPercent } : {}) })),
        deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(delivery) ? delivery : undefined, orderRef: orderRef.trim() || undefined, notes: notes.trim() || undefined, callId: params.callId, status: 'Submitted' as const, createdAt: '',
      };
      run({ type: 'order.create', order });
      notifyOrder({ ...order, holds }, { data, me, getUser, getAccount, money });
      router.replace({ pathname: '/erp/order/[id]', params: { id, created: '1' } });
    } catch (e) {
      notify('Not sent', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const save = () => {
    if (orderMode) return saveOrder();
    if (!lines.length) return;
    if (v2 && ch === 'Distributor' && !dist) return notify('Choose the distributor', 'Pick the distributor this customer bought through.');
    const pay = paid === 'In full' ? totals.total : paid === 'Part' ? round2(Number(amount) || 0) : 0;
    if (paid === 'Part' && !(pay > 0 && pay < totals.total)) return notify('Check the amount', `Enter how much they paid now, less than ${money(totals.total)}.`);
    setBusy(true);
    try {
      const id = newId('inv');
      const today = todayIso();
      const viaDistributor = v2 && ch === 'Distributor';
      run({
        type: 'invoice.create',
        invoice: {
          id, number: '', accountId: account.id, ownerId: me.id, date: today, dueDate: addDays(today, days), lines, orderRef: orderRef.trim() || undefined, notes: notes.trim() || undefined,
          stockFrom: viaDistributor ? '' : from, status: 'Issued', payments: [], callId: params.callId, createdAt: '', ...(viaDistributor ? { channel: 'Distributor' as const, distributorId: dist } : {}),
        },
      });
      // 2.13: Finance records money in; anyone else reports it for Finance to confirm.
      if (pay > 0 && !viaDistributor) {
        if (!v2 || finance) run({ type: 'invoice.pay', invoiceId: id, payment: { id: newId('pay'), amount: pay, method, date: today, reference: payRef.trim() || undefined, receiptNo: '', byId: me.id, at: '' } });
        else run({ type: 'payment.submit', claim: { id: newId('pcl'), accountId: account.id, invoiceId: id, amount: pay, method, date: today, reference: payRef.trim() || undefined, byId: me.id, at: '', status: 'Pending' } });
      }
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
                {limit !== undefined ? ` · limit ${money(limit)}` : ''}
                {v2 ? ` · ${creditTermsLabel(creditDaysOf(account, settings))}` : ''}
              </Text>
            </View>
            {!params.accountId && <Text style={text.link}>Change</Text>}
          </Row>
        </Card>

        {v2 && (
          <Card>
            <Label>{orderMode ? 'The customer buys' : 'The customer bought'}</Label>
            <Segmented options={['Direct', 'Distributor'] as SalesChannel[]} value={ch} onChange={setChannel} labels={{ Direct: 'From us (direct)', Distributor: 'Through a distributor' }} />
            {ch === 'Distributor' &&
              (distributors.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm }}>
                  {distributors.map((d) => (
                    <Chip key={d.id} label={d.name} selected={dist === d.id} onPress={() => setDistributorId(d.id)} />
                  ))}
                </View>
              ) : (
                <Text style={[text.muted, { marginTop: space.sm }]}>No distributors yet. Finance or the invoicing officer adds them under Ava ERP › Distributors.</Text>
              ))}
            {ch === 'Distributor' && <Text style={[text.small, { marginTop: space.sm }]}>Counts towards your sales. Nothing is owed to us and no stock moves: the distributor bills the customer.</Text>}
          </Card>
        )}

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

        {lines.length > 0 && orderMode && (
          <>
            <SectionTitle>Order details</SectionTitle>
            <Card>
              <Label>Delivery</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {[0, 1, 2, 7].map((d) => {
                  const day = addDays(todayIso(), d);
                  return <Chip key={d} label={d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === 7 ? 'Next week' : 'In 2 days'} selected={delivery === day} onPress={() => setDelivery(delivery === day ? '' : day)} />;
                })}
              </View>
              <Field label="Discount on every line (%)" value={discount} onChangeText={(v) => setDiscount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" hint={settings.discountApproval !== undefined ? `Above ${settings.discountApproval}% needs a credit approver` : undefined} />
              <Field label="Customer’s order number (LPO)" value={orderRef} onChangeText={setOrderRef} placeholder="Optional" />
              <Field label="Notes for the office" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
            </Card>
            {ch === 'Direct' && account && days === 0 && <Banner tone="info" icon="cash-outline">{account.name} is on cash and carry: they pay before delivery.</Banner>}
            {holds.length > 0 && (
              <Banner tone="warn" icon="hand-left-outline">
                This order will wait: {holds.map((h) => HOLD_LABEL[h].toLowerCase()).join(' and ')}. {holds.includes('discount') && holds.length === 1 ? 'A credit approver' : 'Finance'} decides before it is invoiced.
              </Banner>
            )}
            <Text style={[text.small, { marginBottom: space.md }]}>It goes to the invoicing officer, with your line manager copied.</Text>
          </>
        )}

        {lines.length > 0 && !orderMode && (
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
              {v2 && paid !== 'Not yet' && !finance && <Text style={text.small}>Finance confirms the money before a receipt is issued.</Text>}
              {paid !== 'In full' && !v2 && (
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
                  {manager && ch === 'Direct' && (
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
            {overLimit && <Banner tone={v2 && !finance ? 'danger' : 'warn'}>This takes {account.name} over their credit limit of {money(limit!)}.{v2 && !finance ? ' Place an order instead: Finance can release it.' : ''}</Banner>}
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
            <Button title={orderMode ? 'Send order' : paid === 'In full' ? 'Sell & take payment' : 'Create invoice'} icon={orderMode ? 'paper-plane-outline' : 'checkmark-circle-outline'} onPress={save} disabled={busy} />
          </View>
        </View>
      )}
    </View>
  );
}

/** An order for a doctor goes to an HCO they work at (business accounts only). */
function PickWorkplace({ hcp, onPick }: { hcp: Account; onPick: (id: string) => void }) {
  const { accounts } = useErp();
  const places = accounts.filter((a) => a.type === 'HCO' && (hcp.workplaces?.includes(a.id) || (hcp.affiliation && a.name === hcp.affiliation)));
  return (
    <Screen>
      <Text style={[text.h2, { marginBottom: space.sm }]}>Which business is buying?</Text>
      <Text style={[text.muted, { marginBottom: space.md }]}>Orders and invoices go to business accounts (HCOs), not to doctors. Pick where {hcp.name} works.</Text>
      <Card style={{ padding: 0 }}>
        {places.map((a) => (
          <Pressable key={a.id} onPress={() => onPick(a.id)} style={({ pressed }) => [styles.cust, pressed && { opacity: 0.7 }]}>
            <Ionicons name="business-outline" size={18} color={colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{a.name}</Text>
              <Text style={text.muted}>{a.city}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ))}
        {!places.length && <Text style={[text.muted, { padding: space.lg }]}>{hcp.name} has no workplace on file.</Text>}
      </Card>
      <Button title="Choose another business" variant="ghost" icon="search-outline" onPress={() => onPick('')} />
    </Screen>
  );
}

function PickCustomer({ accounts, search, setSearch, onPick, title }: { accounts: Account[]; search: string; setSearch: (v: string) => void; onPick: (id: string) => void; title?: string }) {
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
      <Text style={[text.h2, { marginBottom: space.sm }]}>{title ?? 'Who is buying?'}</Text>
      <SearchBox placeholder={accounts.every((a) => a.type === 'HCO') ? 'Pharmacy, hospital or clinic' : 'Pharmacy, hospital or doctor'} value={search} onChangeText={setSearch} autoFocus />
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
