import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { achieved, addDays, customerBalances, daysBetween, promiseState, todayIso } from '@/data/erp';
import { newId } from '@/data/ids';
import { Badge, Button, Card, Empty, Field, Kpi, KpiRow, ProgressBar, Row, SectionTitle, text } from '@/ui/components';
import { ErpOff, useErp } from '@/ui/erp';
import { dayLabel } from '@/ui/erpDocs';
import { useAttempt } from '@/ui/opsCards';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** Digits only, with a Nigerian 0 turned into 234, for a WhatsApp link. */
const waNumber = (phone?: string) => {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.startsWith('0') ? `234${d.slice(1)}` : d;
};

/**
 * 2.14 collections: the customers who owe, overdue first, with a WhatsApp reminder, promises to pay
 * (kept or broken) and this month's collection target.
 */
export default function CollectionsScreen() {
  const { me, data, erp, money, company, settings } = useErp();
  const attempt = useAttempt();
  const today = todayIso();
  const [promising, setPromising] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(addDays(today, 7));
  if (!erp) return <ErpOff />;
  const soon = addDays(today, 7);
  const rows = customerBalances(data).filter((r) => r.owed > 0);
  const overdue = rows.filter((r) => r.overdue > 0);
  const dueSoon = rows.filter((r) => !r.overdue && r.oldestDue && r.oldestDue <= soon);
  const promises = (data.promises ?? []).filter((p) => !p.cancelled).sort((a, b) => a.date.localeCompare(b.date));
  const month = today.slice(0, 7);
  const target = (data.targets ?? []).find((t) => t.userId === me.id && t.month === month);
  const got = achieved(data, me.id, month);

  const remind = (accountId: string, owed: number, overdueAmt: number) => {
    const a = data.accounts.find((x) => x.id === accountId);
    const msg = `Hello ${a?.name ?? ''}, this is ${me.name} from ${company?.name ?? 'us'}. A friendly reminder that ${money(owed)} is outstanding${overdueAmt ? `, of which ${money(overdueAmt)} is overdue` : ''}. Please let me know when we can expect payment. Thank you.`;
    const n = waNumber(a?.phone);
    Linking.openURL(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`);
  };

  const promise = (accountId: string) => {
    const n = Number(amount.replace(/,/g, ''));
    if (attempt({ type: 'promise.add', promise: { id: newId('prm'), accountId, amount: n, date, byId: me.id, at: '' } })) {
      setPromising(null);
      setAmount('');
    }
  };

  const Customer = ({ r }: { r: (typeof rows)[number] }) => {
    const late = r.oldestDue && r.oldestDue < today ? daysBetween(r.oldestDue, today) : 0;
    return (
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={text.title} onPress={() => router.push({ pathname: '/erp/customer/[id]', params: { id: r.account.id } })}>
              {r.account.name}
            </Text>
            <Text style={text.muted}>
              Owes {money(r.owed)}
              {r.overdue ? ` · ${money(r.overdue)} overdue` : r.oldestDue ? ` · due ${dayLabel(r.oldestDue)}` : ''}
            </Text>
          </View>
          {late > 0 && <Badge label={`${late} days late`} fg={colors.danger} bg={colors.dangerSoft} />}
        </Row>
        {promising === r.account.id ? (
          <>
            <Row gap={space.sm}>
              <View style={{ flex: 1 }}>
                <Field label={`Amount (${settings.currency})`} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={String(r.owed)} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Pay by (YYYY-MM-DD)" value={date} onChangeText={setDate} />
              </View>
            </Row>
            <Row gap={space.sm}>
              <Button small variant="ghost" title="Back" onPress={() => setPromising(null)} />
              <Button small title="Save promise" disabled={!(Number(amount.replace(/,/g, '')) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => promise(r.account.id)} />
            </Row>
          </>
        ) : (
          <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
            <Button small variant="ghost" title="WhatsApp reminder" icon="logo-whatsapp" onPress={() => remind(r.account.id, r.owed, r.overdue)} />
            <Button small variant="ghost" title="Promise to pay" icon="calendar-outline" onPress={() => setPromising(r.account.id)} />
            <Button small title="Payment" icon="cash-outline" onPress={() => router.push({ pathname: '/erp/payment', params: { accountId: r.account.id } })} />
          </Row>
        )}
      </Card>
    );
  };

  return (
    <Screen wide>
      <KpiRow>
        <Kpi icon="alarm-outline" label="Overdue" value={money(overdue.reduce((n, r) => n + r.overdue, 0))} tone={overdue.length ? colors.danger : undefined} sub={`${overdue.length} customer${overdue.length === 1 ? '' : 's'}`} />
        <Kpi icon="time-outline" label="Due in 7 days" value={money(dueSoon.reduce((n, r) => n + r.owed, 0))} sub={`${dueSoon.length} customer${dueSoon.length === 1 ? '' : 's'}`} />
        <Kpi icon="flag-outline" label="Collected this month" value={money(got.collection)} sub={target?.collection ? `Target ${money(target.collection)}` : 'No target set'} />
      </KpiRow>
      {target?.collection ? (
        <Card>
          <Text style={text.title}>Collection target · {Math.round((got.collection / target.collection) * 100)}%</Text>
          <ProgressBar value={Math.min(1, got.collection / target.collection)} />
        </Card>
      ) : null}

      <SectionTitle>Overdue ({overdue.length})</SectionTitle>
      {overdue.length ? overdue.map((r) => <Customer key={r.account.id} r={r} />) : <Empty icon="checkmark-done-outline">Nobody is overdue.</Empty>}

      {dueSoon.length > 0 && (
        <>
          <SectionTitle>Due in the next 7 days ({dueSoon.length})</SectionTitle>
          {dueSoon.map((r) => (
            <Customer key={r.account.id} r={r} />
          ))}
        </>
      )}

      {promises.length > 0 && (
        <>
          <SectionTitle>Promises to pay</SectionTitle>
          <Card style={{ padding: 0 }}>
            {promises.map((p) => {
              const st = promiseState(data, p, today);
              const tone = st === 'Kept' ? colors.success : st === 'Broken' ? colors.danger : colors.primary;
              return (
                <Row key={p.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{data.accounts.find((a) => a.id === p.accountId)?.name ?? 'Customer'}</Text>
                    <Text style={text.small}>
                      {money(p.amount)} by {dayLabel(p.date)}
                    </Text>
                  </View>
                  <Badge label={st} fg={tone} bg={colors.sunken} />
                  {st === 'Open' && p.byId === me.id && <Button small variant="ghost" title="Cancel" onPress={() => attempt({ type: 'promise.cancel', id: p.id })} />}
                </Row>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}
