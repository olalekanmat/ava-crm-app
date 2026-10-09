import { router } from 'expo-router';
import { AiSettingsCard } from '@/ai/AiSettingsCard';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { newId } from '@/data/ids';
import type { Mutation } from '@/data/mutations';
import { isAdmin } from '@/data/access';
import { useMe, useStore } from '@/data/store';
import { Badge, Button, Card, Empty, Field, ListRow, Row, SectionTitle, ToggleRow, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { CycleLengthSettings } from '@/ui/CycleLengthSettings';
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
  const [productBrochure, setProductBrochure] = useState('');

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

      <AiSettingsCard />

      <SectionTitle>Tiers</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="layers-outline" tone={colors.orange} title="Tier names and call frequency" subtitle="Set per team; default ST, T1, T2, T3" onPress={() => router.push('/admin/tiers')} />
      </Card>

      <SectionTitle>Planning cycles</SectionTitle>
      <CycleLengthSettings attempt={(m) => attempt(m)} />

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
              <BrochureLink url={p.brochureUrl} onSave={(brochureUrl) => attempt({ type: 'product.upsert', product: { ...p, brochureUrl: brochureUrl || undefined } })} />
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
        <Field label="Brochure link" value={productBrochure} onChangeText={setProductBrochure} placeholder="https://… (optional)" autoCapitalize="none" keyboardType="url" hint="An approved brochure reps can share with doctors on WhatsApp." />
        <Button
          title="Add product"
          variant="secondary"
          icon="add"
          onPress={() =>
            attempt(
              { type: 'product.upsert', product: { id: newId('prd'), name: productName.trim(), keyMessages: productMessages.split('|').map((x) => x.trim()).filter(Boolean), active: true, brochureUrl: productBrochure.trim() || undefined } },
              () => {
                setProductName('');
                setProductMessages('');
                setProductBrochure('');
              },
            )
          }
        />
      </Card>
    </Screen>
  );
}

/** A product's brochure link, edited in place. */
function BrochureLink({ url, onSave }: { url?: string; onSave: (url: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? '');
  if (!editing) {
    return (
      <Text style={[text.small, { marginTop: 4 }]} numberOfLines={1}>
        {url ? `Brochure: ${url} · ` : ''}
        <Text style={text.link} onPress={() => { setValue(url ?? ''); setEditing(true); }}>
          {url ? 'Change' : 'Add brochure link'}
        </Text>
      </Text>
    );
  }
  return (
    <View style={{ marginTop: space.sm }}>
      <Field label="Brochure link" value={value} onChangeText={setValue} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
      <Row>
        <Button small title="Save" onPress={() => { onSave(value.trim()); setEditing(false); }} />
        <Button small variant="ghost" title="Cancel" onPress={() => setEditing(false)} />
      </Row>
    </View>
  );
}
