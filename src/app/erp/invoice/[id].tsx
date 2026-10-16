import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { manages } from '@/data/access';
import { invoiceTotals, lineTotals, payState, placeName, round2, todayIso } from '@/data/erp';
import { newId } from '@/data/ids';
import { PAYMENT_METHODS, type PaymentMethod } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, PayBadge, useErp } from '@/ui/erp';
import { dayLabel, invoiceHtml, receiptHtml, shareDocument, whatsappInvoice } from '@/ui/erpDocs';
import { Screen } from '@/ui/Screen';
import { colors, radius, space } from '@/ui/theme';

export default function InvoiceScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { me, data, erp, run, money, getAccount, getUser, admin, ctx } = useErp();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Transfer');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(todayIso());
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const inv = (data.invoices ?? []).find((i) => i.id === id);

  if (!erp && !inv) return <ErpOff />;
  if (!inv) return <Screen><Empty icon="receipt-outline" title="Invoice not found">It may have been made on another device that has not synced yet.</Empty></Screen>;

  const t = invoiceTotals(inv);
  const state = payState(inv);
  const account = getAccount(inv.accountId);
  const mine = inv.ownerId === me.id;
  const canManage = mine || manages(data.users, me, inv.ownerId);
  const canVoid = inv.status !== 'Void' && !inv.payments.length && ((mine && inv.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)) || admin || (!mine && manages(data.users, me, inv.ownerId)));
  const canUnpay = admin || (!mine && manages(data.users, me, inv.ownerId));
  const share = (html: string, name: string) => shareDocument(html, name).catch((e) => notify('Could not share', e instanceof Error ? e.message : String(e)));

  const recordPayment = () => {
    const n = round2(Number(amount) || 0);
    try {
      run({ type: 'invoice.pay', invoiceId: inv.id, payment: { id: newId('pay'), amount: n, method, date, reference: ref.trim() || undefined, receiptNo: '', byId: me.id, at: '' } });
      setPaying(false);
      setAmount('');
      setRef('');
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      {created === '1' && <Banner tone="success" icon="checkmark-circle">Invoice {inv.number} is ready. Share it with the customer below.</Banner>}

      {/* Header */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>INVOICE {inv.number}</Text>
            <Text style={styles.big}>{money(t.total)}</Text>
            <Text style={styles.headSub}>
              {account?.name ?? 'Customer'} · {dayLabel(inv.date)}
            </Text>
          </View>
          <PayBadge state={state} />
        </View>
        {inv.status !== 'Void' && (
          <View style={styles.strip}>
            <Stat label="Paid" value={money(t.paid)} />
            <Stat label="Balance" value={money(t.balance)} strong={t.balance > 0} />
            <Stat label={state === 'Overdue' ? 'Was due' : 'Due'} value={dayLabel(inv.dueDate)} danger={state === 'Overdue'} />
          </View>
        )}
      </Card>

      {inv.status === 'Void' && <Banner tone="danger">Cancelled by {getUser(inv.voidedBy)?.name ?? 'a manager'}: {inv.voidReason}. The stock went back.</Banner>}

      {/* Share: the next thing a rep does */}
      <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        <Button title="WhatsApp" icon="logo-whatsapp" onPress={() => whatsappInvoice(inv, ctx(inv)).catch(() => notify('WhatsApp not available', 'Share the PDF instead.'))} />
        <Button title="Share PDF" icon="document-outline" variant="secondary" onPress={() => share(invoiceHtml(inv, ctx(inv)), `Invoice ${inv.number}.pdf`)} />
      </Row>

      {/* Lines */}
      <SectionTitle>Items</SectionTitle>
      <Card style={{ padding: 0 }}>
        {inv.lines.map((l, i) => {
          const lt = lineTotals(l);
          return (
            <Row key={`${l.product}-${i}`} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{l.product}</Text>
                <Text style={text.muted}>
                  {l.qty} × {money(l.unitPrice)}
                  {l.discountPercent ? ` · ${l.discountPercent}% off` : ''}
                  {l.vatPercent ? ` · VAT ${l.vatPercent}%` : ' · VAT exempt'}
                </Text>
              </View>
              <Text style={[text.title, { fontVariant: ['tabular-nums'] }]}>{money(lt.total)}</Text>
            </Row>
          );
        })}
        <View style={{ padding: space.lg, gap: 4 }}>
          <Sum label="Subtotal" value={money(t.gross)} />
          {!!t.discount && <Sum label="Discount" value={`−${money(t.discount)}`} />}
          <Sum label="VAT" value={money(t.vat)} />
          <Sum label="Total" value={money(t.total)} bold />
        </View>
      </Card>

      {/* Payments */}
      <SectionTitle right={inv.status !== 'Void' && t.balance > 0 && canManage && !paying ? <Button small title="Record payment" icon="cash-outline" onPress={() => { setAmount(String(t.balance)); setPaying(true); }} /> : undefined}>Payments</SectionTitle>
      {paying && (
        <Card>
          <Field label="Amount received" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint={`Balance ${money(t.balance)}`} />
          <Label>How they paid</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} label={m} selected={m === method} onPress={() => setMethod(m)} />
            ))}
          </View>
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Reference" value={ref} onChangeText={setRef} placeholder="Optional" />
            </View>
          </Row>
          <Row gap={space.sm}>
            <Button title="Cancel" variant="ghost" onPress={() => setPaying(false)} />
            <Button title="Save payment" icon="checkmark" onPress={recordPayment} disabled={!(Number(amount) > 0)} />
          </Row>
        </Card>
      )}
      {inv.payments.length ? (
        <Card style={{ padding: 0 }}>
          {inv.payments.map((p) => (
            <Row key={p.id} style={styles.line}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{money(p.amount)}</Text>
                <Text style={text.muted}>
                  {dayLabel(p.date)} · {p.method}
                  {p.reference ? ` · ${p.reference}` : ''} · {p.receiptNo}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Share receipt" onPress={() => share(receiptHtml(inv, p, ctx(inv)), `Receipt ${p.receiptNo}.pdf`)} style={styles.iconBtn}>
                <Ionicons name="share-outline" size={18} color={colors.primary} />
              </Pressable>
              {canUnpay && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove payment"
                  onPress={() => {
                    try {
                      run({ type: 'invoice.unpay', invoiceId: inv.id, paymentId: p.id, reason: 'Recorded by mistake' });
                    } catch (e) {
                      notify('Not removed', e instanceof Error ? e.message : String(e));
                    }
                  }}
                  style={styles.iconBtn}
                >
                  <Ionicons name="close" size={18} color={colors.danger} />
                </Pressable>
              )}
            </Row>
          ))}
        </Card>
      ) : (
        !paying && <Text style={[text.muted, { marginBottom: space.md }]}>{inv.status === 'Void' ? 'None.' : 'Nothing paid yet.'}</Text>
      )}

      {/* Details */}
      <SectionTitle>Details</SectionTitle>
      <Card>
        <Detail label="Customer" value={account?.name ?? 'Customer'} onPress={account ? () => router.push({ pathname: '/erp/customer/[id]', params: { id: account.id } }) : undefined} />
        <Detail label="Sold by" value={getUser(inv.ownerId)?.name ?? '—'} />
        <Detail label="Stock from" value={placeName(inv.stockFrom, getUser)} />
        {!!inv.orderRef && <Detail label="Customer’s order" value={inv.orderRef} />}
        {!!inv.notes && <Detail label="Notes" value={inv.notes} />}
      </Card>

      {canVoid &&
        (voiding ? (
          <Card>
            <Field label="Why cancel it?" value={reason} onChangeText={setReason} placeholder="e.g. Wrong quantity, sold again" />
            <Row gap={space.sm}>
              <Button title="Keep it" variant="ghost" onPress={() => setVoiding(false)} />
              <Button
                title="Cancel invoice"
                variant="danger"
                disabled={!reason.trim()}
                onPress={() => {
                  try {
                    run({ type: 'invoice.void', id: inv.id, reason: reason.trim() });
                    setVoiding(false);
                  } catch (e) {
                    notify('Not cancelled', e instanceof Error ? e.message : String(e));
                  }
                }}
              />
            </Row>
          </Card>
        ) : (
          <Button title="Cancel this invoice" variant="ghost" icon="close-circle-outline" onPress={() => setVoiding(true)} />
        ))}
    </Screen>
  );
}

function Stat({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={text.small}>{label}</Text>
      <Text style={[text.title, { fontVariant: ['tabular-nums'] }, strong && { color: colors.primary, fontWeight: '800' }, danger && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

function Sum({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Row>
      <Text style={[bold ? text.title : text.muted, { flex: 1 }]}>{label}</Text>
      <Text style={[bold ? styles.sumBold : text.body, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </Row>
  );
}

function Detail({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Row style={{ paddingVertical: 6 }}>
      <Text style={[text.muted, { width: 130 }]}>{label}</Text>
      <Text style={[onPress ? text.link : text.body, { flex: 1 }]} onPress={onPress}>
        {value}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg, backgroundColor: colors.primarySoft },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.primaryInk },
  big: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.8, fontVariant: ['tabular-nums'], marginVertical: 2 },
  headSub: { fontSize: 14, color: colors.muted },
  strip: { flexDirection: 'row', gap: space.md, padding: space.lg },
  line: { paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: space.md },
  sumBold: { fontSize: 18, fontWeight: '800', color: colors.text },
  iconBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
});
