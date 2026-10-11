import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { formatDate } from '@/data/dates';
import { newId } from '@/data/ids';
import type { Mutation } from '@/data/mutations';
import { useStore } from '@/data/store';
import type { SampleRequest, User } from '@/data/types';
import { Badge, Button, Card, Chip, Field, Row, SectionTitle, text } from './components';
import { confirm, notify } from './confirm';
import { colors, radius, space } from './theme';

const attempt = (f: () => void, what = 'Not saved') => {
  try {
    f();
    return true;
  } catch (e) {
    notify(what, e instanceof Error ? e.message : String(e));
    return false;
  }
};

const STATUS: Record<SampleRequest['status'], { label: string; fg: string; bg: string }> = {
  Pending: { label: 'Waiting', fg: colors.warn, bg: colors.warnSoft },
  Approved: { label: 'Approved', fg: colors.success, bg: colors.successSoft },
  Rejected: { label: 'Declined', fg: colors.danger, bg: colors.dangerSoft },
  Cancelled: { label: 'Cancelled', fg: colors.muted, bg: colors.bg },
};

const itemsText = (r: SampleRequest) => r.items.map((i) => `${i.qty} ${i.product}`).join(', ');

/**
 * Approves a request and records the samples as issued, in one tap (2.9). The issue is an ordinary
 * sample.issue, so stock is right on every device, older app versions included.
 */
export function approveSampleRequest(run: (m: Mutation) => void, r: SampleRequest, batches: Record<string, { batch?: string; expiry?: string }> = {}) {
  run({ type: 'sample.requestReview', id: r.id, approve: true });
  r.items.forEach((it, i) => {
    const b = batches[it.product] ?? {};
    run({ type: 'sample.issue', issue: { id: `${r.id}-${i}`, repId: r.repId, product: it.product, qty: it.qty, batch: b.batch || undefined, expiry: b.expiry || undefined, note: 'Restock request', byId: '', at: '' } });
  });
}

/** A rep asks their manager for more samples, and follows their requests. */
export function RestockRequests({ rep }: { rep: User }) {
  const { data, products, run } = useStore();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const mine = (data.sampleRequests ?? []).filter((r) => r.repId === rep.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);

  const send = () => {
    const items = Object.entries(qty)
      .map(([product, q]) => ({ product, qty: Math.floor(+q) }))
      .filter((i) => i.qty > 0);
    if (!items.length) return notify('Nothing asked for', 'Enter how many of each product you need.');
    if (attempt(() => run({ type: 'sample.request', request: { id: newId('srq'), repId: rep.id, items, note: note.trim() || undefined, status: 'Pending', at: '' } }), 'Not sent')) {
      setOpen(false);
      setQty({});
      setNote('');
      notify('Request sent', 'Your manager sees it under Samples and Approvals.');
    }
  };

  return (
    <>
      <SectionTitle right={!open ? <Text style={text.link} onPress={() => setOpen(true)}>Ask for samples</Text> : undefined}>Restock requests</SectionTitle>
      {open && (
        <Card>
          <Text style={[text.muted, { marginBottom: space.sm }]}>How many of each do you need?</Text>
          {products.map((p) => (
            <Row key={p.id} style={{ marginBottom: space.xs }}>
              <Text style={[text.body, { flex: 1 }]}>{p.name}</Text>
              <TextInput
                value={qty[p.name] ?? ''}
                onChangeText={(v) => setQty({ ...qty, [p.name]: v.replace(/\D/g, '') })}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.faint}
                accessibilityLabel={`${p.name} quantity`}
                style={{ width: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 6, color: colors.text, textAlign: 'right' }}
              />
            </Row>
          ))}
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. CME next week" maxLength={500} />
          <Row>
            <Button title="Send request" icon="paper-plane-outline" onPress={send} />
            <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </Row>
        </Card>
      )}
      {!open && !mine.length && <Text style={[text.muted, { marginBottom: space.md }]}>Running low? Ask your manager for more; you will see the answer here.</Text>}
      {mine.map((r) => (
        <Card key={r.id}>
          <Row>
            <Text style={[text.title, { flex: 1 }]}>{itemsText(r)}</Text>
            <Badge {...STATUS[r.status]} />
          </Row>
          <Text style={text.small}>
            Sent {formatDate(r.at)}
            {r.note ? ` · “${r.note}”` : ''}
          </Text>
          {r.status === 'Rejected' && !!r.reviewNote && <Text style={[text.muted, { marginTop: 4 }]}>Declined: {r.reviewNote}</Text>}
          {r.status === 'Pending' && <Text style={[text.link, { marginTop: space.xs, fontSize: 13 }]} onPress={() => attempt(() => run({ type: 'sample.requestCancel', id: r.id }))}>Cancel request</Text>}
        </Card>
      ))}
    </>
  );
}

