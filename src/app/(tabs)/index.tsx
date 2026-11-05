import { useMe } from '@/data/store';
import { AdminHome } from '@/screens/AdminHome';
import { RegionDashboard } from '@/screens/RegionDashboard';
import { RepHome } from '@/screens/RepHome';
import { TeamDashboard } from '@/screens/TeamDashboard';
import { useDesk } from '@/screens/Workspaces';

/** Home is different for each role; people with a back-office job (2.14) also get their desk. */
export default function HomeScreen() {
  const me = useMe();
  const field = me.role === 'Rep' ? <RepHome /> : me.role === 'FLM' ? <TeamDashboard manager={me} /> : me.role === 'SLM' ? <RegionDashboard leader={me} /> : <AdminHome />;
  return useDesk(field);
}
