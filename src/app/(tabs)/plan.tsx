import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { addDays, toDateKey } from '@/data/dates';
import { cycleElapsed, pct, repMetrics } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import type { PlanStatus } from '@/data/types';
import { PlanView } from '@/screens/PlanView';
import { Avatar, Card, Chip, Empty, PlanBadge, ProgressBar, Row, SectionTitle, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { paceColor, space } from '@/ui/theme';

const ORDER: Record<PlanStatus | 'None', number> = { Submitted: 0, Rejected: 1, Draft: 2, None: 3, Approved: 4 };

export default function PlanTab() {
  const me = useMe();
  const { data, cycle: current, syncNow, sync } = useStore();
  const today = toDateKey(new Date());
  // Cycles are calendar quarters: plan the current quarter and the next one.
  const horizon = toDateKey(addDays(new Date(), 100));
  const cycles = [...data.cycles].filter((c) => c.end >= today && c.start <= horizon).sort((a, b) => a.start.localeCompare(b.start));
  const [cycleId, setCycleId] = useState(current?.id);
  const cycle = cycles.find((c) => c.id === cycleId) ?? current;

  if (!cycle) {
    return (
      <Screen>
        <Empty icon="calendar-outline">Quarterly cycles appear here once your company data has loaded. Pull down to refresh.</Empty>
      </Screen>
    );
  }

  const picker = cycles.length > 1 && (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
      {cycles.map((c) => (
        <Chip key={c.id} label={c.id === current?.id ? `${c.name} (now)` : c.name} selected={c.id === cycle.id} onPress={() => setCycleId(c.id)} />
      ))}
    </View>
  );

  if (me.role === 'Rep') {
    return (
      <Screen onRefresh={syncNow} refreshing={sync.syncing}>
        {picker}
        <PlanView ownerId={me.id} cycle={cycle} />
      </Screen>
    );
  }

  const elapsed = cycleElapsed(cycle);
  const reps = repsUnder(data.users, me)
    .map((r) => repMetrics(data, r, cycle))
    .sort((a, b) => ORDER[a.plan?.status ?? 'None'] - ORDER[b.plan?.status ?? 'None'] || a.rep.name.localeCompare(b.rep.name));
  const pending = reps.filter((m) => m.plan?.status === 'Submitted').length;

  return (
    <Screen wide onRefresh={syncNow} refreshing={sync.syncing}>
      {picker}
      <Text style={text.h2}>{cycle.name} plans</Text>
      <Text style={text.muted}>{pending ? `${pending} waiting for approval` : 'Nothing waiting for approval'}</Text>
      <SectionTitle>Reps</SectionTitle>
      {reps.length === 0 && <Empty>No reps in your team yet.</Empty>}
      {reps.map((m) => (
        <Card
          key={m.rep.id}
          onPress={() => (m.plan ? router.push({ pathname: '/plan/[id]', params: { id: m.plan.id } }) : router.push({ pathname: '/team/[id]', params: { id: m.rep.id } }))}
        >
          <Row gap={space.md}>
            <Avatar name={m.rep.name} />
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{m.rep.name}</Text>
              <Text style={text.muted}>
                {m.targets} accounts · {m.planned} calls planned
              </Text>
            </View>
            <PlanBadge status={m.plan?.status ?? 'None'} />
          </Row>
          {m.plan && (
            <Row style={{ marginTop: space.md }}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={m.attainment} marker={elapsed} color={paceColor(m.attainment, elapsed)} height={6} />
              </View>
              <Text style={text.muted}>{pct(m.attainment)}</Text>
            </Row>
          )}
        </Card>
      ))}
    </Screen>
  );
}
