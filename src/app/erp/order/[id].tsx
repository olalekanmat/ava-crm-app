import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { manages } from '@/data/access';
import { creditDaysOf, creditLimitOf, creditTermsLabel, erpSettings, HOLD_RELEASER, lineTotals, oldestOverdueDays, orderInvoiceLines, orderTotal, owedBy, placeName, shortages, todayIso } from '@/data/erp';
import { newId } from '@/data/ids';
import { can } from '@/data/roles';
import { HOLD_LABEL, WAREHOUSE } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { dayLabel } from '@/ui/erpDocs';
import { notifyPerson } from '@/ui/notify';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';
import { OrderBadge } from '@/ui/orders';

export default function OrderScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { me, data, erp, run, money, getAccount, getUser, invoicer, places, admin } = useErp();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [from, setFrom] = useState<string>(WAREHOUSE);
  const o = (data.orders ?? []).find((x) => x.id === id);
  if (!erp && !o) return <ErpOff />;
  if (!o) return <Screen><Empty icon="cart-outline" title="Order not found">It may have been placed on another device that has not synced yet.</Empty></Screen>;

  const e = erpSettings(data.settings);
  const account = getAccount(o.accountId);
  const rep = getUser(o.ownerId);
  const lines = orderInvoiceLines(o.lines, data.products, e);
  const total = orderTotal(o.lines, data.products, e);
  const open = o.status === 'Submitted' || o.status === 'On hold';
  const releasable = (o.holds ?? []).filter((h) => can(me, HOLD_RELEASER[h]) && (o.ownerId !== me.id || admin));
  const short = o.channel === 'Direct' ? shortages(data, from, lines) : [];
  const canCancel = open && (o.ownerId === me.id || manages(data.users, me, o.ownerId));
  const office = invoicer || can(me, 'finance') || can(me, 'creditApprover');

  const attempt = (f: () => void, done?: () => void) => {
    try {
      f();
      done?.();
    } catch (err) {
      notify('Not saved', err instanceof Error ? err.message : String(err));
    }
  };

  const invoiceIt = () =>
    attempt(() => {
      const invoiceId = newId('inv');
      run({ type: 'order.invoice', id: o.id, invoiceId, date: todayIso(), stockFrom: from });
      notifyPerson(rep, `Order ${o.number} invoiced`, `Your order for ${account?.name ?? 'the customer'} was invoiced by ${me.name}.`);
      router.replace({ pathname: '/erp/invoice/[id]', params: { id: invoiceId, created: '1' } });
    });

  return (
    <Screen>
      {created === '1' && <Banner tone="success" icon="paper-plane">Order {o.number} is with the invoicing officer{rep?.managerId ? ', and your line manager is copied' : ''}.</Banner>}
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={text.small}>ORDER {o.number}</Text>
            <Text style={text.h2}>{money(total)}</Text>
            <Text style={text.muted}>
              {account?.name ?? 'Customer'} · {rep?.name ?? ''} · {new Date(o.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <OrderBadge status={o.status} />
        </Row>
      </Card>

      {o.status === 'On hold' && (
        <Banner tone="warn" icon="hand-left-outline">
          On hold: {(o.holds ?? []).map((h) => HOLD_LABEL[h]).join(', ')}. {(o.holds ?? []).some((h) => h !== 'discount') ? 'Finance' : 'A credit approver'} decides before it is invoiced.
        </Banner>
      )}
      {o.payFirst && open && <Banner tone="info" icon="cash-outline">Cash and carry: the customer pays before delivery.</Banner>}
      {o.status === 'Rejected' && <Banner tone="danger">Turned down by {getUser(o.decidedBy)?.name ?? 'the office'}: {o.decisionNote}</Banner>}
      {o.status === 'Forwarded' && <Banner tone="success">Forwarded to {data.distributors?.find((d) => d.id === o.distributorId)?.name ?? 'the distributor'} by {getUser(o.decidedBy)?.name ?? 'the office'}{o.decisionNote ? `: ${o.decisionNote}` : ''}.</Banner>}
      {o.status === 'Invoiced' && o.invoiceId && <Button title="Open the invoice" icon="receipt-outline" variant="secondary" onPress={() => router.push({ pathname: '/erp/invoice/[id]', params: { id: o.invoiceId! } })} />}

      <SectionTitle>Items</SectionTitle>
      <Card style={{ padding: 0 }}>
        {lines.map((l, i) => (
          <Row key={`${l.product}-${i}`} style={{ padding: space.md, paddingHorizontal: space.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{l.product}</Text>
              <Text style={text.muted}>
                {l.qty} × {money(l.unitPrice)}
                {l.discountPercent ? ` · ${l.discountPercent}% off` : ''}
              </Text>
            </View>
            <Text style={[text.title, { fontVariant: ['tabular-nums'] }]}>{money(lineTotals(l).total)}</Text>
          </Row>
        ))}
      </Card>

      <SectionTitle>Customer</SectionTitle>
      <Card>
        <Text style={text.title}>{account?.name}</Text>
        {account && (
          <Text style={text.muted}>
            {o.channel === 'Distributor' ? `Buys through ${data.distributors?.find((d) => d.id === o.distributorId)?.name ?? 'a distributor'}` : `Owes ${money(owedBy(data, account.id))}`}
            {o.channel === 'Direct' ? ` · limit ${creditLimitOf(account, e) !== undefined ? money(creditLimitOf(account, e)!) : 'none'} · ${creditTermsLabel(creditDaysOf(account, e))}` : ''}
            {o.channel === 'Direct' && oldestOverdueDays(data, account.id) > 0 ? ` · oldest debt ${oldestOverdueDays(data, account.id)} days overdue` : ''}
          </Text>
        )}
        {!!o.deliveryDate && <Text style={text.body}>Wanted {dayLabel(o.deliveryDate)}</Text>}
        {!!o.orderRef && <Text style={text.body}>Customer’s order {o.orderRef}</Text>}
        {!!o.notes && <Text style={text.body}>{o.notes}</Text>}
        {(o.released ?? []).map((r, i) => (
          <Text key={i} style={text.small}>
            {HOLD_LABEL[r.reason]} released by {getUser(r.by)?.name ?? 'someone'}
            {r.note ? `: ${r.note}` : ''}
          </Text>
        ))}
      </Card>

      {open && office && (
        <>
          <SectionTitle>Decide</SectionTitle>
          <Card>
            {releasable.length > 0 && (
              <>
                <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Customer paying on Friday" />
                <Button title={`Release: ${releasable.map((h) => HOLD_LABEL[h].toLowerCase()).join(', ')}`} icon="lock-open-outline" onPress={() => attempt(() => run({ type: 'order.release', id: o.id, note: note.trim() || undefined }), () => setNote(''))} />
              </>
            )}
            {o.status === 'Submitted' && invoicer && o.channel === 'Direct' && (
              <>
                <Label>Stock leaves</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[...new Set([WAREHOUSE, o.ownerId, ...places])].map((p) => (
                    <Chip key={p} label={placeName(p, getUser)} selected={from === p} onPress={() => setFrom(p)} />
                  ))}
                </View>
                {short.length > 0 && <Banner tone="warn">Not enough stock: {short.map((x) => `${x.product} (${x.have} left)`).join(', ')}.</Banner>}
                <Button title="Make the invoice" icon="receipt-outline" onPress={invoiceIt} />
              </>
            )}
            {o.status === 'Submitted' && invoicer && o.channel === 'Distributor' && (
              <Button
                title="Forward to the distributor"
                icon="send-outline"
                onPress={() => attempt(() => run({ type: 'order.forward', id: o.id, note: note.trim() || undefined }), () => notifyPerson(rep, `Order ${o.number} forwarded`, `Your order for ${account?.name ?? 'the customer'} was forwarded to the distributor.`))}
              />
            )}
            {rejecting ? (
              <>
                <Field label="Why turn it down?" value={note} onChangeText={setNote} placeholder="The rep sees this" />
                <Row gap={space.sm}>
                  <Button title="Back" variant="ghost" onPress={() => setRejecting(false)} />
                  <Button
                    title="Turn down"
                    variant="danger"
                    disabled={!note.trim()}
                    onPress={() => attempt(() => run({ type: 'order.reject', id: o.id, note: note.trim() }), () => { setRejecting(false); notifyPerson(rep, `Order ${o.number} turned down`, `Your order for ${account?.name ?? 'the customer'} was turned down: ${note.trim()}`); })}
                  />
                </Row>
              </>
            ) : (
              <Button title="Turn down" variant="ghost" icon="close-circle-outline" onPress={() => setRejecting(true)} />
            )}
          </Card>
        </>
      )}

      {canCancel && !office && <Button title="Cancel this order" variant="ghost" icon="close-circle-outline" onPress={() => attempt(() => run({ type: 'order.cancel', id: o.id }))} />}
    </Screen>
  );
}
