import { useState } from 'react';
import { Text, View } from 'react-native';
import { manages } from '@/data/access';
import { addDays, formatDate, toDateKey } from '@/data/dates';
import { newId } from '@/data/ids';
import { spanDays } from '@/data/metrics';
import { approverOf } from '@/data/mutations';
import { useMe, useStore } from '@/data/store';
import { LEAVE_KINDS, type Leave, type LeaveKind, type LeaveStatus } from '@/data/types';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, UserAvatar, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const STATUS: Record<LeaveStatus, { fg: string; bg: string }> = {
  Pending: { fg: colors.warn, bg: colors.warnSoft },
  Approved: { fg: colors.success, bg: colors.successSoft },
  Rejected: { fg: colors.danger, bg: colors.dangerSoft },
  Cancelled: { fg: colors.muted, bg: colors.sunken },
};
const LABEL: Record<LeaveStatus, string> = { Pending: 'Waiting', Approved: 'Approved', Rejected: 'Declined', Cancelled: 'Cancelled' };

const range = (l: Pick<Leave, 'start' | 'end'>) => (l.start === l.end ? formatDate(l.start) : `${formatDate(l.start)} – ${formatDate(l.end)}`);
const days = (l: Pick<Leave, 'start' | 'end'>) => `${spanDays(l.start, l.end)} day${spanDays(l.start, l.end) === 1 ? '' : 's'}`;

/** Ask for leave, see your requests, and (managers) approve your team's. Approved leave adjusts plan pace. */
export default function LeaveScreen() {
  const me = useMe();
  const { data, getUser, run } = useStore();
  const leaves = data.leaves ?? [];
  const mine = leaves.filter((l) => l.userId === me.id).sort((a, b) => b.start.localeCompare(a.start));
  const toReview = leaves.filter((l) => l.status === 'Pending' && l.userId !== me.id && manages(data.users, me, l.userId)).sort((a, b) => a.start.localeCompare(b.start));
  const teamUpcoming = leaves
    .filter((l) => l.status === 'Approved' && l.userId !== me.id && l.end >= toDateKey(new Date()) && manages(data.users, me, l.userId))
    .sort((a, b) => a.start.localeCompare(b.start));
  const approver = approverOf(data.users, me.id);

  const tomorrow = toDateKey(addDays(new Date(), 1));
  const [start, setStart] = useState(tomorrow);
  const [end, setEnd] = useState(tomorrow);
  const [kind, setKind] = useState<LeaveKind>('Annual');
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const attempt = (f: () => void, done?: string) => {
    try {
      f();
      if (done) notify(done, '');
      return true;
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const request = () => {
    const ok = attempt(() => run({ type: 'leave.request', leave: { id: newId('lv'), userId: me.id, start, end, kind, note: note.trim() || undefined, status: 'Pending', createdAt: new Date().toISOString() } }));
    if (ok) setNote('');
  };

  return (
    <Screen>
      {toReview.length > 0 && (
        <>
          <SectionTitle>Waiting for your approval</SectionTitle>
          {toReview.map((l) => {
            const who = getUser(l.userId);
            return (
              <Card key={l.id}>
                <Row gap={space.md}>
                  {who && <UserAvatar user={who} />}
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{who?.name ?? 'Someone'}</Text>
                    <Text style={text.muted}>
                      {l.kind} leave · {range(l)} · {days(l)}
                    </Text>
                    {!!l.note && <Text style={[text.body, { marginTop: 4 }]}>{l.note}</Text>}
                  </View>
                </Row>
                <Field label="Note (needed to decline)" value={notes[l.id] ?? ''} onChangeText={(v) => setNotes({ ...notes, [l.id]: v })} placeholder="Optional when approving" />
                <Row>
                  <Button title="Approve" icon="checkmark-circle-outline" onPress={() => attempt(() => run({ type: 'leave.review', id: l.id, approve: true, note: notes[l.id] }))} />
                  <Button title="Decline" variant="danger" onPress={() => attempt(() => run({ type: 'leave.review', id: l.id, approve: false, note: notes[l.id] }))} />
                </Row>
              </Card>
            );
          })}
        </>
      )}

      <SectionTitle>Ask for leave</SectionTitle>
      <Card>
        <Label>Kind</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {LEAVE_KINDS.map((k) => (
            <Chip key={k} label={k} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="First day" value={start} onChangeText={(v) => { setStart(v); if (end < v) setEnd(v); }} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last day" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" />
          </View>
        </Row>
        <Field label="Note for your manager" value={note} onChangeText={setNote} placeholder="Optional" />
        <Button title="Send request" icon="paper-plane-outline" onPress={request} />
        <Text style={[text.small, { marginTop: space.sm }]}>
          {approver ? `${approver.name} approves it.` : 'Your administrator approves it.'} Once approved, your plan pace leaves these days out, so being away does not count as falling behind, and new plans are suggested with fewer calls.
        </Text>
      </Card>

      <SectionTitle>My leave</SectionTitle>
      {!mine.length && <Empty icon="airplane-outline">No leave requested yet.</Empty>}
      {mine.map((l) => (
        <Card key={l.id}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={text.title}>
                {l.kind} · {range(l)}
              </Text>
              <Text style={text.muted}>
                {days(l)}
                {l.reviewerId ? ` · ${LABEL[l.status].toLowerCase()} by ${getUser(l.reviewerId)?.name ?? 'your manager'}` : ''}
              </Text>
              {!!l.reviewNote && <Text style={[text.body, { marginTop: 4 }]}>“{l.reviewNote}”</Text>}
            </View>
            <Badge label={LABEL[l.status]} {...STATUS[l.status]} />
          </Row>
          {(l.status === 'Pending' || (l.status === 'Approved' && l.end >= toDateKey(new Date()))) && (
            <View style={{ marginTop: space.sm }}>
              <Button small variant="ghost" title="Cancel this leave" onPress={() => confirm('Cancel this leave?', `${l.kind} leave, ${range(l)}.`, () => attempt(() => run({ type: 'leave.cancel', id: l.id })), 'Cancel leave')} />
            </View>
          )}
        </Card>
      ))}

      {teamUpcoming.length > 0 && (
        <>
          <SectionTitle>Team leave coming up</SectionTitle>
          <Card style={{ padding: 0 }}>
            {teamUpcoming.map((l) => (
              <View key={l.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <Text style={text.title}>{getUser(l.userId)?.name}</Text>
                <Text style={text.muted}>
                  {l.kind} · {range(l)} · {days(l)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
      {!approver && me.role !== 'Admin' && <Banner tone="info">You have no manager set, so an administrator approves your leave.</Banner>}
    </Screen>
  );
}
