import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { planHealth } from '@/data/alerts';
import { addDays, toDateKey, todayKey } from '@/data/dates';
import { callsByAccount, cycleCalls, cycleElapsed, daysLeft, pct, repMetrics } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { CallRow } from '@/ui/CallRow';
import { Banner, Button, Card, Empty, ProgressBar, Row, SectionTitle, TierBadge, text } from '@/ui/components';
import { Grid, useLayout } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { LicenseBanner } from '@/ui/SyncCard';
import { StatSplit, Tile } from '@/ui/Tiles';
import { colors, space, tone } from '@/ui/theme';
import { AlertsTile, CompanyTile, CyclePlanTile, greeting, HeroButton, HomeHeader, QuickActionsTile, ScheduleTile, SyncTile, TasksTile } from './HomeTiles';

export function RepHome() {
  const me = useMe();
  const { data, calls, cycle, getAccount, syncNow, sync } = useStore();
  const { width, landscape, compact } = useLayout();
  const today = todayKey();
  const mine = calls.filter((c) => c.ownerId === me.id);
  const todays = mine.filter((c) => toDateKey(new Date(c.datetime)) === today).reverse();
  const drafts = mine.filter((c) => c.status === 'Saved');
  const followUps = mine.filter((c) => c.status === 'Submitted' && c.followUpDate && c.followUpDate <= toDateKey(addDays(new Date(), 7)));
  const m = cycle ? repMetrics(data, me, cycle) : undefined;
  const elapsed = cycle ? cycleElapsed(cycle) : 0;

  // Planned accounts furthest behind the pace they should be at by now.
  const done = cycle ? callsByAccount(cycleCalls(mine, cycle)) : new Map();
  const targets = m?.plan?.targets ?? [];
  const health = planHealth(targets, (id) => done.get(id)?.length ?? 0, elapsed);
  const behind = targets
    .map((t) => ({ t, done: done.get(t.accountId)?.length ?? 0, account: getAccount(t.accountId) }))
    .filter((x) => x.account && x.done < Math.floor(x.t.planned * elapsed))
    .sort((a, b) => a.done / a.t.planned - b.done / b.t.planned)
    .slice(0, 4);
  // A phone held upright already shows the logo in the header.
  const showCompany = !compact && (width >= 600 || landscape);
  // Three columns of tiles: a ninth tile completes the last row.
  const wideGrid = width >= 930;

  return (
    <Screen wide onRefresh={syncNow} refreshing={sync.syncing}>
      <LicenseBanner />
      <HomeHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${me.name.split(' ')[0]}`}
        summary={`${todays.length ? `${todays.length} call${todays.length === 1 ? '' : 's'} today.` : 'No calls scheduled today.'}${drafts.length ? ` ${drafts.length} draft${drafts.length === 1 ? '' : 's'} to submit.` : ''}`}
        actions={
          <>
            <HeroButton title="Log a call" icon="add-circle-outline" onPress={() => router.push('/call/edit')} />
            <HeroButton title="My plan" icon="flag-outline" onPress={() => router.navigate('/plan')} />
          </>
        }
      />

      <Grid min={290} max={3}>
        {showCompany && <CompanyTile key="company" cycle={cycle} />}
        <AlertsTile key="alerts" />
        <TasksTile key="tasks" />
        {cycle && m ? (
          <CyclePlanTile
            key="plan"
            cycle={cycle}
            attainment={m.attainment}
            planned={m.planned}
            health={health}
            unit={`${m.onPlan}/${m.planned} calls · ${daysLeft(cycle)} days left`}
            onPress={() => router.navigate('/plan')}
            empty={`You have no plan for ${cycle.name} yet. Build one in a minute from your accounts.`}
          />
        ) : null}
        <ScheduleTile key="today" calls={todays} />
        <Tile key="suggest" title="Suggestions" icon="bulb-outline" alert={behind.length > 0} onPress={() => router.navigate('/plan')}>
          <StatSplit
            items={[
              { value: health.behind, label: 'Behind plan', color: health.behind ? tone.urgent : colors.faint },
              { value: health.atRisk, label: 'At risk', color: health.atRisk ? tone.important : colors.faint },
            ]}
          />
          <Text style={[text.small, { marginTop: space.md, textAlign: 'center' }]} numberOfLines={1}>
            {behind[0] ? `Next: visit ${behind[0].account!.name}` : 'You are on pace with every planned account.'}
          </Text>
        </Tile>
        {m ? (
          <Tile key="perf" title="This cycle" icon="stats-chart-outline" onPress={() => router.navigate('/calls')}>
            <StatSplit
              items={[
                { value: m.calls, label: 'Calls', color: tone.normal },
                { value: m.targets ? pct(m.reach) : '–', label: 'Reach', color: m.reach >= elapsed ? tone.good : tone.important },
                { value: m.inPerson ? pct(m.geoVerified) : '–', label: 'Geo-verified', color: m.geoVerified >= 0.9 ? tone.good : tone.important },
              ]}
            />
            <Text style={[text.small, { marginTop: space.md, textAlign: 'center' }]}>
              Reach {m.reached}/{m.targets} planned accounts
            </Text>
          </Tile>
        ) : null}
        <SyncTile key="sync" />
        {(wideGrid || compact) && (
          <QuickActionsTile
            key="quick"
            actions={[
              { title: 'Log a call', icon: 'add-circle-outline', onPress: () => router.push('/call/edit') },
              { title: 'Plan a visit', icon: 'calendar-outline', onPress: () => router.push({ pathname: '/call/edit', params: { plan: '1' } }) },
              { title: 'New account', icon: 'person-add-outline', onPress: () => router.push('/account/new') },
            ]}
          />
        )}
      </Grid>

      {cycle && m && (
        <>
          {m.plan?.status === 'Rejected' && <Banner tone="danger">Your manager asked for changes: {m.plan.reviewNote}</Banner>}
          {m.plan && (
            <Text style={[text.small, { marginTop: space.xs }]}>
              Plan done {pct(m.attainment)} · reach {m.reached}/{m.targets} accounts · geo-verified {m.inPerson ? pct(m.geoVerified) : '–'}
            </Text>
          )}
        </>
      )}

      {behind.length > 0 && (
        <>
          <SectionTitle right={<Text style={text.small}>Accounts furthest behind pace</Text>}>Suggested visits</SectionTitle>
          <Grid>
            {behind.map(({ t, done: n, account }) => (
              <Card key={t.accountId} onPress={() => router.push({ pathname: '/account/[id]', params: { id: t.accountId } })}>
                <Row>
                  <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
                    {account!.name}
                  </Text>
                  <TierBadge tier={account!.tier} />
                </Row>
                <Text style={text.muted} numberOfLines={1}>
                  {account!.specialty} · {account!.city}
                </Text>
                <Row style={{ marginTop: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <ProgressBar value={n / t.planned} marker={elapsed} color={colors.orange} height={6} />
                  </View>
                  <Text style={text.muted}>
                    {n}/{t.planned}
                  </Text>
                  <Button small title="Schedule" icon="calendar-outline" variant="secondary" onPress={() => router.push({ pathname: '/call/edit', params: { accountId: t.accountId, plan: '1' } })} />
                </Row>
              </Card>
            ))}
          </Grid>
        </>
      )}

      {todays.length > 0 && (
        <>
          <SectionTitle>{"Today's calls"}</SectionTitle>
          <Grid min={360}>
            {todays.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </Grid>
        </>
      )}

      {drafts.length > 0 && (
        <>
          <SectionTitle right={<Text style={text.small}>Submit within 24 hours of the visit</Text>}>Drafts to submit</SectionTitle>
          <Grid min={360}>
            {drafts.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </Grid>
        </>
      )}

      {followUps.length > 0 && (
        <>
          <SectionTitle>Follow-ups due this week</SectionTitle>
          <Grid>
            {followUps.map((c) => (
              <Card key={c.id} onPress={() => router.push({ pathname: '/account/[id]', params: { id: c.accountId } })}>
                <Text style={text.title}>{getAccount(c.accountId)?.name}</Text>
                <Text style={text.muted}>Due {c.followUpDate}</Text>
                {!!c.nextStep && <Text style={[text.body, { marginTop: 4 }]}>{c.nextStep}</Text>}
              </Card>
            ))}
          </Grid>
        </>
      )}

      {!todays.length && !drafts.length && !behind.length && !followUps.length && (
        <Empty icon="sunny-outline" title="You are all caught up">
          Nothing scheduled and nothing overdue. Plan your next visits from the Schedule tab.
        </Empty>
      )}
    </Screen>
  );
}
