import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { placeName, stockLevels, trackedProducts } from '@/data/erp';
import { formatDateTime } from '@/data/dates';
import { newId } from '@/data/ids';
import { WAREHOUSE, type StockMoveKind, type StockPlace } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { Screen } from '@/ui/Screen';
import { colors, space, tone } from '@/ui/theme';

type Action = 'receive' | 'give' | 'return' | 'adjust';

/**
 * Stock in the warehouse and with each person. Managers receive stock and hand it out; reps see
 * what they hold and can send it back. Sales take stock off by themselves.
 */
export default function StockScreen() {
  const { me, data, erp, products, places, manager, getUser, settings, admin } = useErp();
  const [place, setPlace] = useState<StockPlace>(manager ? WAREHOUSE : me.id);
  const [action, setAction] = useState<Action>();
  const levels = useMemo(() => stockLevels(data, place, products), [data, place, products]);
  const tracked = useMemo(() => trackedProducts(data), [data]);
  if (!erp) return <ErpOff />;

  const moves = (data.stockMoves ?? []).filter((m) => m.from === place || m.to === place).slice(-40).reverse();
  const sold = (data.invoices ?? []).filter((i) => i.stockFrom === place && i.status !== 'Void');
  const shown = levels.filter((l) => tracked.has(l.product) || l.qty !== 0);
  const units = shown.reduce((n, l) => n + l.qty, 0);
  const isWarehouse = place === WAREHOUSE;
  const actions: Action[] = isWarehouse ? (manager ? ['receive', 'give', 'adjust'] : []) : place === me.id ? (manager ? ['return', 'adjust'] : ['return']) : ['give', 'return', 'adjust'];
  const LABEL: Record<Action, string> = { receive: 'Receive stock', give: isWarehouse ? 'Give to someone' : 'Give stock', return: 'Back to warehouse', adjust: 'Correct a count' };

  return (
    <Screen>
      {places.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
          {places.map((p) => (
            <Chip key={p} label={p === me.id ? 'My stock' : placeName(p, getUser)} icon={p === WAREHOUSE ? 'business-outline' : undefined} selected={p === place} onPress={() => { setPlace(p); setAction(undefined); }} />
          ))}
        </View>
      )}

      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={text.muted}>{isWarehouse ? 'Warehouse' : place === me.id ? 'You hold' : `${placeName(place, getUser)} holds`}</Text>
            <Text style={text.h1}>{units.toLocaleString()} units</Text>
            <Text style={text.small}>{shown.length} product{shown.length === 1 ? '' : 's'} · {sold.length} sale{sold.length === 1 ? '' : 's'} from here</Text>
          </View>
          <Ionicons name={isWarehouse ? 'business' : 'bag-handle'} size={36} color={colors.primarySoft} />
        </Row>
      </Card>

      {actions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
          {actions.map((a) => (
            <Chip key={a} label={LABEL[a]} selected={action === a} onPress={() => setAction(action === a ? undefined : a)} />
          ))}
        </View>
      )}
      {action && <MoveForm action={action} place={place} onDone={() => setAction(undefined)} />}

      <SectionTitle>Stock</SectionTitle>
      {shown.length ? (
        <Card style={{ padding: 0 }}>
          {shown.map((l) => (
            <Row key={l.product} style={{ paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{l.product}</Text>
                {l.qty < 0 ? <Text style={[text.small, { color: colors.danger }]}>Sold more than recorded. Receive or give stock to correct it.</Text> : l.qty <= settings.lowStock ? <Text style={[text.small, { color: colors.warn }]}>Low</Text> : null}
              </View>
              <Text style={[text.h2, { fontVariant: ['tabular-nums'], color: l.qty < 0 ? tone.urgent : l.qty <= settings.lowStock ? tone.important : colors.text }]}>{l.qty}</Text>
            </Row>
          ))}
        </Card>
      ) : (
        <Empty icon="cube-outline" title="No stock recorded">
          {isWarehouse ? (manager ? 'Tap Receive stock when goods arrive. Selling works without it; stock is counted once you start.' : 'Your manager looks after the warehouse.') : place === me.id ? 'Your manager records the stock they give you.' : 'Give stock from the warehouse to start counting it.'}
        </Empty>
      )}

      {moves.length > 0 && (
        <>
          <SectionTitle>Movements</SectionTitle>
          <Card style={{ padding: 0 }}>
            {moves.map((m) => {
              const into = m.to === place;
              const other = into ? m.from : m.to;
              return (
                <Row key={m.id} style={{ paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>
                      {into ? '+' : '−'}
                      {m.qty} {m.product}
                    </Text>
                    <Text style={text.muted}>
                      {m.kind === 'receive' ? 'Received' : m.kind === 'adjust' ? 'Count corrected' : into ? `From ${placeName(other!, getUser)}` : `To ${placeName(other!, getUser)}`} · {formatDateTime(m.at)} · {getUser(m.byId)?.name ?? ''}
                      {m.batch ? ` · batch ${m.batch}` : ''}
                    </Text>
                    {!!m.note && <Text style={text.small}>{m.note}</Text>}
                  </View>
                </Row>
              );
            })}
          </Card>
        </>
      )}
      {!admin && !manager && <Banner tone="info">Selling takes stock off what you hold automatically.</Banner>}
    </Screen>
  );
}

function MoveForm({ action, place, onDone }: { action: Action; place: StockPlace; onDone: () => void }) {
  const { me, run, products, team, getUser } = useErp();
  const [product, setProduct] = useState(products[0]?.name ?? '');
  const [qty, setQty] = useState('');
  const [to, setTo] = useState<StockPlace | undefined>(place === WAREHOUSE ? team[0]?.id : undefined);
  const [dir, setDir] = useState<'Add' | 'Take away'>('Add');
  const [batch, setBatch] = useState('');
  const [note, setNote] = useState('');
  const n = parseInt(qty, 10);

  const save = () => {
    let kind: StockMoveKind;
    let from: StockPlace | undefined;
    let dest: StockPlace | undefined;
    if (action === 'receive') [kind, dest] = ['receive', WAREHOUSE];
    else if (action === 'give') [kind, from, dest] = ['transfer', WAREHOUSE, place === WAREHOUSE ? to : place];
    else if (action === 'return') [kind, from, dest] = ['transfer', place, WAREHOUSE];
    else [kind, from, dest] = dir === 'Add' ? ['adjust', undefined, place] : ['adjust', place, undefined];
    try {
      run({ type: 'stock.move', move: { id: newId('stk'), kind, product, qty: n, from, to: dest, batch: batch.trim() || undefined, note: note.trim() || undefined, byId: me.id, at: '' } });
      notify('Saved', `${n} ${product} ${action === 'receive' ? 'received into the warehouse' : action === 'adjust' ? (dir === 'Add' ? 'added' : 'taken away') : `moved to ${dest === WAREHOUSE ? 'the warehouse' : (getUser(dest)?.name ?? 'them')}`}.`);
      onDone();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  if (!products.length) return <Banner tone="info">Add products first.</Banner>;
  return (
    <Card>
      {action === 'adjust' && <Segmented options={['Add', 'Take away']} value={dir} onChange={setDir} />}
      {action === 'give' && place === WAREHOUSE && (
        <>
          <Label>To</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
            {team.map((u) => (
              <Chip key={u.id} label={u.name} selected={to === u.id} onPress={() => setTo(u.id)} />
            ))}
          </View>
        </>
      )}
      <Label>Product</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
        {products.map((p) => (
          <Chip key={p.id} label={p.name} selected={p.name === product} onPress={() => setProduct(p.name)} />
        ))}
      </View>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}>
          <Field label="Quantity" value={qty} onChangeText={(v) => setQty(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="e.g. 100" />
        </View>
        {action === 'receive' && (
          <View style={{ flex: 1 }}>
            <Field label="Batch" value={batch} onChangeText={setBatch} placeholder="Optional" />
          </View>
        )}
      </Row>
      <Field label={action === 'adjust' ? 'Why? *' : 'Note'} value={note} onChangeText={setNote} placeholder={action === 'adjust' ? 'e.g. Monthly count, damaged' : action === 'receive' ? 'Supplier, delivery note (optional)' : 'Optional'} />
      <Button title={action === 'receive' ? 'Receive' : action === 'adjust' ? 'Save correction' : 'Move stock'} icon="checkmark" onPress={save} disabled={!product || !(n > 0) || (action === 'give' && place === WAREHOUSE && !to) || (action === 'adjust' && !note.trim())} />
    </Card>
  );
}
