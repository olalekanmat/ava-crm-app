import { useState } from 'react';
import { Text, View } from 'react-native';
import { newId } from '@/data/ids';
import type { Distributor } from '@/data/types';
import { Button, Card, Empty, Field, Row, SectionTitle, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** 2.13: the distributors customers buy through, so orders and sales can be tagged with one. */
export default function DistributorsScreen() {
  const { data, erp, run, finance, invoicer } = useErp();
  const [edit, setEdit] = useState<Distributor | null>(null);
  const list = [...(data.distributors ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const can = finance || invoicer;
  if (!erp) return <ErpOff />;
  const save = () => {
    if (!edit) return;
    try {
      run({ type: 'distributor.save', distributor: edit });
      setEdit(null);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  const customers = (id: string) => data.accounts.filter((a) => a.distributorId === id).length;
  const orders = (id: string) => (data.orders ?? []).filter((o) => o.distributorId === id).length;
  return (
    <Screen>
      {edit ? (
        <Card>
          <Field label="Name" value={edit.name} onChangeText={(name) => setEdit({ ...edit, name })} autoFocus />
          <Field label="City" value={edit.city ?? ''} onChangeText={(city) => setEdit({ ...edit, city })} />
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <Field label="Phone" value={edit.phone ?? ''} onChangeText={(phone) => setEdit({ ...edit, phone })} keyboardType="phone-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Email" value={edit.email ?? ''} onChangeText={(email) => setEdit({ ...edit, email })} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </Row>
          <ToggleRow label="Active" value={edit.active} onChange={(active) => setEdit({ ...edit, active })} hint="Inactive distributors cannot be picked for new orders." />
          <Row gap={space.sm}>
            <Button title="Cancel" variant="ghost" onPress={() => setEdit(null)} />
            <Button title="Save" icon="checkmark" onPress={save} disabled={!edit.name.trim()} />
          </Row>
        </Card>
      ) : (
        can && <Button title="Add a distributor" icon="add-circle-outline" onPress={() => setEdit({ id: newId('dst'), name: '', active: true, createdAt: '' })} />
      )}
      <SectionTitle>Distributors ({list.length})</SectionTitle>
      {list.length ? (
        <Card style={{ padding: 0 }}>
          {list.map((d) => (
            <Row key={d.id} style={{ padding: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <View style={{ flex: 1 }}>
                <Text style={[text.title, !d.active && { color: colors.faint }]}>{d.name}</Text>
                <Text style={text.muted}>
                  {[d.city, d.phone, `${customers(d.id)} customers`, `${orders(d.id)} orders`].filter(Boolean).join(' · ')}
                  {!d.active ? ' · inactive' : ''}
                </Text>
              </View>
              {can && <Button small variant="ghost" title="Edit" onPress={() => setEdit(d)} />}
            </Row>
          ))}
        </Card>
      ) : (
        <Empty icon="git-network-outline" title="No distributors yet">Add the distributors your customers buy through. Reps then tag orders and sales with them.</Empty>
      )}
    </Screen>
  );
}
