import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { newId } from '@/data/ids';
import { returnValue } from '@/data/ops';
import { holdersOf } from '@/data/roles';
import { RETURN_CONDITIONS, type ReturnCondition } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, Stepper, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { notifyPerson } from '@/ui/notify';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** 2.14: goods coming back from a customer. Finance approves; a credit note then lowers the balance. */
export default function ReturnScreen() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const { me, data, erp, run, money, getAccount } = useErp();
  const inv = (data.invoices ?? []).find((i) => i.id === invoiceId);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [condition, setCondition] = useState<ReturnCondition>('Resaleable');
  const [reason, setReason] = useState('');
  if (!erp) return <ErpOff />;
  if (!inv) return <Screen><Empty title="Invoice not found">Sync and try again.</Empty></Screen>;
  const done = new Map<string, number>();
  for (const r of data.returns ?? []) if (r.invoiceId === inv.id && (r.status === 'Pending' || r.status === 'Approved')) for (const l of r.lines) done.set(l.product, (done.get(l.product) ?? 0) + l.qty);
  const products = [...new Set(inv.lines.map((l) => l.product))].map((p) => ({ product: p, max: inv.lines.filter((l) => l.product === p).reduce((n, l) => n + l.qty, 0) - (done.get(p) ?? 0) })).filter((p) => p.max > 0);
  const lines = products.filter((p) => (qty[p.product] ?? 0) > 0).map((p) => ({ product: p.product, qty: qty[p.product] }));
  const value = returnValue(inv, lines);

  const send = () => {
    try {
      run({ type: 'return.request', request: { id: newId('rtn'), invoiceId: inv.id, accountId: inv.accountId, lines, condition, reason: reason.trim(), byId: me.id, at: '', status: 'Pending' } });
      for (const f of holdersOf(data.users, 'finance').filter((u) => u.id !== me.id)) notifyPerson(f, 'Return to approve', `${me.name} asks to return ${lines.map((l) => `${l.qty} ${l.product}`).join(', ')} (${condition.toLowerCase()}) from ${getAccount(inv.accountId)?.name ?? 'a customer'} on ${inv.number}, worth ${money(value)}: ${reason.trim()}`);
      notify('Sent to Finance', 'When Finance approves, a credit note lowers what the customer owes.');
      router.back();
    } catch (e) {
      notify('Not sent', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Text style={[text.muted, { marginBottom: space.md }]}>{getAccount(inv.accountId)?.name} · {inv.number}</Text>
      {products.length ? (
        <Card>
          <Label>What comes back</Label>
          {products.map((p) => (
            <Row key={p.product} style={{ paddingVertical: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{p.product}</Text>
                <Text style={text.small}>Up to {p.max}</Text>
              </View>
              <Stepper value={qty[p.product] ?? 0} min={0} max={p.max} onChange={(v) => setQty({ ...qty, [p.product]: v })} />
            </Row>
          ))}
          <Label>Condition</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {RETURN_CONDITIONS.map((c) => (
              <Chip key={c} label={c} selected={c === condition} onPress={() => setCondition(c)} />
            ))}
          </View>
          <Text style={[text.small, { marginBottom: space.sm }]}>{condition === 'Resaleable' ? 'Goes back into the warehouse stock.' : 'Written off: it does not go back into stock.'}</Text>
          <Field label="Why?" value={reason} onChangeText={setReason} placeholder="e.g. Expired on arrival, wrong product" multiline />
          {lines.length > 0 && <Banner tone="info">Credit of about {money(value)} once Finance approves.</Banner>}
          <Button title="Send to Finance" icon="paper-plane-outline" onPress={send} disabled={!lines.length || !reason.trim()} />
        </Card>
      ) : (
        <Empty icon="return-down-back-outline" title="Nothing left to return">Everything on this invoice has already come back or is waiting for Finance.</Empty>
      )}
      <Text style={[text.small, { color: colors.faint }]}>Invoices never change: the credit note is a separate document numbered after the invoice.</Text>
    </Screen>
  );
}
