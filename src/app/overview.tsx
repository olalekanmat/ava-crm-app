import { useMe } from '@/data/store';
import { RegionDashboard } from '@/screens/RegionDashboard';

export default function OverviewScreen() {
  return <RegionDashboard leader={useMe()} />;
}
