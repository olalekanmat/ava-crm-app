import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import type { CallStatus, Tier } from '@/data/types';
import { colors, space } from './theme';

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
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
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.card : colors.primarySoft;
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'danger' && { borderWidth: 1, borderColor: colors.danger },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, !!error && { borderColor: colors.danger }]}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function StatusBadge({ status }: { status: CallStatus }) {
  const map = {
    Planned: { bg: colors.primarySoft, fg: colors.primary },
    Saved: { bg: colors.warnSoft, fg: colors.warn },
    Submitted: { bg: colors.successSoft, fg: colors.success },
  }[status];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{status}</Text>
    </View>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>Tier {tier}</Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

export const text = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  muted: { fontSize: 13, color: colors.muted },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: space.lg,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  button: { paddingVertical: 12, paddingHorizontal: space.lg, borderRadius: 10, alignItems: 'center', flexGrow: 1 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: space.xl },
});
