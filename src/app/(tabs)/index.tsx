import { useMe } from '@/data/store';
import { AdminHome } from '@/screens/AdminHome';
import { RegionDashboard } from '@/screens/RegionDashboard';
import { RepHome } from '@/screens/RepHome';
import { TeamDashboard } from '@/screens/TeamDashboard';

/** Home is different for each role. */
export default function HomeScreen() {
  const me = useMe();
  if (me.role === 'Rep') return <RepHome />;
  if (me.role === 'FLM') return <TeamDashboard manager={me} />;
  if (me.role === 'SLM') return <RegionDashboard leader={me} />;
  return <AdminHome />;
}
