import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { manages } from '@/data/access';
import { formatDate } from '@/data/dates';
import { useMe, useStore } from '@/data/store';
import type { Account, AccountChange, AccountChanges } from '@/data/types';
import { Badge, Button, Card, Empty, Row, SectionTitle, TierBadge, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Grid } from '@/ui/layout';
import { inReviewWindow } from '@/data/tierReview';
import { RestockReview, useRestockToReview } from '@/ui/SampleRequests';
import { Screen } from '@/ui/Screen';
import { colors, radius, space } from '@/ui/theme';

const FIELD_LABEL: Record<keyof AccountChanges, string> = {
  name: 'Name',
  type: 'Kind',
  specialty: 'Specialty',
  affiliation: 'Affiliation',
  workplaces: 'Also works at',
  address: 'Address',
  city: 'City',
  phone: 'Phone',
  email: 'Email',
};

/** Account corrections and new accounts waiting for a manager, and the requests a person sent. */
export default function ApprovalsScreen() {
  const me = useMe();
  const { data, run, admin, getAccount } = useStore();
  const canReview = (ownerId: string) => admin || (me.role !== 'Rep' && manages(data.users, me, ownerId));
  const changes = data.accountChanges ?? [];
  const toReview = changes.filter((c) => c.status === 'Pending' && c.byId !== me.id && canReview(getAccount(c.accountId)?.ownerId ?? ''));
  const newAccounts = data.accounts.filter((a) => a.pendingReview && !a.deletedAt && a.ownerId !== me.id && canReview(a.ownerId));
  const mine = changes.filter((c) => c.byId === me.id).sort((a, b) => b.at.localeCompare(a.at));

  const attempt = (f: () => void) => {
    try {
      f();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmAll = () =>
    confirm(`Confirm ${newAccounts.length} new account${newAccounts.length > 1 ? 's' : ''}?`, 'They become normal accounts for everyone.', () => attempt(() => run({ type: 'account.verify', ids: newAccounts.map((a) => a.id), approve: true })), 'Confirm all');

  const { cycle } = useStore();
  const tierReview = me.role !== 'Rep' && inReviewWindow(cycle);
  const restock = useRestockToReview().filter((r) => r.repId !== me.id || admin);
  const nothing = !toReview.length && !newAccounts.length && !mine.length && !restock.length && !tierReview;

  return (
    <Screen>
      {nothing && (
        <Empty icon="checkmark-done-outline" title="Nothing waiting">
          {me.role === 'Rep' ? 'When you suggest a correction to an account, you can follow it here.' : 'Corrections from your reps and new accounts to check appear here.'}
        </Empty>
      )}

      {tierReview && (
        <Card onPress={() => router.push('/tier-review')}>
          <Row>
            <Text style={[text.title, { flex: 1 }]}>Tier review for {cycle?.name}</Text>
            <Text style={text.link}>Open</Text>
          </Row>
          <Text style={text.muted}>The cycle is ending. See which doctors Ava suggests moving up or down a tier.</Text>
        </Card>
      )}

      {restock.length > 0 && me.role !== 'Rep' && (
        <>
          <SectionTitle>Sample requests ({restock.length})</SectionTitle>
          <Grid>
            {restock.map((r) => (
              <RestockReview key={r.id} request={r} />
            ))}
          </Grid>
        </>
      )}

      {toReview.length > 0 && (
        <>
          <SectionTitle>Corrections to check ({toReview.length})</SectionTitle>
          <Grid>
            {toReview.map((c) => (
              <ReviewCard key={c.id} change={c} onDecide={(approve, note) => attempt(() => run({ type: 'account.review', id: c.id, approve, note }))} />
            ))}
          </Grid>
        </>
      )}

      {newAccounts.length > 0 && (
        <>
          <SectionTitle right={newAccounts.length > 1 ? <Button small variant="ghost" title="Confirm all" onPress={confirmAll} /> : undefined}>New accounts to confirm ({newAccounts.length})</SectionTitle>
          <Grid>
            {newAccounts.map((a) => (
              <NewAccountCard
                key={a.id}
                account={a}
                onConfirm={() => attempt(() => run({ type: 'account.verify', ids: [a.id], approve: true }))}
                onReject={() => confirm(`Turn down ${a.name}?`, 'The account is removed, with any planned visits to it.', () => attempt(() => run({ type: 'account.verify', ids: [a.id], approve: false })), 'Turn down')}
              />
            ))}
          </Grid>
        </>
      )}

      {mine.length > 0 && (
        <>
          <SectionTitle>Your requests</SectionTitle>
          <Grid>
            {mine.map((c) => (
              <MyRequest key={c.id} change={c} />
            ))}
          </Grid>
        </>
      )}
    </Screen>
  );
}

function useDisplay() {
  const { getAccount } = useStore();
  return (k: keyof AccountChanges, v: unknown): string => {
    if (v === undefined || v === null || v === '') return '—';
    if (k === 'workplaces') return (v as string[]).map((id) => getAccount(id)?.name ?? 'Unknown').join(', ') || '—';
    if (k === 'type') return v === 'HCP' ? 'Person (HCP)' : 'Organization (HCO)';
    return String(v);
  };
}

function Diff({ change, account }: { change: AccountChange; account?: Account }) {
  const show = useDisplay();
  return (
    <View style={{ gap: 6, marginTop: space.sm }}>
      {(Object.keys(change.changes) as (keyof AccountChanges)[]).map((k) => (
        <View key={k}>
          <Text style={text.small}>{FIELD_LABEL[k]}</Text>
          <Text style={text.body}>
            {change.status === 'Pending' && account && show(k, account[k]) !== '—' && (
              <Text style={{ color: colors.faint, textDecorationLine: 'line-through' }}>
                {show(k, account[k])}
                {'  '}
              </Text>
            )}
            <Text style={{ fontWeight: '600' }}>{show(k, change.changes[k])}</Text>
          </Text>
        </View>
      ))}
      {!!change.note && <Text style={text.muted}>“{change.note}”</Text>}
    </View>
  );
}

function ReviewCard({ change, onDecide }: { change: AccountChange; onDecide: (approve: boolean, note?: string) => void }) {
  const { getAccount, getUser } = useStore();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const account = getAccount(change.accountId);
  return (
    <Card>
      <Row>
        <Text style={[text.title, { flex: 1 }]} onPress={() => account && router.push({ pathname: '/account/[id]', params: { id: account.id } })}>
          {account?.name ?? 'Account'}
        </Text>
        <Text style={text.small}>{formatDate(change.at)}</Text>
      </Row>
      <Text style={text.muted}>From {getUser(change.byId)?.name ?? 'a rep'}</Text>
      <Diff change={change} account={account} />
      {declining && (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Why not? The rep sees this."
          placeholderTextColor={colors.faint}
          maxLength={1000}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: space.sm, color: colors.text, marginTop: space.md }}
          accessibilityLabel="Reason for declining"
        />
      )}
      <Row style={{ marginTop: space.md }}>
        {declining ? (
          <>
            <Button small variant="danger" title="Decline" disabled={!note.trim()} onPress={() => onDecide(false, note.trim())} />
            <Button small variant="ghost" title="Cancel" onPress={() => setDeclining(false)} />
          </>
        ) : (
          <>
            <Button small title="Approve" icon="checkmark" onPress={() => onDecide(true)} />
            <Button small variant="secondary" title="Decline" onPress={() => setDeclining(true)} />
          </>
        )}
      </Row>
    </Card>
  );
}

