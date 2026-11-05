import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { allocate, creditDaysOf, creditLimitOf, creditTermsLabel } from '@/data/erp';
import { holdersOf } from '@/data/roles';
import type { CreditRequest, PaymentClaim } from '@/data/types';
import { Button, Card, Field, Row, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { useErp } from '@/ui/erp';
import { dayLabel } from '@/ui/erpDocs';
import { notifyPerson } from '@/ui/notify';
import { colors, radius, space } from '@/ui/theme';

/** A reported payment for Finance to confirm (receipt issued) or turn down with a reason. */
export function ClaimCard({ c }: { c: PaymentClaim }) {
  const { me, data, run, money, getAccount, getUser, finance } = useErp();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [big, setBig] = useState(false);
  const account = getAccount(c.accountId);
  const by = getUser(c.byId);
  const plan = allocate(data, c);
  const own = c.byId === me.id && holdersOf(data.users, 'finance').some((u) => u.id !== me.id);
  const decide = (approve: boolean) => {
    try {
      run({ type: 'payment.review', id: c.id, approve, note: note.trim() || undefined });
      notifyPerson(by, approve ? `Payment confirmed: ${account?.name ?? ''}` : `Payment turned down: ${account?.name ?? ''}`, approve ? `Finance confirmed the ${money(c.amount)} from ${account?.name ?? 'the customer'}. The receipt is ready in Ava CRM.` : `Finance turned down the ${money(c.amount)} you reported from ${account?.name ?? 'the customer'}: ${note.trim()}`);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card>
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={text.title}>
            {money(c.amount)} · {account?.name ?? 'Customer'}
          </Text>
          <Text style={text.muted}>
            {c.method} on {dayLabel(c.date)}
            {c.reference ? ` · ref ${c.reference}` : ''} · reported by {by?.name ?? 'someone'}
          </Text>
          {plan.parts.length > 0 && <Text style={text.small}>Pays {plan.parts.map((p) => (data.invoices ?? []).find((i) => i.id === p.invoiceId)?.number).join(', ')}{plan.left > 0 ? ` · ${money(plan.left)} more than owed` : ''}</Text>}
        </View>
        {c.photo && (
          <Pressable onPress={() => setBig(!big)} accessibilityLabel="Show the slip">
            <Image source={{ uri: c.photo }} style={{ width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.sunken }} contentFit="cover" />
          </Pressable>
        )}
      </Row>
      {big && c.photo && <Image source={{ uri: c.photo }} style={{ width: '100%', height: 320, marginTop: space.sm, borderRadius: radius.md }} contentFit="contain" />}
      {finance && !own && (
        <>
          {rejecting && <Field label="Why turn it down?" value={note} onChangeText={setNote} placeholder="e.g. Not in the bank statement" />}
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            {rejecting ? (
              <>
                <Button small variant="ghost" title="Back" onPress={() => setRejecting(false)} />
                <Button small variant="danger" title="Turn down" disabled={!note.trim()} onPress={() => decide(false)} />
              </>
            ) : (
              <>
                <Button small title="Confirm & issue receipt" icon="checkmark" onPress={() => decide(true)} />
                <Button small variant="ghost" title="Turn down" onPress={() => setRejecting(true)} />
              </>
            )}
          </Row>
        </>
      )}
      {own && <Text style={[text.small, { marginTop: space.sm }]}>You reported this one, so another Finance person confirms it.</Text>}
    </Card>
  );
}

/** A credit change for a credit approver: what changes, for whom, and why. */
export function CreditCard({ r }: { r: CreditRequest }) {
  const { me, data, run, money, getAccount, getUser, approver, settings } = useErp();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const by = getUser(r.byId);
  const own = r.byId === me.id && holdersOf(data.users, 'creditApprover').some((u) => u.id !== me.id);
  const names = r.accountIds.slice(0, 3).map((id) => getAccount(id)?.name ?? 'Customer');
  const first = getAccount(r.accountIds[0]);
  const decide = (approve: boolean) => {
    try {
      run({ type: 'credit.review', id: r.id, approve, note: note.trim() || undefined });
      notifyPerson(by, approve ? 'Credit change approved' : 'Credit change turned down', `${me.name} ${approve ? 'approved' : 'turned down'} your credit change for ${r.accountIds.length} customer${r.accountIds.length === 1 ? '' : 's'}${note.trim() ? `: ${note.trim()}` : '.'}`);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card>
      <Text style={text.title}>
        {[r.limit !== undefined ? `Limit ${money(r.limit)}` : '', r.days !== undefined ? creditTermsLabel(r.days) : ''].filter(Boolean).join(' · ')}
      </Text>
      <Text style={text.muted}>
        {names.join(', ')}
        {r.accountIds.length > 3 ? ` and ${r.accountIds.length - 3} more` : ''}
      </Text>
      {r.accountIds.length === 1 && first && (
        <Text style={text.small}>
          Now: limit {creditLimitOf(first, settings) !== undefined ? money(creditLimitOf(first, settings)!) : 'none'} · {creditTermsLabel(creditDaysOf(first, settings))}
        </Text>
      )}
      <Text style={text.body}>“{r.reason}” · {by?.name ?? 'Finance'}, {new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
      {r.status !== 'Pending' && (
        <Text style={text.small}>
          {r.status} by {getUser(r.decidedBy)?.name ?? 'someone'}
          {r.note ? `: ${r.note}` : ''}
        </Text>
      )}
      {r.status === 'Pending' && approver && !own && (
        <>
          {rejecting && <Field label="Why turn it down?" value={note} onChangeText={setNote} />}
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            {rejecting ? (
              <>
                <Button small variant="ghost" title="Back" onPress={() => setRejecting(false)} />
                <Button small variant="danger" title="Turn down" disabled={!note.trim()} onPress={() => decide(false)} />
              </>
            ) : (
              <>
                <Button small title="Approve" icon="checkmark" onPress={() => decide(true)} />
                <Button small variant="ghost" title="Turn down" onPress={() => setRejecting(true)} />
              </>
            )}
          </Row>
        </>
      )}
      {r.status === 'Pending' && r.byId === me.id && (
        <Button small variant="ghost" title="Withdraw" onPress={() => { try { run({ type: 'credit.cancel', id: r.id }); } catch (e) { notify('Not saved', e instanceof Error ? e.message : String(e)); } }} />
      )}
      {r.status === 'Pending' && own && <Text style={text.small}>You asked for this one, so another credit approver decides.</Text>}
      {r.accountIds.length > 1 && <Text style={[text.link, { marginTop: space.xs }]} onPress={() => router.push({ pathname: '/erp/credit', params: { request: r.id } })}>See all {r.accountIds.length}</Text>}
    </Card>
  );
}
