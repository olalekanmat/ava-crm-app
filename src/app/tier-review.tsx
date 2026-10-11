import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { visibleOwnerIds } from '@/data/access';
import { activeCycleLength, previousCycle } from '@/data/cycles';
import { useMe, useStore } from '@/data/store';
import { tierSuggestions, type TierSuggestion } from '@/data/tierReview';
import { Banner, Button, Card, Empty, Row, SectionTitle, TierBadge, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const DISMISSED = 'ava:tier-review-dismissed';
const keyOf = (x: TierSuggestion, cycleId: string) => `${cycleId}|${x.account.id}|${x.to}`;

/** End-of-cycle tier review (2.9): Ava suggests doctors to move up or down a tier; the manager approves. */
export default function TierReviewScreen() {
  const me = useMe();
  const { data, cycle, run, getUser, admin } = useStore();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED)
      .then((v) => v && setDismissed(new Set(JSON.parse(v) as string[])))
      .catch(() => {});
  }, []);

  const owners = useMemo(() => {
    const ids = visibleOwnerIds(data.users, me);
    if (!admin) ids.delete(me.id);
    return ids;
  }, [data.users, me, admin]);
  const prev = cycle ? previousCycle(data.cycles, cycle, activeCycleLength(data.settings)) : undefined;
  const all = useMemo(() => (cycle ? tierSuggestions(data, cycle, owners, prev) : []), [data, cycle, owners, prev]);

  if (me.role === 'Rep' && !admin) return <Screen><Empty icon="lock-closed-outline">Your manager reviews tiers at the end of each cycle.</Empty></Screen>;
  if (!cycle) return <Screen><Empty>No planning cycle found. Pull down to refresh.</Empty></Screen>;

  const shown = all.filter((x) => !dismissed.has(keyOf(x, cycle.id)));
  const dismiss = (list: TierSuggestion[]) => {
    const next = new Set(dismissed);
    for (const x of list) next.add(keyOf(x, cycle.id));
    setDismissed(next);
    AsyncStorage.setItem(DISMISSED, JSON.stringify([...next].slice(-2000))).catch(() => {});
  };
  const apply = (list: TierSuggestion[]) => {
    let ok = 0;
    for (const x of list) {
      try {
        run({ type: 'account.upsert', account: { ...x.account, tier: x.to } });
        ok++;
      } catch (e) {
        notify(`${x.account.name} not changed`, e instanceof Error ? e.message : String(e));
        break;
      }
    }
    if (ok) dismiss(list.slice(0, ok));
  };

  const up = shown.filter((x) => x.direction === 'up');
  const down = shown.filter((x) => x.direction === 'down');

  return (
    <Screen wide>
      <Banner icon="sparkles-outline">
        Ava looks at each doctor’s potential, key-opinion-leader status and how they reacted to presentations in {prev ? `${prev.name} and ` : ''}{cycle.name}. Approved changes apply now; plans for the next cycle pick up the new tier frequency.
      </Banner>
      {!shown.length && (
        <Empty icon="checkmark-done-outline" title="No changes suggested">
          Tiers look right for now. Set potential and KOL on doctors’ profiles, and record reactions in calls, to get suggestions.
        </Empty>
      )}
      {shown.length > 1 && (
        <Row style={{ marginBottom: space.sm }}>
          <Button title={`Approve all ${shown.length}`} icon="checkmark-done-outline" onPress={() => confirm(`Change ${shown.length} tiers?`, 'Each doctor moves one tier as suggested.', () => apply(shown), 'Approve all')} />
        </Row>
      )}
      {[
        { title: 'Move up', list: up, icon: 'trending-up-outline' as const, tone: colors.success },
        { title: 'Move down', list: down, icon: 'trending-down-outline' as const, tone: colors.warn },
      ]
        .filter((g) => g.list.length)
        .map((g) => (
          <View key={g.title}>
            <SectionTitle>
              {g.title} ({g.list.length})
            </SectionTitle>
            <Grid>
              {g.list.map((x) => (
                <Card key={x.account.id}>
                  <Row>
                    <Ionicons name={g.icon} size={20} color={g.tone} />
                    <Text style={[text.title, { flex: 1 }]} onPress={() => router.push({ pathname: '/account/[id]', params: { id: x.account.id } })}>
                      {x.account.name}
                    </Text>
                    <TierBadge tier={x.from} />
                    <Ionicons name="arrow-forward" size={14} color={colors.faint} />
                    <TierBadge tier={x.to} />
                  </Row>
                  <Text style={text.muted}>
                    {x.account.specialty} · {getUser(x.account.ownerId)?.name ?? 'No rep'}
                  </Text>
                  <Text style={[text.small, { marginTop: 4 }]}>{x.reasons.join(' · ')}</Text>
                  <Row style={{ marginTop: space.sm }}>
                    <Button small title="Approve" icon="checkmark" onPress={() => apply([x])} />
                    <Button small variant="ghost" title="Not now" onPress={() => dismiss([x])} />
                  </Row>
                </Card>
              ))}
            </Grid>
          </View>
        ))}
    </Screen>
  );
}
