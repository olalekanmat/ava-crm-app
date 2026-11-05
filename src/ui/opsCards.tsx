import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { isAdmin, manages } from '@/data/access';
import { formatMoney } from '@/data/erp';
import { approverOf, type Mutation } from '@/data/mutations';
import { can } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import type { ContentDoc, Expense, ReturnRequest, SafetyReport, Snapshot, User } from '@/data/types';
import { Badge, Button, Card, Chip, Field, Row, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { dayLabel } from '@/ui/erpDocs';
import { notifyPerson } from '@/ui/notify';
import { colors, radius, space } from '@/ui/theme';

/** Runs a change and shows why when it is refused. */
export function useAttempt() {
  const { run } = useStore();
  return (m: Mutation, after?: () => void) => {
    try {
      run(m);
      after?.();
      return true;
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
      return false;
    }
  };
}

const money = (n: number, cur: string) => formatMoney(n, cur);

/** A yes-or-no card: approve, or turn down with a reason. */
function Decide({ title, lines, photo, canDecide, onDecide, approveLabel = 'Approve', rejectLabel = 'Turn down', rejectHint = 'Why?', extra }: { title: string; lines: string[]; photo?: string; canDecide: boolean; onDecide: (approve: boolean, note: string) => void; approveLabel?: string; rejectLabel?: string; rejectHint?: string; extra?: ReactNode }) {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [big, setBig] = useState(false);
  return (
    <Card>
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={text.title}>{title}</Text>
          {lines.filter(Boolean).map((l, i) => (
            <Text key={i} style={i ? text.small : text.muted}>
              {l}
            </Text>
          ))}
        </View>
        {photo && (
          <Pressable onPress={() => setBig(!big)} accessibilityLabel="Show the photo">
            <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.sunken }} contentFit="cover" />
          </Pressable>
        )}
      </Row>
      {big && photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 320, marginTop: space.sm, borderRadius: radius.md }} contentFit="contain" />}
      {extra}
      {canDecide && (
        <>
          {rejecting && <Field label={rejectHint} value={note} onChangeText={setNote} />}
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            {rejecting ? (
              <>
                <Button small variant="ghost" title="Back" onPress={() => setRejecting(false)} />
                <Button small variant="danger" title={rejectLabel} disabled={!note.trim()} onPress={() => onDecide(false, note.trim())} />
              </>
            ) : (
              <>
                <Button small variant="ghost" title={rejectLabel} onPress={() => setRejecting(true)} />
                <Button small title={approveLabel} icon="checkmark" onPress={() => onDecide(true, note.trim())} />
              </>
            )}
          </Row>
        </>
      )}
    </Card>
  );
}

/** 2.14: a return for Finance to approve (credit note) or turn down. */
export function ReturnCard({ r }: { r: ReturnRequest }) {
  const me = useMe();
  const { data, getAccount, getUser } = useStore();
  const attempt = useAttempt();
  const cur = data.settings.erp?.currency ?? 'NGN';
  const inv = (data.invoices ?? []).find((i) => i.id === r.invoiceId);
  const by = getUser(r.byId);
  return (
    <Decide
      title={`Return · ${getAccount(r.accountId)?.name ?? 'Customer'}`}
      lines={[`${r.lines.map((l) => `${l.qty} ${l.product}`).join(', ')} · ${r.condition.toLowerCase()} · ${inv?.number ?? ''}`, `${r.reason} · asked by ${by?.name ?? 'someone'}${r.amount ? ` · about ${money(r.amount, cur)}` : ''}`]}
      canDecide={can(me, 'finance') && r.status === 'Pending'}
      approveLabel="Approve and credit"
      onDecide={(approve, note) =>
        attempt({ type: 'return.review', id: r.id, approve, note: note || undefined }, () =>
          notifyPerson(by, approve ? 'Return approved' : 'Return turned down', approve ? `Finance approved the return on ${inv?.number ?? 'the invoice'}; a credit note lowers what ${getAccount(r.accountId)?.name ?? 'the customer'} owes.` : `Finance turned down the return on ${inv?.number ?? 'the invoice'}: ${note}`),
        )
      }
    />
  );
}

