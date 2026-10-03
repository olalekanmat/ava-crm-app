import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatDate } from '@/data/dates';
import { useStore } from '@/data/store';
import type { AccountType } from '@/data/types';
import { Button, Card, Chip, Empty, TierBadge, text } from '@/ui/components';
import { colors, space } from '@/ui/theme';

type Filter = 'All' | AccountType;

export default function AccountsScreen() {
  const { accounts, lastCallFor } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        (filter === 'All' || a.type === filter) &&
        (!q || [a.name, a.specialty, a.city, a.affiliation ?? ''].some((v) => v.toLowerCase().includes(q))),
    );
  }, [accounts, query, filter]);

  return (
    <View style={styles.root}>
      <View style={styles.inner}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, specialty, city"
          placeholderTextColor={colors.muted}
          style={styles.search}
          autoCorrect={false}
        />
        <View style={styles.filters}>
          {(['All', 'HCP', 'HCO'] as Filter[]).map((f) => (
            <Chip key={f} label={f === 'HCP' ? 'People (HCP)' : f === 'HCO' ? 'Organizations (HCO)' : 'All'} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
        <FlatList
          data={visible}
          keyExtractor={(a) => a.id}
          ListEmptyComponent={<Empty>No accounts match.</Empty>}
          ListFooterComponent={
            <View style={{ marginTop: space.md, marginBottom: space.xl }}>
              <Button title="Add account" variant="secondary" onPress={() => router.push('/account/new')} />
            </View>
          }
          renderItem={({ item: a }) => {
            const last = lastCallFor(a.id);
            return (
              <Card onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}>
                <View style={styles.row}>
                  <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <TierBadge tier={a.tier} />
                </View>
                <Text style={text.muted}>
                  {a.type} · {a.specialty}
                  {a.affiliation ? ` · ${a.affiliation}` : ''}
                </Text>
                <Text style={[text.muted, { marginTop: 2 }]}>
                  {a.city} · {last ? `Last call ${formatDate(last.datetime)}` : 'No submitted calls'}
                </Text>
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
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginBottom: space.sm,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
});
