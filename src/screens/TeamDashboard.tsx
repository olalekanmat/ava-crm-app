import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { paceOf, type Pace } from '@/data/alerts';
import { toDateKey } from '@/data/dates';
import { cycleElapsed, daysLeft, pct, teamRollup, type RepMetrics, type Rollup } from '@/data/metrics';
import { useStore } from '@/data/store';
import { allTierNames, tierRankIn } from '@/data/tiers';
import type { User } from '@/data/types';
import { HeroStat } from '@/ui/Brand';
import { CallRow } from '@/ui/CallRow';
import { Banner, Card, Empty, PlanBadge, ProgressBar, Row, SectionTitle, TierBadge, UserAvatar, text, tierColor } from '@/ui/components';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { LicenseBanner } from '@/ui/SyncCard';
import { StatSplit, Tile } from '@/ui/Tiles';
import { colors, paceColor, space, tone } from '@/ui/theme';
import { AlertsTile, CyclePlanTile, HeroButton, HomeHeader, ScheduleTile, SyncTile } from './HomeTiles';

/** How many reps are on track, at risk and behind their plan. */
export function repHealth(reps: RepMetrics[], elapsed: number): Record<Pace, number> {
  const out = { onTrack: 0, atRisk: 0, behind: 0 };
  for (const m of reps) if (m.planned) out[paceOf(m.onPlan, m.planned, elapsed)]++;
  return out;
}

