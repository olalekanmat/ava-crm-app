import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { geoStatus } from '@/data/geo';
import { useMe, useStore } from '@/data/store';
import type { CallStatus } from '@/data/types';
import { CallCalendar } from '@/ui/CallCalendar';
import { CallRow } from '@/ui/CallRow';
import { Button, Chip, Empty, Segmented, text } from '@/ui/components';
import { columnsFor, useLayout } from '@/ui/layout';
import { colors, space } from '@/ui/theme';

type Filter = 'All' | CallStatus;

export default function CallsScreen() {
  const me = useMe();
  const { calls, data, getUser, syncNow, sync, admin } = useStore();
  const { maxWide, pad, width } = useLayout();
  const cols = columnsFor(Math.min(width, maxWide) - 2 * pad, 360, 3);
  const refresh = <RefreshControl refreshing={sync.syncing} onRefresh={() => syncNow()} tintColor={colors.primary} />;
  const isRep = me.role === 'Rep';
  // A rep who is also an administrator sees everyone's calls, so show whose they are.
  const showOwners = !isRep || admin;
  const [filter, setFilter] = useState<Filter>(isRep ? 'All' : 'Submitted');
  const [rep, setRep] = useState<string | null>(null);
  const [geoOnly, setGeoOnly] = useState(false);
  const [view, setView] = useState<'Calendar' | 'List'>('Calendar');

  const reps = useMemo(() => [...new Set(calls.map((c) => c.ownerId))].map((id) => getUser(id)).filter((u) => !!u && u.id !== me.id), [calls, getUser, me.id]);
  const visible = calls.filter(
    (c) =>
      (filter === 'All' || c.status === filter) &&
      (!rep || c.ownerId === rep) &&
      (!geoOnly || (c.status === 'Submitted' && ['Off-site', 'Missing'].includes(geoStatus(c, data.settings.geofenceM)))),
  );

  return (
    <View style={styles.root}>
      <View style={[styles.inner, { maxWidth: maxWide, padding: pad }]}>
        {isRep && (
          <View style={{ marginBottom: space.md }}>
            <Button title="Log a call" icon="add-circle-outline" onPress={() => router.push('/call/edit')} />
          </View>
        )}
        <Segmented options={['Calendar', 'List']} value={view} onChange={setView} />
        {view === 'List' && <Segmented options={['All', 'Planned', 'Saved', 'Submitted'] as Filter[]} value={filter} onChange={setFilter} labels={{ Saved: 'Drafts' }} />}
        <View style={styles.filters}>
          {view === 'List' && <Chip label="Check-in issues" icon="location-outline" selected={geoOnly} onPress={() => setGeoOnly(!geoOnly)} />}
          {showOwners && reps.map((u) => <Chip key={u!.id} label={u!.name.split(' ')[0]} selected={rep === u!.id} onPress={() => setRep(rep === u!.id ? null : u!.id)} />)}
        </View>
        {view === 'Calendar' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} refreshControl={refresh}>
            <CallCalendar calls={rep ? calls.filter((c) => c.ownerId === rep) : calls} showRep={showOwners} />
          </ScrollView>
        ) : (
          <FlatList
            key={`cols-${cols}`}
            data={visible}
            keyExtractor={(c) => c.id}
            numColumns={cols}
            columnWrapperStyle={cols > 1 ? { gap: space.sm } : undefined}
            refreshControl={refresh}
            ListHeaderComponent={<Text style={[text.small, { marginBottom: space.sm }]}>{visible.length} calls</Text>}
            renderItem={({ item }) => (
              <View style={{ flex: 1, maxWidth: `${100 / cols}%` }}>
                <CallRow call={item} showRep={showOwners} />
              </View>
            )}
            ListEmptyComponent={<Empty icon="chatbubbles-outline">No calls here.</Empty>}
            contentContainerStyle={{ paddingBottom: space.xl }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingBottom: 0, width: '100%', alignSelf: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap' },
});