/** Who may approve this person's expenses: their approver or manager, or an administrator (never themselves). */
export const approvesExpenses = (s: Pick<Snapshot, 'users'>, me: User, userId: string) => userId !== me.id && (isAdmin(me) || approverOf(s.users, userId)?.id === me.id || manages(s.users, me, userId));

/** 2.15: an expense claim: the manager approves, Finance pays. */
export function ExpenseCard({ e }: { e: Expense }) {
  const me = useMe();
  const { data, getUser } = useStore();
  const attempt = useAttempt();
  const cur = data.settings.erp?.currency ?? 'NGN';
  const who = getUser(e.userId);
  const review = e.status === 'Pending' && approvesExpenses(data, me, e.userId);
  const pay = e.status === 'Approved' && can(me, 'finance');
  return (
    <Decide
      title={`${money(e.amount, cur)} · ${e.category}`}
      lines={[`${who?.name ?? 'Someone'} · ${dayLabel(e.date)} · ${e.status}`, e.note ?? '', e.decisionNote ? `Note: ${e.decisionNote}` : '']}
      photo={e.photo}
      canDecide={review}
      onDecide={(approve, note) => attempt({ type: 'expense.review', id: e.id, approve, note: note || undefined }, () => notifyPerson(who, approve ? 'Expense approved' : 'Expense turned down', approve ? `Your ${e.category.toLowerCase()} expense of ${money(e.amount, cur)} was approved; Finance pays it.` : `Your ${e.category.toLowerCase()} expense of ${money(e.amount, cur)} was turned down: ${note}`))}
      extra={pay ? <Button small title="Mark paid" icon="cash-outline" onPress={() => attempt({ type: 'expense.pay', ids: [e.id] }, () => notifyPerson(who, 'Expense paid', `Finance paid your ${e.category.toLowerCase()} expense of ${money(e.amount, cur)}.`))} /> : undefined}
    />
  );
}

/** 2.15: marketing material for Medical/Compliance to approve. */
export function ContentCard({ d }: { d: ContentDoc }) {
  const me = useMe();
  const { getUser } = useStore();
  const attempt = useAttempt();
  const by = getUser(d.byId);
  return (
    <Decide
      title={`${d.title} (v${d.version})`}
      lines={[`${d.kind}${d.product ? ` · ${d.product}` : ''} · ${d.status}${d.code ? ` · ${d.code}` : ''}`, `From ${by?.name ?? 'Marketing'}${d.endDate ? ` · use until ${dayLabel(d.endDate)}` : ''}`, d.reviewNote ? `Note: ${d.reviewNote}` : '']}
      canDecide={d.status === 'Pending' && can(me, 'medical')}
      rejectLabel="Send back"
      rejectHint="What needs to change?"
      onDecide={(approve, note) => attempt({ type: 'content.review', id: d.id, approve, note: note || undefined }, () => notifyPerson(by, approve ? `Approved: ${d.title}` : `Changes needed: ${d.title}`, approve ? `${d.title} (v${d.version}) is approved for use with doctors.` : `Medical sent back ${d.title}: ${note}`))}
      extra={d.url ? <Text style={[text.link, { marginTop: space.xs }]} onPress={() => Linking.openURL(d.url!)}>Open the material</Text> : undefined}
    />
  );
}

