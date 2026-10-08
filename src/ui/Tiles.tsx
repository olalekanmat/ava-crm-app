import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { text, type IconName } from './components';
import { colors, radius, shadow, space } from './theme';

/**
 * Home dashboard tile: a title row (icon, title, optional alert mark and chevron to the detail)
 * above its content. Tiles sit in a Grid, so they line up in 1–3 columns by screen width.
 */
export function Tile({
  title,
  icon,
  onPress,
  alert,
  action,
  children,
  minHeight = 150,
}: {
  title: string;
  icon?: IconName;
  onPress?: () => void;
  /** Shows a red alert mark beside the chevron. */
  alert?: boolean;
  /** Right side of the title row instead of the chevron, e.g. a Sync link. */
  action?: ReactNode;
  children: ReactNode;
  minHeight?: number;
}) {
  const head = (
    <View style={styles.head}>
      {icon && (
        <View style={styles.headIcon}>
          <Ionicons name={icon} size={15} color={colors.primary} />
        </View>
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {alert && <Ionicons name="alert-circle-outline" size={18} color={colors.danger} accessibilityLabel="Needs attention" />}
      {action ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.primary} /> : null)}
    </View>
  );
  const body = <View style={styles.body}>{children}</View>;
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.tile, { minHeight }, pressed && styles.pressed]}>
        {head}
        {body}
      </Pressable>
    );
  }
  return (
    <View style={[styles.tile, { minHeight }]}>
      {head}
      {body}
    </View>
  );
}

/** Big coloured numbers with small labels, split by thin dividers (e.g. 2 Urgent | 5 Important | 12 Normal). */
export function StatSplit({ items, small }: { items: { value: string | number; label: string; color: string; onPress?: () => void }[]; small?: boolean }) {
  return (
    <View style={styles.split}>
      {items.map((x, i) => (
        <Pressable key={x.label} disabled={!x.onPress} onPress={x.onPress} style={[styles.splitItem, i > 0 && styles.splitDivider]} accessibilityLabel={`${x.value} ${x.label}`}>
          <Text style={[styles.big, small && styles.bigSmall, { color: x.color }]} numberOfLines={1} adjustsFontSizeToFit>
            {x.value}
          </Text>
          <Text style={[styles.bigLabel, { color: x.color }]} numberOfLines={1}>
            {x.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Progress ring drawn with plain views (no SVG): two clipped half-rings rotated into place.
 * `value` is 0..1; `children` sit in the middle.
 */
export function Ring({ value, size = 96, stroke = 10, color = colors.primary, track = colors.sunken, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const deg = Math.max(0, Math.min(1, value)) * 360;
  const right = Math.min(deg, 180);
  const left = Math.max(0, deg - 180);
  const ring = { position: 'absolute' as const, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: stroke };
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[ring, { left: 0, borderColor: track }]} />
      {right > 0 && (
        <View style={{ position: 'absolute', left: size / 2, top: 0, width: size / 2, height: size, overflow: 'hidden' }}>
          <View style={[ring, { left: -size / 2, borderColor: 'transparent', borderTopColor: color, borderRightColor: color, transform: [{ rotate: `${45 + right - 180}deg` }] }]} />
        </View>
      )}
      {left > 0 && (
        <View style={{ position: 'absolute', left: 0, top: 0, width: size / 2, height: size, overflow: 'hidden' }}>
          <View style={[ring, { left: 0, borderColor: 'transparent', borderBottomColor: color, borderLeftColor: color, transform: [{ rotate: `${45 + left - 180}deg` }] }]} />
        </View>
      )}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

/** Small coloured dot + label + value, for ring legends. */
export function LegendRow({ color, label, value }: { color: string; label: string; value: string | number }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[text.muted, { flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[text.title, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, marginBottom: space.md, overflow: 'hidden', ...shadow },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  headIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { flex: 1, padding: space.lg, justifyContent: 'center' },
  split: { flexDirection: 'row', alignItems: 'stretch' },
  splitItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs, paddingHorizontal: space.xs },
  splitDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  big: { fontSize: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  bigSmall: { fontSize: 18, letterSpacing: -0.3 },
  bigLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 3 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
