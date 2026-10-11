import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { formatDate, formatDateTime } from '@/data/dates';
import { newId } from '@/data/ids';
import { batchStock, expiringBatches, reconcile, sampleIssues, samplesGiven, sampleStock, unsignedSampleCalls } from '@/data/samples';
import { useMe, useStore } from '@/data/store';
import type { SampleCount, User } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { RestockChips, RestockRequests, RestockReview } from '@/ui/SampleRequests';
import { Screen } from '@/ui/Screen';
import { colors, radius, space, tone } from '@/ui/theme';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/** Sample stock: what a rep received from their manager and handed out in calls. Managers record issues. */
export default function SamplesScreen() {
  const me = useMe();
  const { data, products, getUser, getAccount, run } = useStore();
  const team = me.role === 'Rep' ? [] : repsUnder(data.users, me).filter((u) => u.active);
  const [repId, setRepId] = useState(me.role === 'Rep' ? me.id : team[0]?.id);
  const rep = repId ? getUser(repId) : undefined;

  if (!rep) {
    return (
      <Screen>
        <Empty icon="medkit-outline" title="No reps yet">Samples are tracked per rep. Add reps to your team first.</Empty>
      </Screen>
    );
  }

  const stock = sampleStock(data, rep.id);
  const given = samplesGiven(data.calls, rep.id).slice(0, 30);
  const issues = sampleIssues(data, rep.id).slice(0, 30);
  const batches = batchStock(data, rep.id).filter((b) => b.balance !== 0 && (b.batch || b.expiry));
  const { expired, soon } = expiringBatches(batchStock(data, rep.id), thisMonth(), 2);
  const counts = (data.sampleCounts ?? []).filter((c) => c.repId === rep.id).sort((a, b) => b.month.localeCompare(a.month));
  const unsigned = data.settings.sampleSignature === 'off' ? [] : unsignedSampleCalls(data.calls, rep.id).slice(0, 20);

  return (
    <Screen>
      {team.length > 0 && (
        <>
          <Label>Rep</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
            {team.map((u) => (
              <Chip key={u.id} label={u.name} selected={u.id === rep.id} onPress={() => setRepId(u.id)} />
            ))}
          </View>
        </>
      )}

      {team.length > 0 && <RestockChips onPick={setRepId} />}
      {rep.id !== me.id &&
        (data.sampleRequests ?? [])
          .filter((r) => r.repId === rep.id && r.status === 'Pending')
          .map((r) => <RestockReview key={r.id} request={r} />)}

      <SectionTitle>{rep.id === me.id ? 'My stock' : `${rep.name}’s stock`}</SectionTitle>
      {stock.length ? (
        <Card style={{ padding: 0 }}>
          {stock.map((x) => (
            <View key={x.product} style={{ flexDirection: 'row', alignItems: 'center', padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{x.product}</Text>
                <Text style={text.muted}>
                  {x.received} received · {x.given} handed out
                </Text>
              </View>
              <Text style={[text.title, { fontSize: 20, fontVariant: ['tabular-nums'], color: x.balance < 0 ? tone.urgent : x.balance <= 5 ? colors.warn : colors.text }]}>{x.balance}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <Empty icon="medkit-outline">{rep.id === me.id ? 'No samples yet. Your manager records the samples they give you.' : 'No samples issued yet.'}</Empty>
      )}
      {stock.some((x) => x.balance < 0) && <Banner tone="warn">More samples were handed out than received. Check the issues below or ask the manager to record what was given.</Banner>}
      {expired.length > 0 && <Banner tone="danger">Expired: {expired.map((b) => `${b.balance} ${b.product}${b.batch ? ` (batch ${b.batch})` : ''}`).join(', ')}. Do not hand these out; return them to {rep.id === me.id ? 'your manager' : 'stock'}.</Banner>}
      {soon.length > 0 && <Banner tone="warn">Expiring soon: {soon.map((b) => `${b.balance} ${b.product}${b.batch ? ` (batch ${b.batch}, ${b.expiry})` : ` (${b.expiry})`}`).join(', ')}. Hand these out first.</Banner>}

      {batches.length > 0 && (
        <>
          <SectionTitle>By batch</SectionTitle>
          <Card style={{ padding: 0 }}>
            {batches.map((b) => (
              <Row key={`${b.product}|${b.batch ?? ''}`} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={text.body}>
                    {b.product} · {b.batch ? `batch ${b.batch}` : 'no batch'}
                  </Text>
                  {!!b.expiry && <Text style={[text.small, b.expiry < thisMonth() && { color: colors.danger }]}>Expires {b.expiry}</Text>}
                </View>
                <Text style={[text.title, { fontVariant: ['tabular-nums'] }]}>{b.balance}</Text>
              </Row>
            ))}
          </Card>
        </>
      )}

      {rep.id === me.id && <RestockRequests rep={rep} />}

      <MonthlyCount mine={rep.id === me.id} repName={rep.name} counts={counts} products={stock.map((x) => x.product)} onSave={(count) => run({ type: 'sample.count', count })} />

      {unsigned.length > 0 && (
        <>
          <SectionTitle>Not signed for ({unsigned.length})</SectionTitle>
          <Card style={{ padding: 0 }}>
            {unsigned.map((c) => (
              <View key={c.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <Text style={text.title} onPress={() => router.push({ pathname: '/call/[id]', params: { id: c.id } })}>
                  {getAccount(c.accountId)?.name ?? 'Account'}
                </Text>
                <Text style={text.muted}>
                  {formatDate(c.datetime)} · {c.samples!.map((x) => `${x.qty} ${x.product}`).join(', ')}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {rep.id !== me.id && <IssueForm rep={rep} products={products.map((p) => p.name)} onSave={(issue) => run({ type: 'sample.issue', issue })} />}

      <SectionTitle>Handed out in calls</SectionTitle>
      {given.length ? (
        <Card style={{ padding: 0 }}>
          {given.map((g, i) => (
            <View key={`${g.call.id}-${i}`} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <Text style={text.title} onPress={() => router.push({ pathname: '/call/[id]', params: { id: g.call.id } })}>
                {g.qty} × {g.product}
              </Text>
              <Text style={text.muted}>
                {getAccount(g.call.accountId)?.name ?? 'Account'} · {formatDate(g.call.datetime)}
                {g.batch ? ` · batch ${g.batch}` : ''}
                {g.call.status === 'Saved' ? ' · draft' : ''}
              </Text>
            </View>
          ))}
        </Card>
      ) : (
        <Text style={[text.muted, { marginBottom: space.md }]}>None yet. Record samples in the call log when you hand them out.</Text>
      )}

      <SectionTitle>Received</SectionTitle>
      {issues.length ? (
        <Card style={{ padding: 0 }}>
          {issues.map((x) => (
            <View key={x.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <Text style={[text.title, x.qty < 0 && { color: colors.danger }]}>
                {x.qty > 0 ? `+${x.qty}` : x.qty} {x.product}
              </Text>
              <Text style={text.muted}>
                {formatDateTime(x.at)} · {x.qty > 0 ? 'from' : 'taken back by'} {getUser(x.byId)?.name ?? 'manager'}
                {x.batch ? ` · batch ${x.batch}` : ''}
              </Text>
              {!!x.note && <Text style={text.body}>{x.note}</Text>}
            </View>
          ))}
        </Card>
      ) : (
        <Text style={text.muted}>Nothing recorded.</Text>
      )}
    </Screen>
  );
}

function IssueForm({ rep, products, onSave }: { rep: User; products: string[]; onSave: (issue: { id: string; repId: string; product: string; qty: number; batch?: string; expiry?: string; note?: string; byId: string; at: string }) => void }) {
  const me = useMe();
  const [mode, setMode] = useState<'Give' | 'Take back'>('Give');
  const [product, setProduct] = useState(products[0] ?? '');
  const [qty, setQty] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const n = parseInt(qty, 10);
  const expiryOk = !expiry.trim() || /^\d{4}-(0[1-9]|1[0-2])$/.test(expiry.trim());

  const save = () => {
    try {
      onSave({ id: newId('smp'), repId: rep.id, product, qty: mode === 'Give' ? n : -n, batch: batch.trim() || undefined, expiry: expiry.trim() || undefined, note: note.trim() || undefined, byId: me.id, at: new Date().toISOString() });
      setQty('');
      setBatch('');
      setExpiry('');
      setNote('');
      notify('Recorded', `${mode === 'Give' ? 'Gave' : 'Took back'} ${n} ${product} ${mode === 'Give' ? 'to' : 'from'} ${rep.name}.`);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  if (!products.length) return <Banner tone="info">Add products in Products & rules to track samples.</Banner>;
  return (
    <>
      <SectionTitle>Record samples for {rep.name}</SectionTitle>
      <Card>
        <Segmented options={['Give', 'Take back']} value={mode} onChange={setMode} />
        <Label>Product</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
          {products.map((p) => (
            <Chip key={p} label={p} selected={p === product} onPress={() => setProduct(p)} />
          ))}
        </View>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="Quantity" value={qty} onChangeText={(v) => setQty(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="e.g. 20" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Batch" value={batch} onChangeText={setBatch} placeholder="Optional" />
          </View>
        </Row>
        <Field label="Expiry (YYYY-MM)" value={expiry} onChangeText={setExpiry} placeholder="Optional, e.g. 2027-06" maxLength={7} error={expiryOk ? undefined : 'Use YYYY-MM, e.g. 2027-06'} />
        <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
        <Button title={mode === 'Give' ? 'Record samples given' : 'Record samples taken back'} icon="medkit-outline" onPress={save} disabled={!product || !(n > 0) || !expiryOk} />
      </Card>
    </>
  );
}

/** The monthly physical count: the rep counts what they hold and Ava compares it with the records. */
function MonthlyCount({ mine, repName, counts, products, onSave }: { mine: boolean; repName: string; counts: SampleCount[]; products: string[]; onSave: (c: SampleCount) => void }) {
  const me = useMe();
  const { data } = useStore();
  const month = thisMonth();
  const current = counts.find((c) => c.month === month);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const latest = counts[0];
  const rows = latest ? reconcile(data, latest) : [];
  const off = rows.filter((r) => r.variance !== 0);

  const start = () => {
    setValues(Object.fromEntries(products.map((p) => [p, String(current?.counts.find((c) => c.product === p)?.counted ?? '')])));
    setNote(current?.note ?? '');
    setEditing(true);
  };
  const save = () => {
    try {
      const list = products.filter((p) => values[p] !== '' && values[p] !== undefined).map((p) => ({ product: p, counted: parseInt(values[p], 10) || 0 }));
      if (!list.length) return notify('Nothing counted', 'Enter how many of each product you hold, even 0.');
      onSave({ id: current?.id ?? newId('cnt'), repId: me.id, month, counts: list, note: note.trim() || undefined, at: new Date().toISOString() });
      setEditing(false);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  if (!mine && !counts.length) return null;
  return (
    <>
      <SectionTitle right={mine && !editing && products.length > 0 ? <Button small variant="ghost" title={current ? 'Recount' : 'Count now'} onPress={start} /> : undefined}>Monthly count</SectionTitle>
      {editing ? (
        <Card>
          <Text style={[text.muted, { marginBottom: space.sm }]}>Count the samples you hold today for {monthName(month)}.</Text>
          {products.map((p) => (
            <Row key={p} style={{ marginBottom: space.sm }}>
              <Text style={[text.body, { flex: 1 }]}>{p}</Text>
              <TextInput
                value={values[p] ?? ''}
                onChangeText={(v) => setValues((x) => ({ ...x, [p]: v.replace(/\D/g, '') }))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.faint}
                style={{ width: 90, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: space.sm, color: colors.text, textAlign: 'right' }}
                accessibilityLabel={`Count of ${p}`}
              />
            </Row>
          ))}
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional, e.g. 2 packs damaged" />
          <Row>
            <Button title="Save count" icon="checkmark" onPress={save} />
            <Button variant="ghost" title="Cancel" onPress={() => setEditing(false)} />
          </Row>
        </Card>
      ) : latest ? (
        <Card>
          <Text style={text.title}>
            {monthName(latest.month)} · counted {formatDate(latest.at)}
          </Text>
          {off.length ? <Text style={[text.body, { color: colors.danger, marginVertical: space.xs }]}>{off.length} product{off.length > 1 ? 's do' : ' does'} not match the records.</Text> : <Text style={[text.body, { color: colors.success, marginVertical: space.xs }]}>Matches the records.</Text>}
          {rows.map((r) => (
            <Row key={r.product} style={{ paddingVertical: 4 }}>
              <Text style={[text.body, { flex: 1 }]}>{r.product}</Text>
              <Text style={[text.muted, { fontVariant: ['tabular-nums'] }]}>
                expected {r.expected} · counted {r.counted}
              </Text>
              <Text style={[text.title, { width: 48, textAlign: 'right', fontVariant: ['tabular-nums'], color: r.variance < 0 ? colors.danger : r.variance > 0 ? colors.warn : colors.success }]}>{r.variance > 0 ? `+${r.variance}` : r.variance}</Text>
            </Row>
          ))}
          {!!latest.note && <Text style={[text.muted, { marginTop: space.xs }]}>“{latest.note}”</Text>}
          {mine && !current && <Text style={[text.small, { marginTop: space.sm }]}>{monthName(month)} has not been counted yet.</Text>}
        </Card>
      ) : (
        <Text style={[text.muted, { marginBottom: space.md }]}>{mine ? 'Count your samples once a month so the records stay right.' : `${repName} has not counted yet.`}</Text>
      )}
    </>
  );
}
