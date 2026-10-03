import { useState } from 'react';
import { Text, View } from 'react-native';
import { addDays, formatDate, toDateKey } from '@/data/dates';
import { newId } from '@/data/ids';
import type { Mutation } from '@/data/mutations';
import { useMe, useStore } from '@/data/store';
import { TIERS } from '@/data/types';
import { Badge, Button, Card, Empty, Field, Row, SectionTitle, Stepper, TierBadge, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

export default function SettingsScreen() {
  const me = useMe();
  const { data, run } = useStore();
  const s = data.settings;
  const [company, setCompany] = useState(s.companyName);
  const [geofence, setGeofence] = useState(String(s.geofenceM));
  const lastEnd = [...data.cycles].sort((a, b) => b.end.localeCompare(a.end))[0]?.end;
  const nextStart = lastEnd ? toDateKey(addDays(new Date(`${lastEnd}T12:00:00`), 1)) : toDateKey(new Date());
  const [cycleName, setCycleName] = useState(`Cycle ${data.cycles.length + 1}`);
  const [cycleStart, setCycleStart] = useState(nextStart);
  const [cycleEnd, setCycleEnd] = useState(toDateKey(addDays(new Date(`${nextStart}T12:00:00`), 55)));
  const [productName, setProductName] = useState('');
  const [productMessages, setProductMessages] = useState('');

  if (me.role !== 'Admin') return <Screen><Empty>Only administrators can change settings.</Empty></Screen>;

  const attempt = (m: Mutation, after?: () => void) => {
    try {
      run(m);
      after?.();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <SectionTitle>Organisation</SectionTitle>
      <Card>
        <Field label="Company name" value={company} onChangeText={setCompany} onBlur={() => company !== s.companyName && attempt({ type: 'settings.update', settings: { companyName: company } })} />
      </Card>

      <SectionTitle>Geotagging</SectionTitle>
      <Card>
        <Field
          label="Verified check-in radius (metres)"
          value={geofence}
          onChangeText={setGeofence}
          keyboardType="number-pad"
          hint="A check-in this close to the account's pinned location counts as verified."
          onBlur={() => Number(geofence) !== s.geofenceM && attempt({ type: 'settings.update', settings: { geofenceM: Number(geofence) } })}
        />
        <ToggleRow
          label="Require check-in for in-person calls"
          value={s.requireCheckIn}
          onChange={(v) => attempt({ type: 'settings.update', settings: { requireCheckIn: v } })}
          hint="When on, reps cannot submit an in-person call without checking in."
        />
      </Card>

      <SectionTitle>Call frequency by tier</SectionTitle>
      <Card>
        {TIERS.map((t) => (
          <Row key={t} style={{ marginBottom: space.sm }}>
            <View style={{ flex: 1 }}>
              <TierBadge tier={t} />
            </View>
            <Text style={text.muted}>calls per cycle</Text>
            <Stepper value={s.tierFrequency[t]} onChange={(v) => attempt({ type: 'settings.update', settings: { tierFrequency: { ...s.tierFrequency, [t]: v } } })} max={30} />
          </Row>
        ))}
        <Text style={text.small}>Used to suggest cycle plans. Reps can adjust per account before submitting.</Text>
      </Card>

      <SectionTitle>Planning cycles</SectionTitle>
      {[...data.cycles]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((c) => (
          <Card key={c.id}>
            <Row>
              <Text style={[text.title, { flex: 1 }]}>{c.name}</Text>
              <Text style={text.muted}>
                {formatDate(c.start)} – {formatDate(c.end)}
              </Text>
            </Row>
          </Card>
        ))}
      <Card>
        <Text style={[text.title, { marginBottom: space.sm }]}>Add a cycle</Text>
        <Field label="Name" value={cycleName} onChangeText={setCycleName} />
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Start" value={cycleStart} onChangeText={setCycleStart} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="End" value={cycleEnd} onChangeText={setCycleEnd} placeholder="YYYY-MM-DD" />
          </View>
        </Row>
        <Button title="Add cycle" variant="secondary" icon="add" onPress={() => attempt({ type: 'cycle.upsert', cycle: { id: newId('cyc'), name: cycleName.trim(), start: cycleStart.trim(), end: cycleEnd.trim() } }, () => setCycleName(`Cycle ${data.cycles.length + 2}`))} />
      </Card>

      <SectionTitle>Products</SectionTitle>
      {data.products.map((p) => (
        <Card key={p.id}>
          <Row>
            <Text style={[text.title, { flex: 1 }]}>{p.name}</Text>
            {!p.active && <Badge label="Inactive" fg={colors.muted} bg={colors.bg} />}
            <Button small variant="ghost" title={p.active ? 'Deactivate' : 'Activate'} onPress={() => attempt({ type: 'product.upsert', product: { ...p, active: !p.active } })} />
          </Row>
          <Text style={text.muted}>{p.keyMessages.join(' · ') || 'No key messages'}</Text>
        </Card>
      ))}
      <Card>
        <Text style={[text.title, { marginBottom: space.sm }]}>Add a product</Text>
        <Field label="Name" value={productName} onChangeText={setProductName} />
        <Field label="Key messages" value={productMessages} onChangeText={setProductMessages} placeholder="Efficacy | Safety | Dosing" hint="Separate with |" />
        <Button
          title="Add product"
          variant="secondary"
          icon="add"
          onPress={() =>
            attempt(
              { type: 'product.upsert', product: { id: newId('prd'), name: productName.trim(), keyMessages: productMessages.split('|').map((x) => x.trim()).filter(Boolean), active: true } },
              () => {
                setProductName('');
                setProductMessages('');
              },
            )
          }
        />
      </Card>
    </Screen>
  );
}
