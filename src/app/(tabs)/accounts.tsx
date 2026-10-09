import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/data/dates';
import { hasLocation } from '@/data/geo';
import { callsByAccount, cycleCalls } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { allTierNames, tierRankIn } from '@/data/tiers';
import type { AccountType, Tier } from '@/data/types';
import { Avatar, Button, Card, Chip, Empty, IconButton, Row, SearchBox, Segmented, TierBadge, text } from '@/ui/components';
import { columnsFor, useLayout } from '@/ui/layout';
import { colors, space } from '@/ui/theme';

type Filter = 'All' | AccountType;
type Sort = 'Name' | 'Tier' | 'Last call';

export default function AccountsScreen() {
  const me = useMe();
  const { data, accounts, calls, cycle, lastCallFor, getUser, syncNow, sync, admin } = useStore();
  const { maxWide, pad, width } = useLayout();
  const cols = columnsFor(Math.min(width, maxWide) - 2 * pad, 340, 3);
  const [sort, setSort] = useState<Sort>('Name');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [tier, setTier] = useState<Tier | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [planOnly, setPlanOnly] = useState(false);
  const [kolOnly, setKolOnly] = useState(false);
  const [highOnly, setHighOnly] = useState(false);

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
    const list = accounts.filter(
      (a) =>
        (filter === 'All' || a.type === filter) &&
        (!tier || a.tier === tier) &&
        (!owner || a.ownerId === owner) &&
        (!planOnly || progress.has(a.id)) &&
        (!kolOnly || a.kol) &&
        (!highOnly || a.potential === 'High') &&
        (!q || [a.name, a.specialty, a.city, a.affiliation ?? '', a.segment ?? ''].some((v) => v.toLowerCase().includes(q))),
    );
    if (sort === 'Tier') return [...list].sort((x, y) => tierRankIn(data.settings, x.tier) - tierRankIn(data.settings, y.tier) || x.name.localeCompare(y.name));
    if (sort === 'Last call') {
      // Longest since the last submitted call first: who is due a visit.
      // One pass over the calls, not one per comparison.
      const lastAt = new Map<string, string>();
      for (const c of calls) if (c.status === 'Submitted' && (lastAt.get(c.accountId) ?? '') < c.datetime) lastAt.set(c.accountId, c.datetime);
      const last = (id: string) => lastAt.get(id) ?? '';
      return [...list].sort((x, y) => last(x.id).localeCompare(last(y.id)) || x.name.localeCompare(y.name));
    }
    return list;
  }, [accounts, query, filter, tier, owner, planOnly, kolOnly, highOnly, progress, sort, data.settings, calls]);

  const tierNames = useMemo(() => {
    const order = allTierNames(data.settings);
    const present = new Set(accounts.map((a) => a.tier));
    return [...order.filter((t) => present.has(t)), ...[...present].filter((t) => !order.includes(t))];
  }, [accounts, data.settings]);

  return (
    <View style={styles.root}>
      <View style={[styles.inner, { maxWidth: maxWide, padding: pad }]}>
        <SearchBox value={query} onChangeText={setQuery} placeholder="Search name, specialty, city, segment" />
        <Segmented options={['All', 'HCP', 'HCO'] as Filter[]} value={filter} onChange={setFilter} labels={{ HCP: 'People', HCO: 'Organizations' }} />
        <View style={styles.filters}>
          {tierNames.map((t) => (
            <Chip key={t} label={t} selected={tier === t} onPress={() => setTier(tier === t ? null : t)} />
          ))}
          <Chip label="In my plan" icon="calendar-outline" selected={planOnly} onPress={() => setPlanOnly(!planOnly)} />
          {accounts.some((a) => a.kol) && <Chip label="KOL" icon="star-outline" selected={kolOnly} onPress={() => setKolOnly(!kolOnly)} />}
          {accounts.some((a) => a.potential === 'High') && <Chip label="High potential" icon="trending-up-outline" selected={highOnly} onPress={() => setHighOnly(!highOnly)} />}
          {(me.role !== 'Rep' || admin) &&
            owners.map((u) => <Chip key={u!.id} label={u!.name.split(' ')[0]} selected={owner === u!.id} onPress={() => setOwner(owner === u!.id ? null : u!.id)} />)}
        </View>
        <FlatList
          key={`cols-${cols}`}
          data={visible}
          keyExtractor={(a) => a.id}
          numColumns={cols}
          columnWrapperStyle={cols > 1 ? { gap: space.sm } : undefined}
          refreshControl={<RefreshControl refreshing={sync.syncing} onRefresh={() => syncNow()} tintColor={colors.primary} />}
          ListHeaderComponent={
            <Row style={{ marginBottom: space.md }}>
              <Text style={[text.title, { flex: 1, fontSize: 14 }]}>
                {visible.length} account{visible.length === 1 ? '' : 's'}
              </Text>
              <Text style={text.small}>Sort</Text>
              {(['Name', 'Tier', 'Last call'] as Sort[]).map((x) => (
                <Text key={x} onPress={() => setSort(x)} accessibilityRole="button" accessibilityState={{ selected: sort === x }} style={[styles.sort, sort === x && styles.sortOn]}>
                  {x === 'Name' ? 'A–Z' : x}
                </Text>
              ))}
            </Row>
          }
          ListEmptyComponent={<Empty icon="search-outline" title="No accounts match">Try another name, or clear the filters above.</Empty>}
          ListFooterComponent={
            <View style={{ marginTop: space.md, marginBottom: space.xl }}>
              <Button title="Add account" icon="add" variant="secondary" onPress={() => router.push('/account/new')} />
            </View>
          }
          renderItem={({ item: a }) => {
            const last = lastCallFor(a.id);
            const p = progress.get(a.id);
            // Quick actions on the rep's own accounts.
            const canAct = a.ownerId === me.id;
            return (
              <View style={{ flex: 1, maxWidth: `${100 / cols}%` }}>
                <Card onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })} style={styles.row}>
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
                        {a.kol && <Ionicons name="star" size={14} color={colors.warn} accessibilityLabel="Key opinion leader" />}
                        <TierBadge tier={a.tier} />
                      </Row>
                      <Text style={text.muted} numberOfLines={1}>
                        {a.specialty}
                        {a.potential ? ` · ${a.potential} potential` : ''}
                        {a.affiliation ? ` · ${a.affiliation}` : ''}
                      </Text>
                      <Row style={{ marginTop: 2 }}>
                        <Text style={[text.small, { flex: 1 }]} numberOfLines={1}>
                          {a.city} · {last ? `Last call ${formatDate(last.datetime)}` : 'No submitted calls'}
                          {(me.role !== 'Rep' || admin) ? ` · ${getUser(a.ownerId)?.name ?? ''}` : ''}
                        </Text>
                        {!hasLocation(a) && <Ionicons name="location-outline" size={14} color={colors.warn} accessibilityLabel="No location" />}
                        {p && (
                          <Text style={[text.small, { color: p.done >= p.planned ? colors.success : colors.primary, fontWeight: '700' }]}>
                            {p.done}/{p.planned}
                          </Text>
                        )}
                      </Row>
                    </View>
                    {canAct && (
                      <View style={styles.actions}>
                        <IconButton icon="create-outline" label={`Log a call with ${a.name}`} size={36} onPress={() => router.push({ pathname: '/call/edit', params: { accountId: a.id } })} />
                        <IconButton icon="calendar-outline" label={`Plan a visit to ${a.name}`} size={36} onPress={() => router.push({ pathname: '/call/edit', params: { accountId: a.id, plan: '1' } })} />
                      </View>
                    )}
                  </Row>
                </Card>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingBottom: 0, width: '100%', alignSelf: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { paddingVertical: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginLeft: space.xs },
  sort: { fontSize: 12, color: colors.muted, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  sortOn: { color: colors.primary, backgroundColor: colors.primarySoft },
  org: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