function NewAccountCard({ account, onConfirm, onReject }: { account: Account; onConfirm: () => void; onReject: () => void }) {
  const { getUser } = useStore();
  return (
    <Card>
      <Row>
        <Text style={[text.title, { flex: 1 }]} onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}>
          {account.name}
        </Text>
        <TierBadge tier={account.tier} />
      </Row>
      <Text style={text.muted}>
        {account.specialty} · {account.city}
      </Text>
      <Text style={text.small}>
        Added by {getUser(account.ownerId)?.name ?? 'a rep'}
        {account.createdAt ? ` on ${formatDate(account.createdAt)}` : ''}
      </Text>
      <Row style={{ marginTop: space.md }}>
        <Button small title="Confirm" icon="checkmark" onPress={onConfirm} />
        <Button small variant="secondary" title="Turn down" onPress={onReject} />
      </Row>
    </Card>
  );
}

function MyRequest({ change }: { change: AccountChange }) {
  const { getAccount, getUser } = useStore();
  const account = getAccount(change.accountId);
  const badge =
    change.status === 'Approved'
      ? { label: 'Approved', fg: colors.success, bg: colors.successSoft }
      : change.status === 'Rejected'
        ? { label: 'Declined', fg: colors.danger, bg: colors.dangerSoft }
        : { label: 'Waiting', fg: colors.warn, bg: colors.warnSoft };
  return (
    <Card>
      <Row>
        <Text style={[text.title, { flex: 1 }]}>{account?.name ?? 'Account'}</Text>
        <Badge {...badge} />
      </Row>
      <Text style={text.small}>Sent {formatDate(change.at)}</Text>
      <Diff change={change} account={account} />
      {change.status !== 'Pending' && (
        <Text style={[text.muted, { marginTop: space.sm }]}>
          {change.status === 'Approved' ? 'Approved' : 'Declined'} by {getUser(change.reviewerId)?.name ?? 'your manager'}
          {change.reviewedAt ? ` on ${formatDate(change.reviewedAt)}` : ''}
          {change.reviewNote ? `: “${change.reviewNote}”` : ''}
        </Text>
      )}
    </Card>
  );
}
