import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { findDuplicates, type DuplicateGroup } from '@/data/duplicates';
import { useStore } from '@/data/store';
import { Banner, Button, Card, Empty, Row, Segmented, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const DISMISSED = 'ava:duplicates-dismissed';
const groupKey = (g: DuplicateGroup) => g.accounts.map((a) => a.id).sort().join('|');

/** Administrators find doctors and hospitals entered twice and merge them, keeping all history. */
export default function DuplicatesScreen() {
  const { data, admin, run, getUser } = useStore();
  const [kind, setKind] = useState<'HCP' | 'HCO'>('HCP');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED)
      .then((v) => v && setDismissed(new Set(JSON.parse(v) as string[])))
      .catch(() => {});
  }, []);

  const callCount = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of data.calls) if (c.status === 'Submitted') n.set(c.accountId, (n.get(c.accountId) ?? 0) + 1);
    return n;
  }, [data.calls]);
  const groups = useMemo(() => findDuplicates(data.accounts, (id) => callCount.get(id) ?? 0), [data.accounts, callCount]);
  const shown = groups.filter((g) => g.accounts[0].type === kind && !dismissed.has(groupKey(g)));

  const dismiss = (g: DuplicateGroup) => {
    const next = new Set(dismissed).add(groupKey(g));
    setDismissed(next);
    AsyncStorage.setItem(DISMISSED, JSON.stringify([...next])).catch(() => {});
  };

  if (!admin) {
    return (
      <Screen>
        <Empty icon="lock-closed-outline">Only administrators can merge accounts.</Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <Banner icon="git-merge-outline">Merging moves calls, plans, tasks and event invites to the account you keep, then removes the copies. It cannot be undone.</Banner>
      <Segmented options={['HCP', 'HCO'] as const} value={kind} onChange={setKind} labels={{ HCP: 'People', HCO: 'Organizations' }} />
      {!shown.length && (
        <Empty icon="checkmark-circle-outline" title="No duplicates found">
          Ava compares names, cities and phone numbers. New accounts are checked as they are added.
        </Empty>
      )}
      <Grid>
        {shown.map((g) => (
          <GroupCard
            key={groupKey(g)}
            group={g}
            calls={(id) => callCount.get(id) ?? 0}
            owner={(id) => getUser(id)?.name}
            onDismiss={() => dismiss(g)}
            onMerge={(keepId, ids) => {
              const keep = g.accounts.find((a) => a.id === keepId)!;
              confirm(`Merge into ${keep.name}?`, `${ids.length} cop${ids.length > 1 ? 'ies are' : 'y is'} removed and their history moves to ${keep.name}.`, () => {
                try {
                  run({ type: 'account.merge', keepId, ids });
                } catch (e) {
                  notify('Not merged', e instanceof Error ? e.message : String(e));
                }
              }, 'Merge');
            }}
          />
        ))}
      </Grid>
    </Screen>
  );
}

function GroupCard({ group, calls, owner, onMerge, onDismiss }: { group: DuplicateGroup; calls: (id: string) => number; owner: (id: string) => string | undefined; onMerge: (keepId: string, ids: string[]) => void; onDismiss: () => void }) {
  const [keepId, setKeepId] = useState(group.accounts[0].id);
  return (
    <Card>
      <Text style={[text.small, { color: colors.warn, fontWeight: '700' }]}>{group.reason}</Text>
      {group.accounts.map((a) => {
        const kept = a.id === keepId;
        return (
          <Pressable key={a.id} onPress={() => setKeepId(a.id)} accessibilityRole="radio" accessibilityState={{ checked: kept }} style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.hairline }}>
            <Row>
              <Ionicons name={kept ? 'radio-button-on' : 'radio-button-off'} size={20} color={kept ? colors.primary : colors.faint} />
              <View style={{ flex: 1 }}>
                <Text style={text.title}>
                  {a.name}
                  {kept ? <Text style={[text.small, { color: colors.primary }]}>  · keep</Text> : null}
                </Text>
                <Text style={text.muted}>{[a.specialty, a.city, a.phone].filter(Boolean).join(' · ')}</Text>
                <Text style={text.small}>
                  {calls(a.id)} call{calls(a.id) === 1 ? '' : 's'} · {owner(a.ownerId) ?? 'No rep'}
                </Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.faint} onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })} accessibilityLabel={`Open ${a.name}`} />
            </Row>
          </Pressable>
        );
      })}
      <Row style={{ marginTop: space.md }}>
        <Button small title="Merge" icon="git-merge-outline" onPress={() => onMerge(keepId, group.accounts.filter((a) => a.id !== keepId).map((a) => a.id))} />
        <Button small variant="ghost" title="Not duplicates" onPress={onDismiss} />
      </Row>
    </Card>
  );
}
