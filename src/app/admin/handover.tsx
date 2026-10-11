import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { manages, roleLabel } from '@/data/access';
import { describeHandover, handover, handoverCandidates, handoverTotal, type HandoverSummary } from '@/data/handover';
import { useMe, useStore } from '@/data/store';
import type { User } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Label, Row, SearchBox, SectionTitle, ToggleRow, UserAvatar, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** Moves a leaver's accounts, live plans, planned visits, open tasks, events, team and samples to someone else in one step (2.9). */
export default function HandoverScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const me = useMe();
  const { data, withDeleted, admin, run, getUser } = useStore();
  const [fromId, setFromId] = useState(params.from);
  const [toId, setToId] = useState<string>();
  const [q, setQ] = useState('');
  const [switchOff, setSwitchOff] = useState(true);
  const [done, setDone] = useState<{ from: User; to: User; summary: HandoverSummary } | null>(null);

  // Administrators hand over anyone's work; managers only between people in their own team.
  const mine = (id: string) => admin || (id !== me.id && manages(data.users, me, id));
  const from = fromId ? getUser(fromId) : undefined;
  const candidates = from ? handoverCandidates(data.users, from).filter((u) => mine(u.id)) : [];
  const preview = useMemo(() => (fromId && toId ? handover(withDeleted, fromId, toId, me.id, new Date().toISOString()).summary : undefined), [withDeleted, fromId, toId, me.id]);
  const work = (u: User) => data.accounts.filter((a) => a.ownerId === u.id).length;

  if (me.role === 'Rep' && !admin) return <Screen><Empty icon="lock-closed-outline">Your manager or an administrator hands work over.</Empty></Screen>;

  if (done) {
    const lines = describeHandover(done.summary);
    return (
      <Screen>
        <Card>
          <Row>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={[text.h2, { flex: 1 }]}>Handed over to {done.to.name}</Text>
          </Row>
          <Text style={[text.muted, { marginVertical: space.sm }]}>What moved from {done.from.name}:</Text>
          {lines.length ? lines.map((l) => <Text key={l} style={text.body}>• {l}</Text>) : <Text style={text.body}>Nothing needed to move.</Text>}
          <Text style={[text.small, { marginTop: space.sm }]}>Submitted calls, past plans and saved drafts stay in {done.from.name}’s history. Moved plans are drafts again, for {done.to.name.split(' ')[0]} to check and submit.</Text>
        </Card>
        <Button title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!from) {
    const query = q.trim().toLowerCase();
    const people = data.users
      .filter((u) => mine(u.id) && u.role !== 'Admin' && (!query || u.name.toLowerCase().includes(query) || u.email.includes(query)))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return (
      <Screen>
        <Text style={[text.muted, { marginBottom: space.sm }]}>Whose work moves? Someone leaving, on long leave, or changing territory.</Text>
        <SearchBox value={q} onChangeText={setQ} placeholder="Search people" />
        {!people.length && <Empty>No one to hand over.</Empty>}
        {people.map((u) => (
          <Card key={u.id} onPress={() => setFromId(u.id)}>
            <Row gap={space.md}>
              <UserAvatar user={u} />
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{u.name}</Text>
                <Text style={text.muted}>
                  {roleLabel(u)} · {work(u)} accounts{u.active ? '' : ' · inactive'}
                </Text>
              </View>
            </Row>
          </Card>
        ))}
      </Screen>
    );
  }

  const to = toId ? getUser(toId) : undefined;
  const go = () => {
    if (!to || !preview) return;
    const lines = describeHandover(preview);
    confirm(
      `Hand over to ${to.name}?`,
      `${lines.length ? `Moves ${lines.join(', ')}.` : 'Nothing needs to move.'}${switchOff && from.active && admin ? ` ${from.name} can no longer sign in.` : ''}`,
      () => {
        try {
          run({ type: 'user.handover', fromId: from.id, toId: to.id });
          if (switchOff && from.active && admin) {
            try {
              run({ type: 'user.upsert', user: { ...from, active: false } });
            } catch (e) {
              notify('Work moved, access still on', e instanceof Error ? e.message : String(e));
            }
          }
          setDone({ from, to, summary: preview });
        } catch (e) {
          notify('Not handed over', e instanceof Error ? e.message : String(e));
        }
      },
      'Hand over',
    );
  };

  return (
    <Screen>
      <Card>
        <Row gap={space.md}>
          <UserAvatar user={from} />
          <View style={{ flex: 1 }}>
            <Text style={text.title}>{from.name}</Text>
            <Text style={text.muted}>{roleLabel(from)}{from.territory ? ` · ${from.territory}` : ''}</Text>
          </View>
          {!params.from && <Button small variant="ghost" title="Change" onPress={() => { setFromId(undefined); setToId(undefined); }} />}
        </Row>
      </Card>

      <Label>Who takes over? (another {from.role})</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
        {candidates.map((u) => (
          <Chip key={u.id} label={`${u.name}${u.territory ? ` · ${u.territory}` : ''}`} selected={toId === u.id} onPress={() => setToId(toId === u.id ? undefined : u.id)} />
        ))}
        {!candidates.length && <Text style={text.muted}>Add another {from.role} first.</Text>}
      </View>

      {to && preview && (
        <>
          <SectionTitle>What moves to {to.name}</SectionTitle>
          <Card>
            {handoverTotal(preview) ? (
              describeHandover(preview).map((l) => <Text key={l} style={text.body}>• {l}</Text>)
            ) : (
              <Text style={text.muted}>{from.name} has nothing open to hand over.</Text>
            )}
            {preview.samples.length > 0 && (
              <Text style={[text.small, { marginTop: space.sm }]}>
                Samples: {preview.samples.map((x) => `${x.qty} ${x.product}${x.batch ? ` (${x.batch})` : ''}`).join(', ')}. Recorded as taken back from {from.name} and issued to {to.name}.
              </Text>
            )}
            {preview.plansMerged > 0 && <Text style={[text.small, { marginTop: space.sm }]}>{to.name} already has a plan for the same cycle, so the accounts are added to it.</Text>}
          </Card>
          {admin && from.active && <ToggleRow label={`Switch off ${from.name.split(' ')[0]}’s access`} value={switchOff} onChange={setSwitchOff} hint="They can no longer sign in. Their history stays. You can delete them later in Users & roles." />}
          <Banner icon="information-circle-outline">Submitted calls, past plans and saved drafts stay in {from.name}’s history.</Banner>
          <Button title="Hand over" icon="swap-horizontal-outline" onPress={go} />
        </>
      )}
    </Screen>
  );
}
