import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { invoiceTotals, owedBy, pendingClaimsBy, round2, todayIso } from '@/data/erp';
import { newId } from '@/data/ids';
import { PAYMENT_METHODS, type PaymentMethod } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SearchBox, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { notifyPerson } from '@/ui/notify';
import { pickDocPhoto } from '@/ui/photo';
import { holdersOf } from '@/data/roles';
import { Screen } from '@/ui/Screen';
import { radius, space } from '@/ui/theme';

/**
 * 2.13: a rep reports money a customer paid. It waits for Finance, who confirms it against the bank
 * and issues the receipt; only then the customer's balance goes down.
 */
export default function ReportPaymentScreen() {
  const params = useLocalSearchParams<{ accountId?: string; invoiceId?: string }>();
  const { me, data, erp, run, money, getAccount, accounts } = useErp();
  const [accountId, setAccountId] = useState(params.accountId);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Transfer');
  const [date, setDate] = useState(todayIso());
  const [ref, setRef] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!erp) return <ErpOff />;

  const account = accountId ? getAccount(accountId) : undefined;
  if (!account) {
    const q = search.trim().toLowerCase();
    const owing = accounts.filter((a) => owedBy(data, a.id) > 0 && (!q || a.name.toLowerCase().includes(q))).slice(0, 60);
    return (
      <Screen>
        <Text style={[text.h2, { marginBottom: space.sm }]}>Who paid?</Text>
        <SearchBox placeholder="Customer name" value={search} onChangeText={setSearch} autoFocus />
        <Card style={{ padding: 0, marginTop: space.md }}>
          {owing.map((a) => (
            <Row key={a.id} style={{ padding: space.md, paddingHorizontal: space.lg }}>
              <Text style={[text.title, { flex: 1 }]} onPress={() => setAccountId(a.id)}>
                {a.name}
              </Text>
              <Text style={text.muted} onPress={() => setAccountId(a.id)}>
                owes {money(owedBy(data, a.id))}
              </Text>
            </Row>
          ))}
          {!owing.length && <Text style={[text.muted, { padding: space.lg }]}>No customer {q ? `matching “${search}” ` : ''}owes anything.</Text>}
        </Card>
      </Screen>
    );
  }

  const invoice = params.invoiceId ? (data.invoices ?? []).find((i) => i.id === params.invoiceId) : undefined;
  const pending = pendingClaimsBy(data, account.id);
  const owed = round2((invoice ? invoiceTotals(invoice).balance : owedBy(data, account.id)) - pending);
  const n = round2(Number(amount) || 0);

  const take = async (source: 'camera' | 'library') => {
    try {
      const p = await pickDocPhoto(source);
      if (p) setPhoto(p);
    } catch (e) {
      notify('No photo', e instanceof Error ? e.message : String(e));
    }
  };

  const send = () => {
    setBusy(true);
    try {
      run({ type: 'payment.submit', claim: { id: newId('pcl'), accountId: account.id, ...(invoice ? { invoiceId: invoice.id } : {}), amount: n, method, date, reference: ref.trim() || undefined, photo, byId: me.id, at: '', status: 'Pending' } });
      const finance = holdersOf(data.users, 'finance');
      for (const f of finance) if (f.id !== me.id) notifyPerson(f, `Payment to confirm: ${account.name}`, `${me.name} reported ${money(n)} by ${method.toLowerCase()} from ${account.name} on ${date}${ref.trim() ? ` (reference ${ref.trim()})` : ''}.`);
      notify('Sent to Finance', 'Finance confirms the payment and issues the receipt. You can share an acknowledgement in the meantime.');
      router.back();
    } catch (e) {
      notify('Not sent', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (owed <= 0)
    return (
      <Screen>
        <Empty icon="checkmark-circle-outline" title={`${account.name} owes nothing to report`}>
          {pending > 0 ? `${money(pending)} is already waiting for Finance to confirm.` : 'All their invoices are paid.'}
        </Empty>
      </Screen>
    );

  return (
    <Screen>
      <Card>
        <Text style={text.title}>{account.name}</Text>
        <Text style={text.muted}>
          {invoice ? `Invoice ${invoice.number} · ` : ''}still owes {money(owed)}
          {pending > 0 ? ` · ${money(pending)} waiting for Finance` : ''}
        </Text>
      </Card>
      <Card>
        <Field label="Amount received" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={String(owed)} hint={invoice ? undefined : 'Finance puts it against the oldest invoices first'} />
        <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
          <Button small variant="ghost" title="All of it" onPress={() => setAmount(String(owed))} />
        </Row>
        <Label>How they paid</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} label={m} selected={m === method} onPress={() => setMethod(m)} />
          ))}
        </View>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="Date paid" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Reference" value={ref} onChangeText={setRef} placeholder="Teller or transfer ref" />
          </View>
        </Row>
        <Label>Photo of the teller or slip (optional)</Label>
        {photo ? (
          <View style={{ gap: space.sm }}>
            <Image source={{ uri: photo }} style={{ width: '100%', height: 220, borderRadius: radius.md }} contentFit="contain" />
            <Button small variant="ghost" title="Remove photo" onPress={() => setPhoto(undefined)} />
          </View>
        ) : (
          <Row gap={space.sm}>
            <Button small variant="secondary" icon="camera-outline" title="Take photo" onPress={() => take('camera')} />
            <Button small variant="ghost" icon="image-outline" title="Choose" onPress={() => take('library')} />
          </Row>
        )}
      </Card>
      {n > owed + 0.005 && <Banner tone="danger">That is more than the {money(owed)} still owed.</Banner>}
      <Button title="Send to Finance" icon="paper-plane-outline" onPress={send} disabled={busy || !(n > 0) || n > owed + 0.005} />
    </Screen>
  );
}