/** A manager decides a rep's pending requests; approving records the issue too. */
export function RestockReview({ request }: { request: SampleRequest }) {
  const { run, getUser } = useStore();
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState('');
  const [batch, setBatch] = useState<Record<string, string>>({});
  const rep = getUser(request.repId);
  const approve = () =>
    confirm(`Approve ${itemsText(request)}?`, `They are recorded as issued to ${rep?.name ?? 'the rep'} now.`, () => {
      attempt(() => approveSampleRequest(run, request, Object.fromEntries(Object.entries(batch).map(([p, b]) => [p, { batch: b.trim() }]))), 'Not approved');
    }, 'Approve');
  return (
    <Card style={{ borderColor: colors.warn }}>
      <Row>
        <Text style={[text.title, { flex: 1 }]}>{rep?.name ?? 'Rep'} asks for {itemsText(request)}</Text>
        <Text style={text.small}>{formatDate(request.at)}</Text>
      </Row>
      {!!request.note && <Text style={text.muted}>“{request.note}”</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs }}>
        {request.items.map((it) => (
          <TextInput
            key={it.product}
            value={batch[it.product] ?? ''}
            onChangeText={(v) => setBatch({ ...batch, [it.product]: v })}
            placeholder={`${it.product} batch (optional)`}
            placeholderTextColor={colors.faint}
            maxLength={60}
            style={{ minWidth: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 6, color: colors.text, marginRight: space.xs, marginBottom: space.xs }}
          />
        ))}
      </View>
      {declining && <Field label="Why not? The rep sees this." value={why} onChangeText={setWhy} maxLength={1000} />}
      <Row style={{ marginTop: space.xs }}>
        {declining ? (
          <>
            <Button small variant="danger" title="Decline" disabled={!why.trim()} onPress={() => attempt(() => run({ type: 'sample.requestReview', id: request.id, approve: false, note: why.trim() }))} />
            <Button small variant="ghost" title="Cancel" onPress={() => setDeclining(false)} />
          </>
        ) : (
          <>
            <Button small title="Approve and issue" icon="checkmark" onPress={approve} />
            <Button small variant="secondary" title="Decline" onPress={() => setDeclining(true)} />
          </>
        )}
      </Row>
    </Card>
  );
}

/** Pending requests a manager can decide, oldest first. */
export function useRestockToReview(): SampleRequest[] {
  const { data } = useStore();
  return (data.sampleRequests ?? []).filter((r) => r.status === 'Pending').sort((a, b) => a.at.localeCompare(b.at));
}

export function RestockChips({ onPick }: { onPick: (repId: string) => void }) {
  const pending = useRestockToReview();
  const { getUser } = useStore();
  if (!pending.length) return null;
  const reps = [...new Set(pending.map((r) => r.repId))];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
      {reps.map((id) => (
        <Chip key={id} icon="alert-circle-outline" label={`${getUser(id)?.name ?? 'Rep'} asks for samples`} onPress={() => onPick(id)} />
      ))}
    </View>
  );
}
