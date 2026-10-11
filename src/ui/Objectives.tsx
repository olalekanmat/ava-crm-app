import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_OBJECTIVES } from '@/data/mutations';
import type { CallObjective } from '@/data/types';
import { Chip, Label, text } from './components';
import { colors, radius, space } from './theme';

/**
 * Objectives for a call: picked from the company's list or typed. When `record` is on (the visit
 * has happened), each one is marked achieved or not.
 */
export function ObjectivesEditor({
  value,
  onChange,
  choices,
  record,
  carried = [],
}: {
  value: CallObjective[];
  onChange: (v: CallObjective[]) => void;
  choices: string[];
  record: boolean;
  /** Objectives the last visit did not achieve, offered first. */
  carried?: string[];
}) {
  const [own, setOwn] = useState('');
  const has = (t: string) => value.some((o) => o.text.toLowerCase() === t.toLowerCase());
  const full = value.length >= MAX_OBJECTIVES;
  const add = (t: string) => {
    const v = t.trim();
    if (!v || has(v) || full) return;
    onChange([...value, { text: v }]);
  };
  const set = (i: number, o: CallObjective) => onChange(value.map((x, j) => (j === i ? o : x)));
  const offered = [...carried, ...choices].filter((t, i, all) => !has(t) && all.indexOf(t) === i);

  return (
    <View style={{ marginBottom: space.sm }}>
      <Label>{record ? 'Objectives: did you achieve them?' : 'Objectives for this visit'}</Label>
      {value.map((o, i) => (
        <View key={`${o.text}-${i}`} style={styles.row}>
          <Text style={[text.body, { flex: 1 }]}>{o.text}</Text>
          {record && (
            <View style={styles.marks}>
              <Mark label="Achieved" icon="checkmark-circle" on={o.achieved === true} tone={colors.success} onPress={() => set(i, { text: o.text, achieved: o.achieved === true ? undefined : true })} />
              <Mark label="Not yet" icon="close-circle" on={o.achieved === false} tone={colors.danger} onPress={() => set(i, { text: o.text, achieved: o.achieved === false ? undefined : false })} />
            </View>
          )}
          <Pressable onPress={() => onChange(value.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel={`Remove ${o.text}`}>
            <Ionicons name="close" size={18} color={colors.faint} />
          </Pressable>
        </View>
      ))}
      {!full && (
        <>
          {carried.some((t) => !has(t)) && <Text style={[text.small, { marginTop: space.xs }]}>Not achieved last time:</Text>}
          <View style={styles.wrap}>
            {offered.slice(0, 10).map((t) => (
              <Chip key={t} label={carried.includes(t) ? `↻ ${t}` : t} icon="add" onPress={() => add(t)} />
            ))}
          </View>
          <View style={styles.own}>
            <TextInput
              value={own}
              onChangeText={setOwn}
              placeholder="Or write your own objective"
              placeholderTextColor={colors.faint}
              style={styles.input}
              maxLength={200}
              onSubmitEditing={() => {
                add(own);
                setOwn('');
              }}
              accessibilityLabel="Your own objective"
            />
            <Pressable
              onPress={() => {
                add(own);
                setOwn('');
              }}
              style={styles.addBtn}
              accessibilityRole="button"
              accessibilityLabel="Add objective"
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Mark({ label, icon, on, tone, onPress }: { label: string; icon: 'checkmark-circle' | 'close-circle'; on: boolean; tone: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.mark, on && { backgroundColor: tone, borderColor: tone }]}>
      <Ionicons name={icon} size={14} color={on ? '#fff' : tone} />
      <Text style={[styles.markText, { color: on ? '#fff' : tone }]}>{label}</Text>
    </Pressable>
  );
}

/** Objectives on a call page, with results when recorded. */
export function ObjectivesView({ objectives }: { objectives?: CallObjective[] }) {
  if (!objectives?.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {objectives.map((o, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <Ionicons
            name={o.achieved === true ? 'checkmark-circle' : o.achieved === false ? 'close-circle' : 'ellipse-outline'}
            size={18}
            color={o.achieved === true ? colors.success : o.achieved === false ? colors.danger : colors.faint}
          />
          <Text style={[text.body, { flex: 1 }]}>
            {o.text}
            {o.achieved === true ? ' · achieved' : o.achieved === false ? ' · not achieved' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.hairline, flexWrap: 'wrap' },
  marks: { flexDirection: 'row', gap: 6 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  markText: { fontSize: 12, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs },
  own: { flexDirection: 'row', gap: space.sm, alignItems: 'center', marginTop: space.xs },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: space.md, color: colors.text, backgroundColor: colors.card },
  addBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
