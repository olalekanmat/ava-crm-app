import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { cycleElapsed, daysLeft, pct, repMetrics, rollup, teamRollup } from '@/data/metrics';
import { repsUnder } from '@/data/access';
import { useStore } from '@/data/store';
import type { User } from '@/data/types';
import { Hero, heroText } from '@/ui/Brand';
import { Avatar, Card, Empty, ProgressBar, Row, SectionTitle, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, paceColor, space } from '@/ui/theme';
import { TeamHeroStats, TierCoverage } from './TeamDashboard';

/**
 * Second-line manager view: one card per first-line team, plus a rep ranking across the region.
 * Admins see the same view for the whole organisation.
 */
export function RegionDashboard({ leader }: { leader: User }) {
  const { data, cycle, syncNow, sync } = useStore();
  if (!cycle) return <Screen><Empty>No cycle is set up yet. An administrator can add one.</Empty></Screen>;
  const elapsed = cycleElapsed(cycle);
  const flms = leader.role === 'Admin' ? data.users.filter((u) => u.role === 'FLM' && u.active) : data.users.filter((u) => u.managerId === leader.id && u.role === 'FLM' && u.active);
  const teams = flms.map((f) => ({ flm: f, r: teamRollup(data, f, cycle) }));
  const all = rollup(repsUnder(data.users, leader).map((rep) => repMetrics(data, rep, cycle)));
  const ranked = [...all.reps].sort((a, b) => b.attainment - a.attainment);

  return (
    <Screen wide onRefresh={syncNow} refreshing={sync.syncing}>
      <Hero>
        <Text style={heroText.eyebrow}>
          {leader.role === 'Admin' ? 'Organisation overview' : 'Region overview'} · {cycle.name} · {daysLeft(cycle)} days left
        </Text>
        <Text style={heroText.title}>{leader.role === 'Admin' ? data.settings.companyName : leader.territory ?? 'My region'}</Text>
        <Text style={heroText.body}>
          {teams.length} teams · {all.reps.length} reps · {all.onPlan} of {all.planned} planned calls done
        </Text>
        <TeamHeroStats r={all} />
      </Hero>

      <SectionTitle>Teams</SectionTitle>
      {teams.length === 0 && <Empty>No first-line managers report here yet.</Empty>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {teams.map(({ flm, r }) => (
          <View key={flm.id} style={{ flexGrow: 1, flexBasis: 300 }}>
            <Card onPress={() => router.push({ pathname: '/team/[id]', params: { id: flm.id } })}>
              <Row gap={space.md}>
                <Avatar name={flm.name} />
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>{flm.territory ?? flm.name}</Text>
                  <Text style={text.muted}>
                    {flm.name} · {r.reps.length} reps
                  </Text>
                </View>
                <Text style={[text.h2, { color: paceColor(r.attainment, elapsed) }]}>{r.planned ? pct(r.attainment) : '–'}</Text>
              </Row>
              <View style={{ marginTop: space.md }}>
                <ProgressBar value={r.attainment} marker={elapsed} color={paceColor(r.attainment, elapsed)} />
              </View>
              <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
                <Stat label="Calls" value={r.calls} />
                <Stat label="Reach" value={r.targets ? pct(r.reach) : '–'} />
                <Stat label="Geo-verified" value={r.inPerson ? pct(r.geoVerified) : '–'} />
                <Stat label="To approve" value={r.plansPending} warn={r.plansPending > 0} />
              </Row>
            </Card>
          </View>
        ))}
      </View>

      <SectionTitle>Rep ranking</SectionTitle>
      <Card style={{ paddingVertical: space.sm }}>
        {ranked.map((m, i) => (
          <Row key={m.rep.id} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <Text style={[text.muted, { width: 22 }]}>{i + 1}</Text>
            <Text style={[text.title, { flex: 1 }]} numberOfLines={1} onPress={() => router.push({ pathname: '/team/[id]', params: { id: m.rep.id } })}>
              {m.rep.name}
            </Text>
            <View style={{ width: 110 }}>
              <ProgressBar value={m.attainment} marker={elapsed} color={paceColor(m.attainment, elapsed)} height={6} />
            </View>
            <Text style={[text.title, { width: 48, textAlign: 'right', color: paceColor(m.attainment, elapsed) }]}>{m.planned ? pct(m.attainment) : '–'}</Text>
          </Row>
        ))}
        {!ranked.length && <Empty>No reps yet.</Empty>}
      </Card>

      <SectionTitle>Coverage by tier</SectionTitle>
      <TierCoverage r={all} />
    </Screen>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <View>
      <Text style={[text.title, warn && { color: colors.warn }]}>{value}</Text>
      <Text style={text.small}>{label}</Text>
    </View>
  );
}