/** 2.15: an adverse event, complaint or medical question for Medical to acknowledge and close. */
export function SafetyCard({ r }: { r: SafetyReport }) {
  const me = useMe();
  const { getAccount, getUser } = useStore();
  const attempt = useAttempt();
  const [response, setResponse] = useState(r.response ?? '');
  const by = getUser(r.byId);
  const medical = can(me, 'medical');
  return (
    <Card>
      <Row>
        <Text style={[text.title, { flex: 1 }]}>
          {r.kind} · {r.product}
        </Text>
        <Badge label={r.serious ? 'Serious' : r.status} fg={r.serious || r.status === 'New' ? colors.danger : colors.muted} bg={r.serious || r.status === 'New' ? colors.dangerSoft : colors.sunken} />
      </Row>
      <Text style={text.muted}>
        {r.description}
      </Text>
      <Text style={text.small}>
        {[r.accountId ? getAccount(r.accountId)?.name : '', r.patientAge ? `age ${r.patientAge}` : '', r.patientSex && r.patientSex !== 'Unknown' ? r.patientSex.toLowerCase() : '', r.onset ? `onset ${dayLabel(r.onset)}` : '', r.batch ? `batch ${r.batch}` : ''].filter(Boolean).join(' · ')}
      </Text>
      <Text style={text.small}>
        Reported by {by?.name ?? 'someone'} on {new Date(r.at).toLocaleString()}
        {r.handledBy ? ` · ${r.status.toLowerCase()} by ${getUser(r.handledBy)?.name ?? 'Medical'}` : ''}
      </Text>
      {r.response && !medical && <Text style={[text.small, { marginTop: space.xs }]}>Medical: {r.response}</Text>}
      {medical && r.status !== 'Closed' && (
        <>
          <Field label="How it was handled" value={response} onChangeText={setResponse} multiline placeholder="e.g. Reported to NAFDAC on 6 Nov, ref …" />
          <Row gap={space.sm}>
            {r.status === 'New' && <Button small variant="ghost" title="Acknowledge" onPress={() => attempt({ type: 'safety.handle', id: r.id, status: 'Acknowledged', response: response.trim() || undefined })} />}
            <Button small title="Close" icon="checkmark" disabled={!response.trim()} onPress={() => attempt({ type: 'safety.handle', id: r.id, status: 'Closed', response: response.trim() }, () => notifyPerson(by, `${r.kind} closed`, `Medical closed the ${r.kind.toLowerCase()} about ${r.product}: ${response.trim()}`))} />
          </Row>
        </>
      )}
      {r.callId && <Text style={[text.link, { marginTop: space.xs }]} onPress={() => router.push({ pathname: '/call/[id]', params: { id: r.callId! } })}>Open the call</Text>}
    </Card>
  );
}

/** 2.15: an administrator names the key account manager for a big customer (hospital, chain). */
export function KeyAccountPicker({ accountId }: { accountId: string }) {
  const { data, admin, getAccount } = useStore();
  const attempt = useAttempt();
  const a = getAccount(accountId);
  const kams = data.users.filter((u) => u.active && !u.deletedAt && u.functions?.includes('kam'));
  if (!a || !admin || !kams.length) return null;
  return (
    <Card>
      <Text style={text.title}>Key account manager</Text>
      <Text style={[text.small, { marginBottom: space.xs }]}>Sees and works this account across territories, beside its rep.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label="None" selected={!a.kamId} onPress={() => attempt({ type: 'account.kam', ids: [a.id] })} />
        {kams.map((u) => (
          <Chip key={u.id} label={u.name} selected={a.kamId === u.id} onPress={() => attempt({ type: 'account.kam', ids: [a.id], kamId: u.id })} />
        ))}
      </View>
    </Card>
  );
}

/** 2.14: Finance puts a customer on a price list (e.g. Hospitals, Pharmacies). */
export function PriceGroupPicker({ accountId }: { accountId: string }) {
  const me = useMe();
  const { data, getAccount } = useStore();
  const attempt = useAttempt();
  const a = getAccount(accountId);
  const lists = Object.keys(data.settings.erp?.priceLists ?? {});
  if (!a || !lists.length) return null;
  const edit = can(me, 'finance');
  return (
    <Card>
      <Text style={text.title}>Price list</Text>
      <Text style={[text.small, { marginBottom: space.xs }]}>{a.priceGroup ? `Sold at ${a.priceGroup} prices.` : 'Standard prices.'}</Text>
      {edit && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Standard" selected={!a.priceGroup} onPress={() => attempt({ type: 'account.priceGroup', ids: [a.id] })} />
          {lists.map((g) => (
            <Chip key={g} label={g} selected={a.priceGroup === g} onPress={() => attempt({ type: 'account.priceGroup', ids: [a.id], group: g })} />
          ))}
        </View>
      )}
    </Card>
  );
}
