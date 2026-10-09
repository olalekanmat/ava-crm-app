import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { formatDate, formatDateTime } from '@/data/dates';
import { newId } from '@/data/ids';
import { sampleIssues, samplesGiven, sampleStock } from '@/data/samples';
import { useMe, useStore } from '@/data/store';
import type { User } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space, tone } from '@/ui/theme';

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

function IssueForm({ rep, products, onSave }: { rep: User; products: string[]; onSave: (issue: { id: string; repId: string; product: string; qty: number; batch?: string; note?: string; byId: string; at: string }) => void }) {
  const me = useMe();
  const [mode, setMode] = useState<'Give' | 'Take back'>('Give');
  const [product, setProduct] = useState(products[0] ?? '');
  const [qty, setQty] = useState('');
  const [batch, setBatch] = useState('');
  const [note, setNote] = useState('');
  const n = parseInt(qty, 10);

  const save = () => {
    try {
      onSave({ id: newId('smp'), repId: rep.id, product, qty: mode === 'Give' ? n : -n, batch: batch.trim() || undefined, note: note.trim() || undefined, byId: me.id, at: new Date().toISOString() });
      setQty('');
      setBatch('');
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
        <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
        <Button title={mode === 'Give' ? 'Record samples given' : 'Record samples taken back'} icon="medkit-outline" onPress={save} disabled={!product || !(n > 0)} />
      </Card>
    </>
  );
}
