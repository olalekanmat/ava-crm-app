import { useLocalSearchParams } from 'expo-router';
import { useStore } from '@/data/store';
import { PlanView } from '@/screens/PlanView';
import { Empty } from '@/ui/components';
import { Screen } from '@/ui/Screen';

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStore();
  const plan = data.plans.find((p) => p.id === id);
  const cycle = data.cycles.find((c) => c.id === plan?.cycleId);
  return (
    <Screen>
      {plan && cycle ? <PlanView ownerId={plan.ownerId} cycle={cycle} /> : <Empty>Plan not found.</Empty>}
    </Screen>
  );
}
