import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { geoStatus } from '@/data/geo';
import { useMe, useStore } from '@/data/store';
import type { CallStatus } from '@/data/types';
import { CallCalendar } from '@/ui/CallCalendar';
import { CallRow } from '@/ui/CallRow';
import { AgendaView, WeekView } from '@/ui/Schedule';
import { Button, Chip, Empty, Segmented, text } from '@/ui/components';
import { columnsFor, useLayout } from '@/ui/layout';
import { colors, space } from '@/ui/theme';

type Filter = 'All' | CallStatus;
type Mode = 'Agenda' | 'Week' | 'Month' | 'List';

export default function CallsScreen() {
  const me = useMe();
  const { calls, data, getUser, syncNow, sync, admin } = useStore();
  const { maxWide, pad, width, landscape } = useLayout();
  const cols = columnsFor(Math.min(width, maxWide) - 2 * pad, 360, 3);
  const refresh = <RefreshControl refreshing={sync.syncing} onRefresh={() => syncNow()} tintColor={colors.primary} />;
  const isRep = me.role === 'Rep';
  // A rep who is also an administrator sees everyone's calls, so show whose they are.
  const showOwners = !isRep || admin;
  const [filter, setFilter] = useState<Filter>(isRep ? 'All' : 'Submitted');
  const [rep, setRep] = useState<string | null>(null);
  const [geoOnly, setGeoOnly] = useState(false);
  // Week on wide screens, the agenda on a phone held upright.
  const [view, setView] = useState<Mode>(width >= 700 ? 'Week' : 'Agenda');
  const scoped = rep ? calls.filter((c) => c.ownerId === rep) : calls;
  // Tablets and computers in landscape show the accounts beside the week, to plan a visit.
  const panel = isRep && landscape && width >= 1000;

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
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Segmented options={['Agenda', 'Week', 'Month', 'List'] as Mode[]} value={view} onChange={setView} />
          </View>
          {isRep && (
            <View style={styles.logBtn}>
              <Button small title={width >= 500 ? 'Log a call' : 'Log'} icon="add-circle-outline" onPress={() => router.push('/call/edit')} />
            </View>
          )}
        </View>
        {view === 'List' && <Segmented options={['All', 'Planned', 'Saved', 'Submitted'] as Filter[]} value={filter} onChange={setFilter} labels={{ Saved: 'Drafts' }} />}
        <View style={styles.filters}>
          {view === 'List' && <Chip label="Check-in issues" icon="location-outline" selected={geoOnly} onPress={() => setGeoOnly(!geoOnly)} />}
          {showOwners && reps.map((u) => <Chip key={u!.id} label={u!.name.split(' ')[0]} selected={rep === u!.id} onPress={() => setRep(rep === u!.id ? null : u!.id)} />)}
        </View>
        {view === 'Week' ? (
          <View style={{ flex: 1, paddingBottom: pad }}>
            <WeekView calls={scoped} showRep={showOwners} panel={panel} />
          </View>
        ) : view === 'Agenda' ? (
          <AgendaView calls={scoped} showRep={showOwners} />
        ) : view === 'Month' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} refreshControl={refresh}>
            <CallCalendar calls={scoped} showRep={showOwners} />
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
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  logBtn: { marginBottom: space.md, height: 42, justifyContent: 'center' },
});