/** One rep's line on a team dashboard. */
export function RepCard({ m, elapsed }: { m: RepMetrics; elapsed: number }) {
  return (
    <Card onPress={() => router.push({ pathname: '/team/[id]', params: { id: m.rep.id } })}>
      <Row gap={space.md}>
        <UserAvatar user={m.rep} />
        <View style={{ flex: 1 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={text.title} numberOfLines={1}>
              {m.rep.name}
            </Text>
            <PlanBadge status={m.plan?.status ?? 'None'} />
          </Row>
          <Text style={text.muted}>{m.rep.territory}</Text>
        </View>
      </Row>
      <Row style={{ marginTop: space.md }}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={m.attainment} marker={elapsed} color={paceColor(m.attainment, elapsed)} />
        </View>
        <Text style={[text.title, { color: paceColor(m.attainment, elapsed), minWidth: 44, textAlign: 'right' }]}>{m.planned ? pct(m.attainment) : '–'}</Text>
      </Row>
      <Text style={[text.small, { marginTop: space.sm }]}>
        {m.calls} calls · reach {m.reached}/{m.targets} · geo-verified {m.inPerson ? pct(m.geoVerified) : '–'}
        {m.drafts ? ` · ${m.drafts} open draft${m.drafts > 1 ? 's' : ''}` : ''}
      </Text>
    </Card>
  );
}

export function TierCoverage({ r }: { r: Rollup }) {
  const { data } = useStore();
  const known = allTierNames(data.settings);
  const tiers = [...known.filter((t) => r.reachByTier[t]), ...Object.keys(r.reachByTier).filter((t) => !known.includes(t))];
  if (!tiers.length) return <Empty icon="layers-outline">No planned accounts yet.</Empty>;
  return (
    <Card>
      {tiers.map((t, i) => {
        const x = r.reachByTier[t];
        const v = x.targets ? x.reached / x.targets : 0;
        const rank = tierRankIn(data.settings, t);
        return (
          <Row key={t} style={{ marginBottom: i === tiers.length - 1 ? 0 : space.md }}>
            <View style={{ width: 64 }}>
              <TierBadge tier={t} rank={rank} />
            </View>
            <View style={{ flex: 1 }}>
              <ProgressBar value={v} color={tierColor(rank).fg} />
            </View>
            <Text style={[text.muted, { width: 92, textAlign: 'right' }]}>
              {x.reached}/{x.targets} · {pct(v)}
            </Text>
          </Row>
        );
      })}
      <Text style={[text.small, { marginTop: space.md }]}>Share of planned accounts seen at least once this cycle.</Text>
    </Card>
  );
}

export function TeamHeroStats({ r }: { r: Rollup }) {
  return (
    <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
      <HeroStat label="Plan done" value={r.planned ? pct(r.attainment) : '–'} />
      <HeroStat label="Calls" value={r.calls} />
      <HeroStat label="Reach" value={r.targets ? pct(r.reach) : '–'} />
      <HeroStat label="Geo-verified" value={r.inPerson ? pct(r.geoVerified) : '–'} />
    </Row>
  );
}

/** First-line manager view: the reps reporting to `manager`. */
export function TeamDashboard({ manager }: { manager: User }) {
  const { data, cycle, calls, syncNow, sync } = useStore();
  if (!cycle) return <Screen><LicenseBanner /><Empty>No planning cycle found. Pull down to refresh.</Empty></Screen>;
  const r = teamRollup(data, manager, cycle);
  const elapsed = cycleElapsed(cycle);
  const teamIds = new Set(r.reps.map((x) => x.rep.id));
  const recent = calls.filter((c) => teamIds.has(c.ownerId) && c.status === 'Submitted').slice(0, 5);
  const sorted = [...r.reps].sort((a, b) => b.attainment - a.attainment);
  const geoIssues = r.reps.reduce((n, x) => n + x.offSite + x.missingCheckIn, 0);
  const notSubmitted = r.reps.filter((x) => !x.plan || x.plan.status === 'Draft');
  const today = toDateKey(new Date());
  const todays = calls.filter((c) => teamIds.has(c.ownerId) && toDateKey(new Date(c.datetime)) === today).reverse();

  return (
    <Screen wide onRefresh={syncNow} refreshing={sync.syncing}>
      <LicenseBanner />
      <HomeHeader
        eyebrow={`Team view · ${cycle.name} · ${daysLeft(cycle)} days left`}
        title={manager.territory ?? `${manager.name}'s team`}
        summary={`${r.reps.length} reps · ${r.onPlan} of ${r.planned} planned calls done · ${pct(elapsed)} of the cycle gone`}
        actions={
          <>
            <HeroButton title="Review plans" icon="checkmark-done-outline" onPress={() => router.navigate('/plan')} />
            <HeroButton title="Team calls" icon="calendar-outline" onPress={() => router.navigate('/calls')} />
          </>
        }
      />

      <Grid min={290} max={3}>
        <AlertsTile key="alerts" />
        <CyclePlanTile key="plan" cycle={cycle} attainment={r.attainment} planned={r.planned} health={repHealth(r.reps, elapsed)} unit={`${r.reps.length} reps · ${r.calls} calls`} onPress={() => router.navigate('/plan')} empty="No rep has a plan for this cycle yet." />
        <Tile key="plans" title="Cycle plans" icon="document-text-outline" alert={r.plansPending > 0} onPress={() => router.navigate('/plan')}>
          <StatSplit
            items={[
              { value: r.plansPending, label: 'To approve', color: r.plansPending ? tone.important : colors.faint },
              { value: notSubmitted.length, label: 'Not submitted', color: notSubmitted.length ? tone.urgent : colors.faint },
              { value: r.reps.filter((x) => x.plan?.status === 'Approved').length, label: 'Approved', color: tone.good },
            ]}
          />
        </Tile>
        <Tile key="geo" title="Check-ins" icon="location-outline" alert={geoIssues > 0}>
          <StatSplit
            items={[
              { value: r.inPerson ? pct(r.geoVerified) : '–', label: 'Geo-verified', color: r.geoVerified >= 0.9 ? tone.good : tone.important },
              { value: geoIssues, label: 'Off-site or missing', color: geoIssues ? tone.urgent : colors.faint },
            ]}
          />
        </Tile>
        <ScheduleTile key="today" calls={todays} showRep />
        <SyncTile key="sync" />
      </Grid>
      {notSubmitted.length > 0 && (
        <Banner tone="warn">
          {notSubmitted.map((x) => x.rep.name).join(', ')} {notSubmitted.length > 1 ? 'have' : 'has'} not submitted a plan for {cycle.name}.
        </Banner>
      )}
      {geoIssues > 0 && (
        <Banner tone="info" icon="location-outline">
          {geoIssues} in-person call{geoIssues > 1 ? 's' : ''} this cycle {geoIssues > 1 ? 'were' : 'was'} off-site or had no check-in. Open a rep to see which.
        </Banner>
      )}

      <SectionTitle>Reps</SectionTitle>
      {sorted.length ? (
        <Grid>
          {sorted.map((m) => (
            <RepCard key={m.rep.id} m={m} elapsed={elapsed} />
          ))}
        </Grid>
      ) : (
        <Empty icon="people-outline" title="No reps yet">No reps report to {manager.name} yet. An administrator can add them in Users & roles.</Empty>
      )}

      <SectionTitle>Coverage by tier</SectionTitle>
      <TierCoverage r={r} />

      <SectionTitle>Latest team calls</SectionTitle>
      {recent.length ? (
        <Grid min={360}>
          {recent.map((c) => (
            <CallRow key={c.id} call={c} showRep />
          ))}
        </Grid>
      ) : (
        <Empty>No submitted calls yet.</Empty>
      )}
    </Screen>
  );
}
