import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { setupSteps, type SetupMarks } from '@/data/setupChecklist';
import { loadJson, saveJson } from '@/data/storage';
import { useStore } from '@/data/store';
import { Button, Card, ProgressBar, Row, text } from './components';
import { colors, space } from './theme';

const marksKey = (companyId: string) => `ava.setup.${companyId}`;

/** Records a step this device ticks itself (an invitation sent, the cycle settings checked). */
export async function markSetup(companyId: string | undefined, mark: keyof SetupMarks) {
  if (!companyId) return;
  const cur = (await loadJson<SetupMarks>(marksKey(companyId))) ?? {};
  await saveJson(marksKey(companyId), { ...cur, [mark]: true });
}

/** The administrator's first-run checklist on Home (2.9). Goes away when every step is done or it is hidden. */
export function SetupChecklist() {
  const { data, session } = useStore();
  const companyId = session?.companyId;
  const [marks, setMarks] = useState<SetupMarks | null>(null);
  useEffect(() => {
    if (!companyId) return;
    loadJson<SetupMarks>(marksKey(companyId))
      .then((m) => setMarks(m ?? {}))
      .catch(() => setMarks({}));
  }, [companyId, data]);
  if (!marks || marks.hidden || session?.demo) return null;
  const steps = setupSteps(data, marks);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const set = (m: keyof SetupMarks) => {
    setMarks({ ...marks, [m]: true });
    markSetup(companyId, m).catch(() => {});
  };
  return (
    <Card>
      <Row>
        <Text style={[text.h2, { flex: 1 }]}>Set up Ava CRM</Text>
        <Text style={text.muted}>
          {done} of {steps.length} done
        </Text>
      </Row>
      <View style={{ marginVertical: space.sm }}>
        <ProgressBar value={done / steps.length} color={colors.success} />
      </View>
      {steps.map((s) => (
        <Pressable key={s.key} onPress={() => router.push((s.params ? { pathname: s.path, params: s.params } : s.path) as Href)} accessibilityRole="button" style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.hairline }}>
          <Row>
            <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={s.done ? colors.success : colors.faint} />
            <View style={{ flex: 1 }}>
              <Text style={[text.title, s.done && { color: colors.muted, textDecorationLine: 'line-through' }]}>{s.title}</Text>
              {!s.done && <Text style={text.small}>{s.hint}</Text>}
            </View>
            {!s.done && s.key === 'cycle' && <Button small variant="ghost" title="Looks right" onPress={() => set('cycleChecked')} />}
            {!s.done && s.key === 'invite' && <Button small variant="ghost" title="Done" onPress={() => set('invited')} />}
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Row>
        </Pressable>
      ))}
      <Text style={[text.link, { marginTop: space.sm, fontSize: 13 }]} onPress={() => set('hidden')}>
        Hide this checklist
      </Text>
    </Card>
  );
}
