import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native';
import { addDays, toDateKey, todayKey } from '@/data/dates';
import { callsByAccount, cycleCalls, cycleElapsed, daysLeft, pct, repMetrics } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { Hero, HeroStat, heroText } from '@/ui/Brand';
import { CallRow } from '@/ui/CallRow';
import { Banner, Button, Card, Empty, PlanBadge, ProgressBar, Row, SectionTitle, TierBadge, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, paceColor, space } from '@/ui/theme';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function RepHome() {
  const me = useMe();
  const { data, calls, cycle, getAccount, syncNow, sync } = useStore();
  const today = todayKey();
  const mine = calls.filter((c) => c.ownerId === me.id);
  const todays = mine.filter((c) => toDateKey(new Date(c.datetime)) === today).reverse();
  const drafts = mine.filter((c) => c.status === 'Saved');
  const followUps = mine.filter((c) => c.status === 'Submitted' && c.followUpDate && c.followUpDate <= toDateKey(addDays(new Date(), 7)));
  const m = cycle ? repMetrics(data, me, cycle) : undefined;
  const elapsed = cycle ? cycleElapsed(cycle) : 0;

  // Planned accounts furthest behind the pace they should be at by now.
  const done = cycle ? callsByAccount(cycleCalls(mine, cycle)) : new Map();
  const behind = (m?.plan?.targets ?? [])
    .map((t) => ({ t, done: done.get(t.accountId)?.length ?? 0, account: getAccount(t.accountId) }))
    .filter((x) => x.account && x.done < Math.floor(x.t.planned * elapsed))
    .sort((a, b) => a.done / a.t.planned - b.done / b.t.planned)
    .slice(0, 4);

  return (
    <Screen onRefresh={syncNow} refreshing={sync.syncing}>
      <Hero>
        <Text style={heroText.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        <Text style={heroText.title}>
          {greeting()}, {me.name.split(' ')[0]}
        </Text>
        <Text style={heroText.body}>
          {todays.length ? `You have ${todays.length} call${todays.length === 1 ? '' : 's'} today.` : 'No calls scheduled today.'}
          {drafts.length ? ` ${drafts.length} draft${drafts.length === 1 ? '' : 's'} to submit.` : ''}
        </Text>
        <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          <HeroStat label="Today" value={todays.length} />
          <HeroStat label="Drafts" value={drafts.length} />
          <HeroStat label="Plan done" value={m?.planned ? pct(m.attainment) : '–'} />
          <HeroStat label="Geo-verified" value={m?.inPerson ? pct(m.geoVerified) : '–'} />
        </Row>
      </Hero>

      <Row>
        <Button title="Log a call" icon="add-circle-outline" onPress={() => router.push('/call/edit')} />
        <Button title="My plan" icon="calendar-outline" variant="secondary" onPress={() => router.navigate('/plan')} />
      </Row>

      {cycle && m && (
        <>
          <SectionTitle right={<PlanBadge status={m.plan?.status ?? 'None'} />}>{cycle.name} progress</SectionTitle>
          <Card onPress={() => router.navigate('/plan')}>
            {m.plan ? (
              <>
                <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
                  <Text style={text.title}>
                    {m.onPlan} of {m.planned} planned calls
                  </Text>
                  <Text style={[text.title, { color: paceColor(m.attainment, elapsed) }]}>{pct(m.attainment)}</Text>
                </Row>
                <ProgressBar value={m.attainment} marker={elapsed} color={paceColor(m.attainment, elapsed)} />
                <Text style={[text.muted, { marginTop: space.sm }]}>
                  {daysLeft(cycle)} days left · the marker shows where you should be by today · reach {m.reached}/{m.targets} accounts
                </Text>
              </>
            ) : (
              <Text style={text.body}>You have no plan for {cycle.name} yet. Build one in a minute from your accounts.</Text>
            )}
          </Card>
          {m.plan?.status === 'Rejected' && <Banner tone="danger">Your manager asked for changes: {m.plan.reviewNote}</Banner>}
        </>
      )}

      <SectionTitle>Today's calls</SectionTitle>
      {todays.length ? todays.map((c) => <CallRow key={c.id} call={c} />) : <Empty icon="sunny-outline">Nothing scheduled. Plan a visit from your behind-plan accounts below.</Empty>}

      {drafts.length > 0 && (
        <>
          <SectionTitle>Drafts to submit</SectionTitle>
          {drafts.map((c) => (
            <CallRow key={c.id} call={c} />
          ))}
        </>
      )}

      {behind.length > 0 && (
        <>
          <SectionTitle>Behind plan</SectionTitle>
          {behind.map(({ t, done: n, account }) => (
            <Card key={t.accountId} onPress={() => router.push({ pathname: '/account/[id]', params: { id: t.accountId } })}>
              <Row>
                <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
                  {account!.name}
                </Text>
                <TierBadge tier={account!.tier} />
              </Row>
              <Row style={{ marginTop: space.sm }}>
                <View style={{ flex: 1 }}>
                  <ProgressBar value={n / t.planned} marker={elapsed} color={colors.orange} height={6} />
                </View>
                <Text style={text.muted}>
                  {n}/{t.planned}
                </Text>
                <Button small title="Schedule" variant="secondary" onPress={() => router.push({ pathname: '/call/edit', params: { accountId: t.accountId, plan: '1' } })} />
              </Row>
            </Card>
          ))}
        </>
      )}

      {followUps.length > 0 && (
        <>
          <SectionTitle>Follow-ups due this week</SectionTitle>
          {followUps.map((c) => (
            <Card key={c.id} onPress={() => router.push({ pathname: '/account/[id]', params: { id: c.accountId } })}>
              <Text style={text.title}>{getAccount(c.accountId)?.name}</Text>
              <Text style={text.muted}>Due {c.followUpDate}</Text>
              {!!c.nextStep && <Text style={[text.body, { marginTop: 4 }]}>{c.nextStep}</Text>}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
