import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import type { GeoStatus } from '@/data/geo';
import { useStore } from '@/data/store';
import { tierRankIn } from '@/data/tiers';
import type { CallStatus, PlanStatus, Tier, User } from '@/data/types';
import { avatarColor, colors, radius, shadow, space, touch } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
}) {
  const bg = { primary: colors.primary, secondary: colors.primarySoft, ghost: 'transparent', danger: colors.card }[variant];
  const fg = { primary: '#fff', secondary: colors.primary, ghost: colors.primary, danger: colors.danger }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'danger' && { borderWidth: 1, borderColor: colors.danger },
      ]}
    >
      {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
      <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      {icon && <Ionicons name={icon} size={14} color={selected ? '#fff' : colors.muted} />}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** Pill-shaped single choice control. */
export function Segmented<T extends string>({ options, value, onChange, labels }: { options: T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: o === value }} onPress={() => onChange(o)} style={[styles.segment, o === value && styles.segmentOn]}>
          <Text style={[styles.segmentText, o === value && styles.segmentTextOn]} numberOfLines={1}>
            {labels?.[o] ?? o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        accessibilityLabel={label.replace(/\s*\*$/, '')}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, !!error && { borderColor: colors.danger }, props.style]}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && !!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function SearchBox(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.faint} />
      <TextInput placeholderTextColor={colors.faint} autoCorrect={false} {...props} style={styles.searchInput} />
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Badge({ label, fg, bg, icon }: { label: string; fg: string; bg: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={fg} />}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: CallStatus }) {
  const map = {
    Planned: { bg: colors.primarySoft, fg: colors.primary, label: 'Planned' },
    Saved: { bg: colors.warnSoft, fg: colors.warn, label: 'Draft' },
    Submitted: { bg: colors.successSoft, fg: colors.success, label: 'Submitted' },
  }[status];
  return <Badge label={map.label} fg={map.fg} bg={map.bg} />;
}

export function PlanBadge({ status }: { status: PlanStatus | 'None' }) {
  const map = {
    None: { bg: colors.bg, fg: colors.muted, label: 'No plan' },
    Draft: { bg: colors.bg, fg: colors.muted, label: 'Draft' },
    Submitted: { bg: colors.warnSoft, fg: colors.warn, label: 'Awaiting approval' },
    Approved: { bg: colors.successSoft, fg: colors.success, label: 'Approved' },
    Rejected: { bg: colors.dangerSoft, fg: colors.danger, label: 'Changes requested' },
  }[status];
  return <Badge label={map.label} fg={map.fg} bg={map.bg} />;
}

export function GeoBadge({ status }: { status: GeoStatus }) {
  if (status === 'Remote') return null;
  const map = {
    Verified: { bg: colors.successSoft, fg: colors.success, icon: 'location' as IconName },
    'Off-site': { bg: colors.dangerSoft, fg: colors.danger, icon: 'warning' as IconName },
    Unverified: { bg: colors.warnSoft, fg: colors.warn, icon: 'location-outline' as IconName },
    Missing: { bg: colors.bg, fg: colors.muted, icon: 'location-outline' as IconName },
  }[status];
  return <Badge label={status === 'Missing' ? 'No check-in' : status} fg={map.fg} bg={map.bg} icon={map.icon} />;
}

const TIER_COLORS = [
  { fg: colors.crimson, bg: '#FCE8EF' },
  { fg: colors.orange, bg: '#FEEFE4' },
  { fg: colors.primary, bg: colors.primarySoft },
  { fg: '#4F7A12', bg: '#EEF6E2' },
  { fg: colors.muted, bg: colors.bg },
];

/** Colour for a tier by its position in the team's scheme (0 = top tier). */
export function tierColor(rank: number) {
  return TIER_COLORS[Math.min(Math.max(rank, 0), TIER_COLORS.length - 1)];
}

/** `rank` is the tier's position in its scheme; without it the colour follows the default ST/T1/T2/T3 order. */
export function TierBadge({ tier, rank }: { tier: Tier; rank?: number }) {
  const { data } = useStore();
  const r = rank ?? tierRankIn(data.settings, tier);
  const c = tierColor(r);
  return <Badge label={tier} fg={c.fg} bg={c.bg} />;
}

export function Avatar({ name, size = 40, photo }: { name: string; size?: number; photo?: string }) {
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.border }} contentFit="cover" accessibilityLabel={name} />;
  }
  const initials = name
    .replace(/^Dr\.\s*/, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/** A person's profile picture, or their initials when they have none. */
export function UserAvatar({ user, size = 40 }: { user: Pick<User, 'name' | 'photo'>; size?: number }) {
  return <Avatar name={user.name} photo={user.photo} size={size} />;
}

/** Horizontal bar; `marker` shows where the value should be by now (cycle pace). */
export function ProgressBar({ value, color = colors.primary, marker, height = 8, track = colors.border }: { value: number; color?: string; marker?: number; height?: number; track?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'visible', justifyContent: 'center' }}>
      <View style={{ width: `${v * 100}%`, height, borderRadius: height, backgroundColor: color }} />
      {marker !== undefined && <View style={[styles.marker, { left: `${Math.min(1, marker) * 100}%`, height: height + 8 }]} />}
    </View>
  );
}

