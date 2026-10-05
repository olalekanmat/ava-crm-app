import { isAdmin } from '@/data/access';
import { useMe } from '@/data/store';
import { RegionDashboard } from '@/screens/RegionDashboard';

/** Administrators (also managers who are administrators) see the whole organisation; an SLM sees their region. */
export default function OverviewScreen() {
  const me = useMe();
  return <RegionDashboard leader={isAdmin(me) ? { ...me, role: 'Admin' } : me} />;
}
