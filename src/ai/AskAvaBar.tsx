import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, space } from '@/ui/theme';

/**
 * PLACEHOLDER so the home screens compile on their own branch. The AI work replaces this file with
 * the real assistant bar; keep the export name and the zero-prop signature.
 */
export function AskAvaBar() {
  const [q, setQ] = useState('');
  const go = () => router.push({ pathname: '/ai/ask', params: { q: q.trim() } });
  return (
    <View style={styles.bar}>
      <Ionicons name="sparkles" size={18} color={colors.primary} />
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={go}
        returnKeyType="go"
        placeholder="How can I help?"
        placeholderTextColor={colors.faint}
        accessibilityLabel="Ask Ava"
        style={styles.input}
      />
      <Pressable onPress={go} accessibilityRole="button" accessibilityLabel="Ask" style={styles.go}>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#fff', borderRadius: radius.pill, paddingLeft: space.lg, paddingRight: 5, minHeight: 50 },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12, outlineStyle: 'none' } as never,
  go: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
