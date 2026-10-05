import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { addDays, formatDate, toDateKey } from '@/data/dates';
import { newId } from '@/data/ids';
import type { Mutation } from '@/data/mutations';
import { isAdmin } from '@/data/access';
import { useMe, useStore } from '@/data/store';
import { Badge, Button, Card, Empty, Field, ListRow, Row, SectionTitle, ToggleRow, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

export default function SettingsScreen() {
  const me = useMe();
  const { data, run } = useStore();
  const s = data.settings;
  const [geofence, setGeofence] = useState(String(s.geofenceM));
  const [productName, setProductName] = useState('');
  const [productMessages, setProductMessages] = useState('');

  if (!isAdmin(me)) return <Screen><Empty>Only administrators can change settings.</Empty></Screen>;

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

      <SectionTitle>Tiers</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="layers-outline" tone={colors.orange} title="Tier names and call frequency" subtitle="Set per team; default ST, T1, T2, T3" onPress={() => router.push('/admin/tiers')} />
      </Card>

      <SectionTitle>Planning cycles</SectionTitle>
      <Card>
        <Text style={[text.body, { marginBottom: space.sm }]}>Cycles follow the calendar quarters and are created automatically each year. Reps plan each quarter and send the plan to their manager for approval.</Text>
        {[...data.cycles]
          .filter((c) => c.end >= toDateKey(addDays(new Date(), -92)) && c.start <= toDateKey(addDays(new Date(), 200)))
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((c) => (
            <Row key={c.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={[text.title, { flex: 1 }]}>{c.name}</Text>
              <Text style={text.muted}>
                {formatDate(c.start)} – {formatDate(c.end)}
              </Text>
            </Row>
          ))}
      </Card>

      <SectionTitle right={<Button small variant="ghost" icon="cloud-upload-outline" title="Import CSV" onPress={() => router.push({ pathname: '/admin/import', params: { kind: 'products' } })} />}>Products ({data.products.length})</SectionTitle>
      {!data.products.length && <Empty icon="medkit-outline">No products yet. Add one below or import a CSV.</Empty>}
      <Grid>
        {[...data.products]
          .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
          .map((p) => (
            <Card key={p.id}>
              <Row>
                <Text style={[text.title, { flex: 1 }]}>{p.name}</Text>
                {!p.active && <Badge label="Inactive" fg={colors.muted} bg={colors.bg} />}
              </Row>
              <Text style={text.muted}>{p.keyMessages.join(' · ') || 'No key messages'}</Text>
              <Row style={{ marginTop: space.sm, justifyContent: 'flex-end' }}>
                <Button small variant="ghost" title={p.active ? 'Deactivate' : 'Activate'} onPress={() => attempt({ type: 'product.upsert', product: { ...p, active: !p.active } })} />
                <Button
                  small
                  variant="ghost"
                  icon="trash-outline"
                  title="Delete"
                  onPress={() =>
                    confirm(
                      `Delete ${p.name}?`,
                      'It disappears from the product list and from new calls. Calls already logged keep the product name. To hide it for now instead, deactivate it.',
                      () => attempt({ type: 'product.delete', ids: [p.id] }),
                      'Delete',
                    )
                  }
                />
              </Row>
            </Card>
          ))}
      </Grid>
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
