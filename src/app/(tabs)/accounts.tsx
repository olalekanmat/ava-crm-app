import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/data/dates';
import { hasLocation } from '@/data/geo';
import { callsByAccount, cycleCalls } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { TIERS, type AccountType, type Tier } from '@/data/types';
import { Avatar, Button, Card, Chip, Empty, Row, SearchBox, Segmented, TierBadge, text } from '@/ui/components';
import { colors, space } from '@/ui/theme';

type Filter = 'All' | AccountType;

export default function AccountsScreen() {
  const me = useMe();
  const { data, accounts, calls, cycle, lastCallFor, getUser } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [tier, setTier] = useState<Tier | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [planOnly, setPlanOnly] = useState(false);

  const owners = useMemo(() => [...new Set(accounts.map((a) => a.ownerId))].map((id) => getUser(id)).filter((u) => !!u), [accounts, getUser]);
  // Planned vs done this cycle, per account (for the account's own rep).
  const progress = useMemo(() => {
    const out = new Map<string, { planned: number; done: number }>();
    if (!cycle) return out;
    const done = callsByAccount(cycleCalls(calls, cycle));
    for (const p of data.plans.filter((x) => x.cycleId === cycle.id)) {
      for (const t of p.targets) out.set(t.accountId, { planned: t.planned, done: done.get(t.accountId)?.filter((c) => c.ownerId === p.ownerId).length ?? 0 });
    }
    return out;
  }, [cycle, calls, data.plans]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        (filter === 'All' || a.type === filter) &&
        (!tier || a.tier === tier) &&
        (!owner || a.ownerId === owner) &&
        (!planOnly || progress.has(a.id)) &&
        (!q || [a.name, a.specialty, a.city, a.affiliation ?? ''].some((v) => v.toLowerCase().includes(q))),
    );
  }, [accounts, query, filter, tier, owner, planOnly, progress]);

  return (
    <View style={styles.root}>
      <View style={styles.inner}>
        <SearchBox value={query} onChangeText={setQuery} placeholder="Search name, specialty, city" />
        <Segmented options={['All', 'HCP', 'HCO'] as Filter[]} value={filter} onChange={setFilter} labels={{ HCP: 'People', HCO: 'Organizations' }} />
        <View style={styles.filters}>
          {TIERS.map((t) => (
            <Chip key={t} label={`Tier ${t}`} selected={tier === t} onPress={() => setTier(tier === t ? null : t)} />
          ))}
          <Chip label="In my plan" icon="calendar-outline" selected={planOnly} onPress={() => setPlanOnly(!planOnly)} />
          {me.role !== 'Rep' &&
            owners.map((u) => <Chip key={u!.id} label={u!.name.split(' ')[0]} selected={owner === u!.id} onPress={() => setOwner(owner === u!.id ? null : u!.id)} />)}
        </View>
        <FlatList
          data={visible}
          keyExtractor={(a) => a.id}
          ListHeaderComponent={<Text style={[text.small, { marginBottom: space.sm }]}>{visible.length} accounts</Text>}
          ListEmptyComponent={<Empty icon="search-outline">No accounts match.</Empty>}
          ListFooterComponent={
            <View style={{ marginTop: space.md, marginBottom: space.xl }}>
              <Button title="Add account" icon="add" variant="secondary" onPress={() => router.push('/account/new')} />
            </View>
          }
          renderItem={({ item: a }) => {
            const last = lastCallFor(a.id);
            const p = progress.get(a.id);
            return (
              <Card onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}>
                <Row gap={space.md}>
                  {a.type === 'HCP' ? (
                    <Avatar name={a.name} size={38} />
                  ) : (
                    <View style={styles.org}>
                      <Ionicons name="business" size={18} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Row>
                      <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <TierBadge tier={a.tier} />
                    </Row>
                    <Text style={text.muted} numberOfLines={1}>
                      {a.specialty}
                      {a.affiliation ? ` · ${a.affiliation}` : ''}
                    </Text>
                    <Row style={{ marginTop: 2 }}>
                      <Text style={[text.small, { flex: 1 }]} numberOfLines={1}>
                        {a.city} · {last ? `Last call ${formatDate(last.datetime)}` : 'No submitted calls'}
                        {me.role !== 'Rep' ? ` · ${getUser(a.ownerId)?.name ?? ''}` : ''}
                      </Text>
                      {!hasLocation(a) && <Ionicons name="location-outline" size={14} color={colors.warn} accessibilityLabel="No location" />}
                      {p && (
                        <Text style={[text.small, { color: p.done >= p.planned ? colors.success : colors.primary, fontWeight: '700' }]}>
                          {p.done}/{p.planned}
                        </Text>
                      )}
                    </Row>
                  </View>
                </Row>
              </Card>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, padding: space.lg, paddingBottom: 0, width: '100%', maxWidth: 760, alignSelf: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap' },
  org: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
