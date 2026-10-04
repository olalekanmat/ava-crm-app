import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { cycleElapsed, daysLeft, pct, teamRollup, type RepMetrics, type Rollup } from '@/data/metrics';
import { useStore } from '@/data/store';
import { allTierNames, tierRankIn } from '@/data/tiers';
import type { User } from '@/data/types';
import { Hero, HeroStat, heroText } from '@/ui/Brand';
import { CallRow } from '@/ui/CallRow';
import { Avatar, Banner, Card, Empty, PlanBadge, ProgressBar, Row, SectionTitle, TierBadge, text, tierColor } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { LicenseBanner, SyncBar } from '@/ui/SyncCard';
import { colors, paceColor, space } from '@/ui/theme';

/** One rep's line on a team dashboard. */
export function RepCard({ m, elapsed }: { m: RepMetrics; elapsed: number }) {
  return (
    <Card onPress={() => router.push({ pathname: '/team/[id]', params: { id: m.rep.id } })}>
      <Row gap={space.md}>
        <Avatar name={m.rep.name} />
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

  return (
    <Screen wide onRefresh={syncNow} refreshing={sync.syncing}>
      <SyncBar />
      <LicenseBanner />
      <Hero>
        <Text style={heroText.eyebrow}>
          Team view · {cycle.name} · {daysLeft(cycle)} days left
        </Text>
        <Text style={heroText.title}>{manager.territory ?? `${manager.name}'s team`}</Text>
        <Text style={heroText.body}>
          {r.reps.length} reps · {r.onPlan} of {r.planned} planned calls done · {pct(elapsed)} of the cycle gone
        </Text>
        <TeamHeroStats r={r} />
      </Hero>

      {r.plansPending > 0 && (
        <Card onPress={() => router.navigate('/plan')} style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }}>
          <Text style={[text.title, { color: colors.warn }]}>
            {r.plansPending} cycle plan{r.plansPending > 1 ? 's' : ''} waiting for your approval
          </Text>
          <Text style={text.muted}>Tap to review</Text>
        </Card>
      )}
      {r.plansMissing + r.reps.filter((x) => x.plan?.status === 'Draft').length > 0 && (
        <Banner tone="warn">
          {r.reps
            .filter((x) => !x.plan || x.plan.status === 'Draft')
            .map((x) => x.rep.name)
            .join(', ')}{' '}
          {r.reps.filter((x) => !x.plan || x.plan.status === 'Draft').length > 1 ? 'have' : 'has'} not submitted a plan for {cycle.name}.
        </Banner>
      )}
      {geoIssues > 0 && (
        <Banner tone="info" icon="location-outline">
          {geoIssues} in-person call{geoIssues > 1 ? 's' : ''} this cycle {geoIssues > 1 ? 'were' : 'was'} off-site or had no check-in. Open a rep to see which.
        </Banner>
      )}

      <SectionTitle>Reps</SectionTitle>
      {sorted.length ? sorted.map((m) => <RepCard key={m.rep.id} m={m} elapsed={elapsed} />) : <Empty>No reps report to {manager.name} yet.</Empty>}

      <SectionTitle>Coverage by tier</SectionTitle>
      <TierCoverage r={r} />

      <SectionTitle>Latest team calls</SectionTitle>
      {recent.length ? recent.map((c) => <CallRow key={c.id} call={c} showRep />) : <Empty>No submitted calls yet.</Empty>}
    </Screen>
  );
}