export function Kpi({ label, value, sub, tone, icon, onPress }: { label: string; value: string | number; sub?: string; tone?: string; icon?: IconName; onPress?: () => void }) {
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Ionicons name={icon} size={15} color={tone ?? colors.muted} />}
        <Text style={styles.kpiLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.kpiValue, tone ? { color: tone } : null]}>{value}</Text>
      {!!sub && (
        <Text style={styles.kpiSub} numberOfLines={2}>
          {sub}
        </Text>
      )}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.kpi, pressed && styles.pressed]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.kpi}>{body}</View>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <View style={styles.kpiRow}>{children}</View>;
}

/** A tappable row with an icon, title, subtitle and chevron. */
export function ListRow({ icon, title, subtitle, onPress, right, tone = colors.primary }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; tone?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
      {icon && (
        <View style={[styles.listIcon, { backgroundColor: `${tone}18` }]}>
          <Ionicons name={icon} size={18} color={tone} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={text.title}>{title}</Text>
        {!!subtitle && <Text style={text.muted}>{subtitle}</Text>}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
    </Pressable>
  );
}

export function Banner({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' | 'success'; icon?: IconName }) {
  const map = {
    info: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'information-circle' as IconName },
    warn: { bg: colors.warnSoft, fg: colors.warn, icon: 'alert-circle' as IconName },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' as IconName },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' as IconName },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]}>
      <Ionicons name={icon ?? map.icon} size={18} color={map.fg} />
      <Text style={[text.body, { color: map.fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Stepper({ value, onChange, min = 1, max = 50 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityLabel="Fewer" onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepBtn} disabled={value <= min}>
        <Ionicons name="remove" size={16} color={value <= min ? colors.faint : colors.primary} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable accessibilityLabel="More" onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepBtn} disabled={value >= max}>
        <Ionicons name="add" size={16} color={value >= max ? colors.faint : colors.primary} />
      </Pressable>
    </View>
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={[styles.listRow, { paddingHorizontal: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={text.title}>{label}</Text>
        {!!hint && <Text style={text.muted}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
}

/** Friendly empty state: an icon in a soft circle, an optional title, a line of help and an optional action. */
export function Empty({ children, icon = 'file-tray-outline', title, action }: { children: ReactNode; icon?: IconName; title?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      {!!title && <Text style={[text.title, { textAlign: 'center' }]}>{title}</Text>}
      <Text style={styles.emptyText}>{children}</Text>
      {action}
    </View>
  );
}

/** Round icon-only button for quick actions (44 pt touch target). */
export function IconButton({ icon, label, onPress, color = colors.primary, bg = colors.primarySoft, size = 40 }: { icon: IconName; label: string; onPress: () => void; color?: string; bg?: string; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={Math.max(0, (touch - size) / 2)}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={color} />
    </Pressable>
  );
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export const text = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  small: { fontSize: 12, color: colors.faint },
  link: { fontSize: 14, color: colors.primary, fontWeight: '600' },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow,
  },
  pressed: { opacity: 0.8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md },
  section: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  button: { minHeight: touch, paddingVertical: 11, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexDirection: 'row', gap: 8 },
  buttonSmall: { minHeight: 34, paddingVertical: 7, paddingHorizontal: space.md, flexGrow: 0 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  segmented: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: radius.md, padding: 3, marginBottom: space.md },
  segment: { flex: 1, minHeight: 36, justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.card, ...shadow },
  segmentText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  segmentTextOn: { color: colors.primary },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
    minHeight: 46,
    ...shadow,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text, outlineStyle: 'none' } as never,
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  hint: { color: colors.faint, fontSize: 12, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  marker: { position: 'absolute', width: 2, marginLeft: -1, backgroundColor: colors.text, borderRadius: 1, opacity: 0.55 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.md,
    ...shadow,
  },
  kpiLabel: { fontSize: 12, color: colors.muted, fontWeight: '600', flexShrink: 1 },
  kpiValue: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.5 },
  kpiSub: { fontSize: 12, color: colors.faint, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.md, paddingHorizontal: space.lg },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, marginBottom: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.card },
  stepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  stepValue: { minWidth: 22, textAlign: 'center', fontWeight: '700', color: colors.text },
  empty: { alignItems: 'center', paddingVertical: space.xl, paddingHorizontal: space.lg, gap: space.sm },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emptyText: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 20, maxWidth: 420 },
});
