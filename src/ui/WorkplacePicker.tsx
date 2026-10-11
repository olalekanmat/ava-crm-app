import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { normalName } from '@/data/duplicates';
import type { Account } from '@/data/types';
import { Chip, Label, text } from './components';
import { colors, radius, space } from './theme';

const MAX = 10;

/**
 * Other hospitals and clinics a doctor works at, picked from the organizations in Ava.
 * The main one stays in Affiliation.
 */
export function WorkplacePicker({ value, onChange, orgs, exclude }: { value: string[]; onChange: (v: string[]) => void; orgs: Account[]; exclude?: string }) {
  const [q, setQ] = useState('');
  const chosen = value.map((id) => orgs.find((o) => o.id === id)).filter((o): o is Account => !!o);
  const query = normalName(q);
  const offered = orgs
    .filter((o) => !o.deletedAt && !value.includes(o.id) && o.name !== exclude)
    .filter((o) => !query || normalName(`${o.name} ${o.city}`).includes(query) || o.name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <View style={{ marginBottom: space.md }}>
      <Label>Also works at</Label>
      {chosen.map((o) => (
        <View key={o.id} style={styles.row}>
          <Ionicons name="business-outline" size={16} color={colors.primary} />
          <Text style={[text.body, { flex: 1 }]}>
            {o.name}
            {o.city ? <Text style={text.muted}> · {o.city}</Text> : null}
          </Text>
          <Pressable onPress={() => onChange(value.filter((id) => id !== o.id))} hitSlop={10} accessibilityLabel={`Remove ${o.name}`}>
            <Ionicons name="close" size={18} color={colors.faint} />
          </Pressable>
        </View>
      ))}
      {value.length < MAX && orgs.length > 0 && (
        <>
          <TextInput value={q} onChangeText={setQ} placeholder="Find a hospital or clinic" placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel="Find a workplace" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {offered.map((o) => (
              <Chip key={o.id} label={o.city ? `${o.name} · ${o.city}` : o.name} icon="add" onPress={() => onChange([...value, o.id])} />
            ))}
          </View>
        </>
      )}
      {!orgs.length && <Text style={text.small}>Add hospitals and clinics as organizations first, then link them here.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: space.md, color: colors.text, backgroundColor: colors.card, marginTop: space.xs },
});
