import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { aiErrorMessage, runAi, useAiAvailable } from '@/ai/client';
import { roleLabel } from '@/data/access';
import { todayKey } from '@/data/dates';
import { digestForAi, parseTips, weeklyDigest, type RepWeek } from '@/data/digest';
import { useMe, useStore } from '@/data/store';
import { Banner, Button, Card, Empty, Kpi, KpiRow, ProgressBar, Row, SectionTitle, UserAvatar, text } from '@/ui/components';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { digestManager } from '@/ui/WeeklyTile';
import { colors, paceColor, space } from '@/ui/theme';

const day = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const pct = (v?: number) => (v === undefined ? '–' : `${Math.round(v * 100)}%`);
const tipsKey = (userId: string, weekOf: string) => `ava:weekly-tips:${userId}:${weekOf}`;

const QUESTION =
  'You are helping a pharmaceutical sales manager in Nigeria coach their reps this week. Using only the weekly summary in the context, write exactly one short, practical coaching tip for each rep. ' +
  'Answer with one line per rep in the form "Name: tip", using each rep’s name exactly as given, and nothing else. Keep each tip to one or two sentences.';

/** Weekly coaching summary for managers: each rep's week against the week before, with flags and wins. */
export default function WeeklyScreen() {
  const me = useMe();
  const { data, cycle } = useStore();
  const ai = useAiAvailable();
  const manager = digestManager(me);
  const digest = useMemo(() => (manager ? weeklyDigest(data, manager, cycle, new Date()) : null), [data, manager?.id, manager?.role, cycle]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tips, setTips] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const storageKey = digest ? tipsKey(me.id, digest.weekOf) : undefined;
  useEffect(() => {
    if (!storageKey) return;
    let live = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (live && raw) setTips(JSON.parse(raw) as Record<string, string>);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [storageKey]);

  if (!manager || !digest) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Weekly summary' }} />
        <Empty icon="newspaper-outline" title="For managers">
          The weekly summary helps managers coach their team. Your own progress is on your home screen and in your cycle plan.
        </Empty>
      </Screen>
    );
  }

  const getTips = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await runAi('ask', { question: QUESTION, role: roleLabel(me), context: digestForAi(digest), today: todayKey() });
      const found = parseTips(r.answer ?? '', digest.reps.map((x) => x.rep.name));
      if (!Object.keys(found).length) throw new Error('Ava did not give tips this time. Please try again.');
      setTips(found);
      if (storageKey) await AsyncStorage.setItem(storageKey, JSON.stringify(found)).catch(() => {});
    } catch (e) {
      setError(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const { totals, reps } = digest;
  const hasTips = Object.keys(tips).length > 0;
  const trend = totals.calls - totals.callsBefore;

  return (
    <Screen wide>
      <Stack.Screen options={{ title: 'Weekly summary' }} />
      <Text style={[text.muted, { marginBottom: space.md }]}>
        {day(digest.from)} – {day(digest.to)}
        {cycle ? ` · ${cycle.name}` : ''} · the last 7 days compared with the 7 before
      </Text>

      <KpiRow>
        <Kpi icon="chatbubbles-outline" label="Calls this week" value={totals.calls} sub={`${totals.callsBefore} the week before${trend ? ` (${trend > 0 ? '+' : ''}${trend})` : ''}`} tone={trend < 0 ? colors.warn : undefined} />
        <Kpi icon="alert-circle-outline" label="Need a word" value={`${totals.atRisk} of ${reps.length}`} sub={totals.atRisk ? 'reps with something to discuss' : 'Nothing flagged this week'} tone={totals.atRisk ? colors.warn : colors.success} />
      </KpiRow>

      {ai && reps.length > 0 && (
        <View style={{ marginTop: space.md }}>
          {busy ? (
            <Row>
              <ActivityIndicator color={colors.primary} />
              <Text style={text.muted}>Ava is writing a tip for each rep…</Text>
            </Row>
          ) : hasTips ? (
            <Row>
              <Text style={[text.small, { flex: 1 }]}>Tips from Ava are on each rep’s card. They are made by AI, so use your own judgement.</Text>
              <Button small variant="ghost" icon="refresh-outline" title="Ask again" onPress={getTips} />
            </Row>
          ) : (
            <Button title="Get coaching tips from Ava" icon="sparkles-outline" variant="secondary" onPress={getTips} />
          )}
          {!!error && (
            <View style={{ marginTop: space.sm }}>
              <Banner tone="warn">{error}</Banner>
            </View>
          )}
        </View>
      )}

      <SectionTitle>Your reps</SectionTitle>
      {!reps.length && <Empty icon="people-outline">No reps report to you yet.</Empty>}
      <Grid min={340} max={3}>
        {reps.map((r) => (
          <RepWeekCard key={r.rep.id} r={r} tip={tips[r.rep.name]} />
        ))}
      </Grid>
    </Screen>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={text.muted}>{label}</Text>
      <Text style={[text.title, tone ? { color: tone } : null]}>{value}</Text>
    </Row>
  );
}

function RepWeekCard({ r, tip }: { r: RepWeek; tip?: string }) {
  const diff = r.calls - r.callsBefore;
  return (
    <Card>
      <Row gap={space.md}>
        <UserAvatar user={r.rep} />
        <View style={{ flex: 1 }}>
          <Text style={text.title} numberOfLines={1}>
            {r.rep.name}
          </Text>
          {!!r.rep.territory && <Text style={text.muted}>{r.rep.territory}</Text>}
        </View>
      </Row>

      <View style={{ marginTop: space.md }}>
        <Line label="Calls this week" value={`${r.calls} (last week ${r.callsBefore})`} tone={diff < 0 ? colors.warn : diff > 0 ? colors.success : undefined} />
        <Text style={[text.muted, { marginTop: space.sm, marginBottom: space.xs }]}>
          Plan done {pct(r.attainment)} · cycle gone {pct(r.elapsed)}
        </Text>
        <ProgressBar value={r.attainment} marker={r.elapsed} color={paceColor(r.attainment, r.elapsed)} />
        <View style={{ marginTop: space.sm }}>
          <Line label="Checked in on site" value={pct(r.verified)} />
          <Line label="Objectives achieved" value={pct(r.objectivesRate)} />
          <Line label="Presentations used" value={`${r.presented} call${r.presented === 1 ? '' : 's'}`} />
          <Line label="Coaching" value={r.coachingAvg === undefined ? 'Not coached this cycle' : `${r.coachingAvg.toFixed(1)} / 5${r.weakestSkill ? ` · weakest: ${r.weakestSkill}` : ''}`} />
          {r.leaveDays > 0 && <Line label="On leave" value={`${r.leaveDays} day${r.leaveDays === 1 ? '' : 's'}`} />}
        </View>
      </View>

      {(r.risks.length > 0 || r.wins.length > 0) && (
        <View style={{ marginTop: space.md }}>
          {r.risks.map((x) => (
            <Banner key={x} tone="warn">
              {x}
            </Banner>
          ))}
          {r.wins.map((x) => (
            <Banner key={x} tone="success">
              {x}
            </Banner>
          ))}
        </View>
      )}
      {!r.risks.length && !r.wins.length && <Text style={[text.small, { marginTop: space.md }]}>Nothing stands out this week.</Text>}

      {!!tip && (
        <View style={{ marginTop: space.sm }}>
          <Banner tone="info" icon="sparkles">
            {tip}
          </Banner>
        </View>
      )}

      <Row style={{ marginTop: space.sm }}>
        <Button small variant="secondary" icon="person-outline" title="Open rep" onPress={() => router.push({ pathname: '/team/[id]', params: { id: r.rep.id } })} />
        <Button small variant="ghost" icon="checkbox-outline" title="Set a task" onPress={() => router.push('/tasks')} />
      </Row>
    </Card>
  );
}
