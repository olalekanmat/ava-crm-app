import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { notify } from '@/ui/confirm';
import { colors, radius, space } from '@/ui/theme';
import { useDictation } from './useDictation';

/**
 * Tap to dictate, tap again to stop. Each finished phrase goes to `onText`. On a device without
 * speech recognition it explains how to use the keyboard's microphone instead; it never fails silently.
 */
export function MicButton({ onText, label, size = 40, showInterim = true }: { onText: (text: string) => void; label?: string; size?: number; showInterim?: boolean }) {
  const d = useDictation(onText, (message) => notify('Voice input', message));

  const on = d.listening;
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={on ? 'Stop dictation' : label ?? 'Dictate'}
        accessibilityState={{ busy: on }}
        onPress={d.toggle}
        hitSlop={6}
        style={({ pressed }) => [
          styles.btn,
          label ? styles.withLabel : { width: size, height: size },
          { backgroundColor: on ? colors.danger : colors.primarySoft, opacity: pressed ? 0.8 : 1 },
          !d.supported && { opacity: 0.6 },
        ]}
      >
        <Ionicons name={on ? 'stop' : 'mic'} size={Math.round(size * 0.48)} color={on ? '#fff' : colors.primary} />
        {!!label && <Text style={[styles.label, { color: on ? '#fff' : colors.primary }]}>{on ? 'Listening… tap to stop' : label}</Text>}
      </Pressable>
      {showInterim && on && !!d.interim && (
        <Text style={styles.interim} numberOfLines={2}>
          {d.interim}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1 },
  btn: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  withLabel: { paddingHorizontal: space.md, paddingVertical: 8 },
  label: { fontWeight: '600', fontSize: 13 },
  interim: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginTop: 4 },
});
