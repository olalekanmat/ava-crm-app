import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from './components';

/** Keeps `on` true for at least `ms` once it turns on, so a quick sync is still seen. */
export function useAtLeast(on: boolean, ms = 900): boolean {
  const [shown, setShown] = useState(on);
  const since = useRef(0);
  useEffect(() => {
    if (on) {
      since.current = Date.now();
      const t = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown(false), Math.max(0, ms - (Date.now() - since.current)));
    return () => clearTimeout(t);
  }, [on, ms]);
  return on || shown;
}

/** The sync arrows, turning round while a sync is in progress. */
export function SyncIcon({ spinning, name = 'sync-outline', size = 20, color, style }: { spinning: boolean; name?: IconName; size?: number; color: string; style?: StyleProp<ViewStyle> }) {
  const [turn] = useState(() => new Animated.Value(0));
  const busy = useAtLeast(spinning);
  useEffect(() => {
    if (!busy) return;
    turn.setValue(0);
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [busy, turn]);
  // Ionicons' sync arrows turn clockwise; rotating that way reads as "in progress".
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[style, busy && { transform: [{ rotate }] }]} accessibilityLabel={busy ? 'Syncing' : undefined}>
      <Ionicons name={busy ? 'sync-outline' : name} size={size} color={color} />
    </Animated.View>
  );
}
