import { View } from 'react-native';
import { activeTrial } from '@/cloud/license';
import { useStore } from '@/data/store';
import { Badge } from '@/ui/components';
import { colors, space } from '@/ui/theme';

/**
 * "Free trial" on everyone's profile while the company is on a free trial. It goes away by itself
 * once the company subscribes, because the renewed licence no longer says trial.
 */
export function TrialBadge({ days = false }: { days?: boolean }) {
  const { license } = useStore();
  if (!activeTrial(license) || license.state !== 'active') return null;
  const left = license.daysLeft;
  return (
    <View style={{ flexDirection: 'row', marginTop: space.xs }}>
      <Badge icon="hourglass-outline" label={days ? `Free trial · ${left} day${left === 1 ? '' : 's'} left` : 'Free trial'} fg={colors.warn} bg={colors.warnSoft} />
    </View>
  );
}
