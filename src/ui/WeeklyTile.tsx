import { router } from 'expo-router';
import { useMemo } from 'react';
import { Text } from 'react-native';
import { isAdmin } from '@/data/access';
import { weeklyDigest } from '@/data/digest';
import { useStore } from '@/data/store';
import type { User } from '@/data/types';
import { text } from './components';
import { StatSplit, Tile } from './Tiles';
import { space, tone } from './theme';

/** The person whose team the weekly summary covers (an administrator who is a rep sees every rep); null for reps. */
export function digestManager(me: User): User | null {
  if (me.role !== 'Rep') return me;
  return isAdmin(me) ? { ...me, role: 'Admin' } : null;
}

/** Home tile for managers: how many reps need a word this week. Opens the weekly summary. */
export function WeeklyTile() {
  const { me, data, cycle } = useStore();
  const manager = me ? digestManager(me) : null;
  const digest = useMemo(() => (manager ? weeklyDigest(data, manager, cycle, new Date()) : null), [data, manager?.id, manager?.role, cycle]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!digest) return null;
  const { totals, reps } = digest;
  return (
    <Tile title="Weekly summary" icon="newspaper-outline" onPress={() => router.push('/weekly')} alert={totals.atRisk > 0}>
      <StatSplit
        items={[
          { value: `${totals.atRisk}/${reps.length}`, label: 'Need a word', color: totals.atRisk ? tone.important : tone.good },
          { value: totals.calls, label: 'Calls this week', color: tone.normal },
        ]}
      />
      <Text style={[text.muted, { textAlign: 'center', marginTop: space.sm }]}>
        {!reps.length
          ? 'No reps in your team yet'
          : totals.atRisk
            ? `${totals.atRisk} of ${reps.length} rep${reps.length === 1 ? '' : 's'} need${totals.atRisk === 1 ? 's' : ''} a word`
            : 'Nothing flagged this week'}
        {reps.length ? ` · ${totals.callsBefore} calls the week before` : ''}
      </Text>
    </Tile>
  );
}
