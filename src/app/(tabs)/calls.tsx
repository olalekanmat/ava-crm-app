import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useStore } from '@/data/store';
import type { CallStatus } from '@/data/types';
import { CallRow } from '@/ui/CallRow';
import { Button, Chip, Empty } from '@/ui/components';
import { colors, space } from '@/ui/theme';

type Filter = 'All' | CallStatus;

export default function CallsScreen() {
  const { calls } = useStore();
  const [filter, setFilter] = useState<Filter>('All');
  const visible = filter === 'All' ? calls : calls.filter((c) => c.status === filter);

  return (
    <View style={styles.root}>
      <View style={styles.inner}>
        <View style={{ marginBottom: space.md }}>
          <Button title="Log a call" onPress={() => router.push('/call/edit')} />
        </View>
        <View style={styles.filters}>
          {(['All', 'Planned', 'Saved', 'Submitted'] as Filter[]).map((f) => (
            <Chip key={f} label={f === 'Saved' ? 'Drafts' : f} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
        <FlatList
          data={visible}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <CallRow call={item} />}
          ListEmptyComponent={<Empty>No calls here yet.</Empty>}
          contentContainerStyle={{ paddingBottom: space.xl }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, padding: space.lg, paddingBottom: 0, width: '100%', maxWidth: 760, alignSelf: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap' },
});
