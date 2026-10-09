import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { manages } from '@/data/access';
import { formatDate } from '@/data/dates';
import { useMe, useStore } from '@/data/store';
import { COACHING_SKILLS, type Call } from '@/data/types';
import { coachingAverage } from '@/ui/CoachingCard';
import { Card, Empty, ProgressBar, Row, SectionTitle, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** Coached visits: managers see the ones waiting for a scorecard; everyone sees feedback and average scores per skill. */
export default function CoachingScreen() {
  const me = useMe();
  const { data, calls, getAccount, getUser } = useStore();
  const coached = calls.filter((c) => c.status !== 'Planned' && (c.coachId || c.coaching));
  const waiting = coached.filter((c) => !c.coaching && c.ownerId !== me.id && (c.coachId === me.id || manages(data.users, me, c.ownerId)));
  const scored = coached.filter((c) => c.coaching);
  const mineScored = scored.filter((c) => c.ownerId === me.id);
  const forSkills = me.role === 'Rep' ? mineScored : scored;
  const skills = COACHING_SKILLS.map((k) => {
    const v = forSkills.map((c) => c.coaching!.scores[k]).filter((x): x is number => typeof x === 'number');
    return { skill: k, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, n: v.length };
  }).filter((x) => x.n);

  const row = (c: Call, sub: string) => (
    <Card key={c.id} onPress={() => router.push({ pathname: '/call/[id]', params: { id: c.id } })}>
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={text.title}>{getAccount(c.accountId)?.name ?? 'Account'}</Text>
          <Text style={text.muted}>{sub}</Text>
        </View>
        {c.coaching && <Text style={[text.h2, { color: colors.primary }]}>{coachingAverage(c.coaching)}</Text>}
      </Row>
    </Card>
  );

  return (
    <Screen>
      {waiting.length > 0 && (
        <>
          <SectionTitle>Waiting for your feedback ({waiting.length})</SectionTitle>
          {waiting.map((c) => row(c, `${getUser(c.ownerId)?.name ?? 'Rep'} · ${formatDate(c.datetime)}${c.status === 'Saved' ? ' · draft' : ''}`))}
        </>
      )}

      {skills.length > 0 && (
        <>
          <SectionTitle>{me.role === 'Rep' ? 'My skills' : 'Team skills'}</SectionTitle>
          <Card>
            {skills.map((x) => (
              <View key={x.skill} style={{ marginBottom: space.sm }}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={text.body}>{x.skill}</Text>
                  <Text style={text.muted}>
                    {x.avg.toFixed(1)} / 5 · {x.n} call{x.n > 1 ? 's' : ''}
                  </Text>
                </Row>
                <ProgressBar value={x.avg / 5} color={x.avg >= 4 ? colors.success : x.avg >= 3 ? colors.primary : colors.warn} />
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Coached visits</SectionTitle>
      {scored.length ? (
        scored.slice(0, 40).map((c) => row(c, `${c.ownerId === me.id ? '' : `${getUser(c.ownerId)?.name ?? 'Rep'} · `}${formatDate(c.datetime)} · by ${getUser(c.coaching!.by)?.name ?? 'manager'}`))
      ) : (
        <Empty icon="school-outline" title="No coached visits yet">
          {me.role === 'Rep' ? 'When your manager joins a visit, switch on “Coached visit” in the call log. Their feedback shows here.' : 'When a rep marks a visit as coached, it waits here for your scorecard. You can also coach any of your team’s calls from the call itself.'}
        </Empty>
      )}
    </Screen>
  );
}
