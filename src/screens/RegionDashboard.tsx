import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { cycleElapsed, daysLeft, pct, repMetrics, rollup, teamRollup } from '@/data/metrics';
import { repsUnder } from '@/data/access';
import { useStore } from '@/data/store';
import type { User } from '@/data/types';
import { Card, Empty, ProgressBar, Row, SectionTitle, UserAvatar, text } from '@/ui/components';
import { Grid } from '@/ui/layout';
import { StatSplit, Tile } from '@/ui/Tiles';
import { Screen } from '@/ui/Screen';
import { LicenseBanner } from '@/ui/SyncCard';
import { colors, paceColor, space, tone } from '@/ui/theme';
import { AlertsTile, CompanyTile, CyclePlanTile, HeroButton, HomeHeader, SyncTile } from './HomeTiles';
import { repHealth, TierCoverage } from './TeamDashboard';

/**
 * Second-line manager view: one card per first-line team, plus a rep ranking across the region.
 * Admins see the same view for the whole organisation.
 */
export function RegionDashboard({ leader }: { leader: User }) {
  const { data, cycle, syncNow, sync, company } = useStore();
  if (!cycle) return <Screen><LicenseBanner /><Empty>No planning cycle found. Pull down to refresh.</Empty></Screen>;
  const elapsed = cycleElapsed(cycle);
  const flms = leader.role === 'Admin' ? data.users.filter((u) => u.role === 'FLM' && u.active) : data.users.filter((u) => u.managerId === leader.id && u.role === 'FLM' && u.active);
  const teams = flms.map((f) => ({ flm: f, r: teamRollup(data, f, cycle) }));
  const all = rollup(repsUnder(data.users, leader).map((rep) => repMetrics(data, rep, cycle)));
  const ranked = [...all.reps].sort((a, b) => b.attainment - a.attainment);

  return (
    <Screen wide onRefresh={syncNow} refreshing={sync.syncing}>
      <LicenseBanner />
      <HomeHeader
        eyebrow={`${leader.role === 'Admin' ? 'Organisation overview' : 'Region overview'} · ${cycle.name} · ${daysLeft(cycle)} days left`}
        title={leader.role === 'Admin' ? company.name : leader.territory ?? 'My region'}
        summary={`${teams.length} teams · ${all.reps.length} reps · ${all.onPlan} of ${all.planned} planned calls done`}
        actions={
          <>
            <HeroButton title="Plans" icon="flag-outline" onPress={() => router.navigate('/plan')} />
            <HeroButton title="Team calls" icon="calendar-outline" onPress={() => router.navigate('/calls')} />
          </>
        }
      />

      <Grid min={290} max={3}>
        <CompanyTile key="company" cycle={cycle} />
        <AlertsTile key="alerts" />
        <CyclePlanTile key="plan" cycle={cycle} attainment={all.attainment} planned={all.planned} health={repHealth(all.reps, elapsed)} unit={`${all.reps.length} reps · ${all.calls} calls`} onPress={() => router.navigate('/plan')} empty="No rep has a plan for this cycle yet." />
        <Tile key="kpi" title="This cycle" icon="stats-chart-outline">
          <StatSplit
            items={[
              { value: all.calls, label: 'Calls', color: tone.normal },
              { value: all.targets ? pct(all.reach) : '–', label: 'Reach', color: all.reach >= elapsed ? tone.good : tone.important },
              { value: all.inPerson ? pct(all.geoVerified) : '–', label: 'Geo-verified', color: all.geoVerified >= 0.9 ? tone.good : tone.important },
            ]}
          />
        </Tile>
        <Tile key="plans" title="Cycle plans" icon="document-text-outline" alert={all.plansPending > 0} onPress={() => router.navigate('/plan')}>
          <StatSplit
            items={[
              { value: all.plansPending, label: 'Awaiting approval', color: all.plansPending ? tone.important : colors.faint },
              { value: all.plansMissing, label: 'No plan', color: all.plansMissing ? tone.urgent : colors.faint },
            ]}
          />
        </Tile>
        <SyncTile key="sync" />
      </Grid>

      <SectionTitle>Teams</SectionTitle>
      {teams.length === 0 && <Empty icon="people-outline" title="No teams yet">No first-line managers report here yet.</Empty>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {teams.map(({ flm, r }) => (
          <View key={flm.id} style={{ flexGrow: 1, flexBasis: 300 }}>
            <Card onPress={() => router.push({ pathname: '/team/[id]', params: { id: flm.id } })}>
              <Row gap={space.md}>
                <UserAvatar user={flm} />
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
