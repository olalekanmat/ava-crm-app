import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { geoStatus } from '@/data/geo';
import { callsByAccount, cycleCalls, cycleElapsed, pct, repMetrics } from '@/data/metrics';
import { useStore } from '@/data/store';
import type { User } from '@/data/types';
import { CallRow } from '@/ui/CallRow';
import { Button, Card, Empty, Kpi, KpiRow, PlanBadge, ProgressBar, Row, SectionTitle, TierBadge, UserAvatar, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, paceColor, space } from '@/ui/theme';

/** What a manager sees about one rep. */
export function RepDetail({ rep }: { rep: User }) {
  const { data, cycle, calls, getUser, getAccount } = useStore();
  if (!cycle) return <Screen><Empty>No cycle is set up yet.</Empty></Screen>;
  const m = repMetrics(data, rep, cycle);
  const elapsed = cycleElapsed(cycle);
  const theirs = calls.filter((c) => c.ownerId === rep.id);
  const inCycle = cycleCalls(theirs, cycle);
  const done = callsByAccount(inCycle);
  const exceptions = inCycle.filter((c) => ['Off-site', 'Missing'].includes(geoStatus(c, data.settings.geofenceM)));

  return (
    <Screen wide>
      <Card>
        <Row gap={space.md}>
          <UserAvatar user={rep} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={text.h2}>{rep.name}</Text>
            <Text style={text.muted}>
              {rep.territory} · reports to {getUser(rep.managerId)?.name ?? '—'}
            </Text>
            <Text style={text.muted}>{rep.email}</Text>
          </View>
        </Row>
      </Card>

      <KpiRow>
        <Kpi icon="flag-outline" label="Plan done" value={m.planned ? pct(m.attainment) : '–'} sub={`${m.onPlan}/${m.planned} calls · pace ${pct(elapsed)}`} tone={m.planned ? paceColor(m.attainment, elapsed) : undefined} />
        <Kpi icon="chatbubbles-outline" label="Calls this cycle" value={m.calls} sub={`${m.drafts} open drafts`} />
        <Kpi icon="people-outline" label="Reach" value={m.targets ? pct(m.reach) : '–'} sub={`${m.reached}/${m.targets} planned accounts`} />
        <Kpi icon="location-outline" label="Geo-verified" value={m.inPerson ? pct(m.geoVerified) : '–'} sub={`${m.offSite} off-site · ${m.missingCheckIn} no check-in`} tone={m.geoVerified < 0.8 ? colors.danger : undefined} />
      </KpiRow>

      <SectionTitle right={<PlanBadge status={m.plan?.status ?? 'None'} />}>{cycle.name} plan</SectionTitle>
      {m.plan ? (
        <Card>
          {m.plan.targets.map((t, i) => {
            const a = getAccount(t.accountId);
            const n = done.get(t.accountId)?.length ?? 0;
            return (
              <Row key={t.accountId} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>
                  {a?.name ?? 'Account'}
                </Text>
                {a && <TierBadge tier={a.tier} />}
                <View style={{ width: 90 }}>
                  <ProgressBar value={n / t.planned} marker={elapsed} color={n >= t.planned ? colors.success : colors.primary} height={6} />
                </View>
                <Text style={[text.muted, { width: 36, textAlign: 'right' }]}>
                  {n}/{t.planned}
                </Text>
              </Row>
            );
          })}
          {m.plan.status === 'Submitted' && (
            <View style={{ marginTop: space.md }}>
              <Button title="Review plan" icon="checkmark-done-outline" onPress={() => router.push({ pathname: '/plan/[id]', params: { id: m.plan!.id } })} />
            </View>
          )}
        </Card>
      ) : (
        <Empty icon="calendar-outline">No plan for {cycle.name} yet.</Empty>
      )}

      {exceptions.length > 0 && (
        <>
          <SectionTitle>Check-in exceptions</SectionTitle>
          {exceptions.map((c) => (
            <CallRow key={c.id} call={c} />
          ))}
        </>
      )}

      <SectionTitle>Recent calls</SectionTitle>
      {theirs.length ? theirs.slice(0, 10).map((c) => <CallRow key={c.id} call={c} />) : <Empty>No calls yet.</Empty>}
    </Screen>
  );
}
