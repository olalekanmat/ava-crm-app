import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { COACHING_SKILLS, type Call, type Coaching, type CoachingSkill } from '@/data/types';
import { Button, Card, Field, Row, SectionTitle, text } from './components';
import { notify } from './confirm';
import { colors, radius, space } from './theme';

/** Average of the scored skills, one decimal. */
export const coachingAverage = (c: Coaching) => {
  const v = Object.values(c.scores).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0;
};

/** The manager's scorecard on a coached call: read-only for the rep, editable for the coach or a manager. */
export function CoachingCard({ call, canCoach }: { call: Call; canCoach: boolean }) {
  const { getUser, run } = useStore();
  const [editing, setEditing] = useState(false);
  const c = call.coaching;
  const coach = getUser(c?.by ?? call.coachId);

  if (!c && !canCoach) {
    return call.coachId ? (
      <>
        <SectionTitle>Coaching</SectionTitle>
        <Card>
          <Row>
            <Ionicons name="school-outline" size={18} color={colors.primary} />
            <Text style={[text.body, { flex: 1 }]}>Coached visit with {coach?.name ?? 'your manager'}. Their feedback appears here.</Text>
          </Row>
        </Card>
      </>
    ) : null;
  }

  if (editing || (!c && canCoach)) {
    return <CoachingForm call={call} onDone={() => setEditing(false)} save={(coaching) => run({ type: 'call.coach', id: call.id, coaching })} />;
  }

  return (
    <>
      <SectionTitle right={canCoach ? <Text style={text.link} onPress={() => setEditing(true)}>Edit</Text> : undefined}>Coaching</SectionTitle>
      <Card>
        <Row>
          <Ionicons name="school" size={18} color={colors.primary} />
          <Text style={[text.title, { flex: 1 }]}>{coach?.name ?? 'Manager'}</Text>
          <Text style={[text.h2, { color: colors.primary }]}>{coachingAverage(c!)}</Text>
          <Text style={text.muted}>/ 5</Text>
        </Row>
        <Text style={[text.small, { marginBottom: space.sm }]}>{formatDateTime(c!.at)}</Text>
        {COACHING_SKILLS.filter((k) => c!.scores[k]).map((k) => (
          <Row key={k} style={{ marginBottom: 6 }}>
            <Text style={[text.body, { flex: 1 }]}>{k}</Text>
            <Dots value={c!.scores[k]!} />
          </Row>
        ))}
        {!!c!.strengths && (
          <>
            <Text style={[text.small, { marginTop: space.sm, fontWeight: '700' }]}>Went well</Text>
            <Text style={text.body}>{c!.strengths}</Text>
          </>
        )}
        {!!c!.improve && (
          <>
            <Text style={[text.small, { marginTop: space.sm, fontWeight: '700' }]}>Work on</Text>
            <Text style={text.body}>{c!.improve}</Text>
          </>
        )}
      </Card>
    </>
  );
}

function Dots({ value, onChange }: { value?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={4} accessibilityLabel={`${n} of 5`} style={[styles.dot, onChange && styles.dotBig, (value ?? 0) >= n && styles.on]}>
          {onChange && <Text style={[styles.dotText, (value ?? 0) >= n && { color: '#fff' }]}>{n}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

function CoachingForm({ call, save, onDone }: { call: Call; save: (c: Coaching) => void; onDone: () => void }) {
  const [scores, setScores] = useState<Partial<Record<CoachingSkill, number>>>(call.coaching?.scores ?? {});
  const [strengths, setStrengths] = useState(call.coaching?.strengths ?? '');
  const [improve, setImprove] = useState(call.coaching?.improve ?? '');

  const submit = () => {
    try {
      save({ by: '', at: '', scores, strengths, improve });
      onDone();
      notify('Feedback saved', 'The rep sees it on this call.');
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <SectionTitle>Coach this call</SectionTitle>
      <Card>
        <Text style={[text.muted, { marginBottom: space.md }]}>Score each skill you saw, from 1 (needs work) to 5 (excellent). Leave out what you did not see.</Text>
        {COACHING_SKILLS.map((k) => (
          <Row key={k} style={{ marginBottom: space.sm }}>
            <Text style={[text.body, { flex: 1 }]}>{k}</Text>
            <Dots value={scores[k]} onChange={(v) => setScores({ ...scores, [k]: scores[k] === v ? undefined : v })} />
          </Row>
        ))}
        <Field label="What went well" value={strengths} onChangeText={setStrengths} multiline placeholder="e.g. Clear opening, good use of the study data" />
        <Field label="What to work on" value={improve} onChangeText={setImprove} multiline placeholder="e.g. Ask for the prescription at the end" />
        <Row>
          <Button title="Save feedback" icon="school-outline" onPress={submit} disabled={!Object.values(scores).some(Boolean)} />
          {!!call.coaching && <Button title="Cancel" variant="ghost" onPress={onDone} />}
        </Row>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.border },
  dotBig: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.primary },
  dotText: { fontSize: 12, fontWeight: '700', color: colors.muted },
});
