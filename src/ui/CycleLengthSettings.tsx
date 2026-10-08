import { Text, View } from 'react-native';
import { activeCycleLength, CYCLE_LENGTH_LABEL, cyclesOfLength, scaleFrequency } from '@/data/cycles';
import { addDays, formatDate, toDateKey } from '@/data/dates';
import type { Mutation } from '@/data/mutations';
import { useStore } from '@/data/store';
import type { CycleLength } from '@/data/types';
import { Card, Label, Row, Segmented, text } from './components';
import { confirm } from './confirm';
import { colors, space } from './theme';

const EXPLAIN: Record<CycleLength, string> = {
  quarter: 'Reps plan each calendar quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) and send the plan to their manager for approval.',
  month: 'Reps plan each calendar month and send the plan to their manager for approval. Tier frequencies stay calls per quarter; monthly plans suggest a third of them (at least one call).',
};

/** Admin settings: whether the company plans by quarter or by month, and the cycles around today. */
export function CycleLengthSettings({ attempt }: { attempt: (m: Mutation) => void }) {
  const { data, cycle } = useStore();
  const length = activeCycleLength(data.settings);
  const today = new Date();
  const from = toDateKey(addDays(today, length === 'month' ? -62 : -92));
  const to = toDateKey(addDays(today, length === 'month' ? 100 : 200));
  const shown = cyclesOfLength(data.cycles, length).filter((c) => c.end >= from && c.start <= to);
  const plansOther = data.plans.filter((p) => !cyclesOfLength(data.cycles, length).some((c) => c.id === p.cycleId)).length;
  const sample = data.settings.tiers.map((t) => `${t.name} ${scaleFrequency(t.frequency, 'month')}`).join(', ');

  const change = (next: CycleLength) => {
    if (next === length) return;
    confirm(
      next === 'month' ? 'Plan by month?' : 'Plan by quarter?',
      `From now on, reps plan ${next === 'month' ? 'each calendar month' : 'each calendar quarter'} and dashboards follow the ${next === 'month' ? 'month' : 'quarter'}. ` +
        `Existing plans stay with their original ${length === 'month' ? 'months' : 'quarters'} and remain visible in the plan history and exports; nothing is deleted or converted.` +
        (next === 'month' ? ` Suggested monthly plans use a third of each tier's calls per quarter (${sample}).` : ''),
      () => attempt({ type: 'settings.update', settings: { cycleLength: next } }),
      next === 'month' ? 'Use monthly cycles' : 'Use quarterly cycles',
    );
  };

  return (
    <Card>
      <Label>Cycle length</Label>
      <Segmented options={['quarter', 'month'] as CycleLength[]} value={length} onChange={change} labels={CYCLE_LENGTH_LABEL} />
      <Text style={[text.body, { marginVertical: space.sm }]}>{EXPLAIN[length]} Cycles are created automatically each year.</Text>
      {plansOther > 0 && (
        <Text style={[text.small, { marginBottom: space.sm }]}>
          {plansOther} plan{plansOther === 1 ? '' : 's'} made with {length === 'month' ? 'quarterly' : 'monthly'} cycles {plansOther === 1 ? 'keeps its' : 'keep their'} original cycle.
        </Text>
      )}
      <View>
        {shown.map((c) => (
          <Row key={c.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={[text.title, { flex: 1 }]}>
              {c.name}
              {c.id === cycle?.id ? ' (now)' : ''}
            </Text>
            <Text style={text.muted}>
              {formatDate(c.start)} – {formatDate(c.end)}
            </Text>
          </Row>
        ))}
      </View>
    </Card>
  );
}
