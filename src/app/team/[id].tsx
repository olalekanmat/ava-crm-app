import { Stack, useLocalSearchParams } from 'expo-router';
import { useStore } from '@/data/store';
import { RegionDashboard } from '@/screens/RegionDashboard';
import { RepDetail } from '@/screens/RepDetail';
import { TeamDashboard } from '@/screens/TeamDashboard';
import { Empty } from '@/ui/components';
import { Screen } from '@/ui/Screen';

/** Drill-down from a dashboard: a rep, an FLM's team, or an SLM's region. */
export default function TeamMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getUser } = useStore();
  const user = getUser(id);
  if (!user) {
    return (
      <Screen>
        <Empty>This person is not in your team.</Empty>
      </Screen>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: user.name }} />
      {user.role === 'Rep' ? <RepDetail rep={user} /> : user.role === 'FLM' ? <TeamDashboard manager={user} /> : <RegionDashboard leader={user} />}
    </>
  );
}
