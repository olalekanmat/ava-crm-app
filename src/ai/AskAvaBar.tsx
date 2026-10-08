import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '@/data/store';
import { colors, radius, space } from '@/ui/theme';
import { useAiAvailable } from './client';
import { MicButton } from './MicButton';
import { appendText } from './useDictation';

const REP_IDEAS = ['Who should I see this week?', 'Which accounts am I behind on?', 'What follow-ups are due?'];
const MANAGER_IDEAS = ['Which reps are behind plan?', 'Whose plans need my approval?', 'Which top-tier accounts were not seen lately?'];

/** "How can I help?" box inside the blue home header. Opens Ask Ava with the question. */
export function AskAvaBar() {
  const { me } = useStore();
  const ai = useAiAvailable();
  const [q, setQ] = useState('');
  if (!ai || !me) return null;

  const ask = (question = q) => {
    const text = question.trim();
    if (!text) return;
    setQ('');
    router.push({ pathname: '/ai/ask', params: { q: text } });
  };
  const ideas = me.role === 'Rep' ? REP_IDEAS : MANAGER_IDEAS;

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Ionicons name="sparkles" size={20} color={colors.primary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="How can I help?"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Ask Ava"
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={() => ask()}
        />
        <MicButton size={36} showInterim={false} onText={(t) => setQ((x) => appendText(x, t))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Ask" onPress={() => ask()} disabled={!q.trim()} style={[styles.send, !q.trim() && { opacity: 0.4 }]}>
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ideas} keyboardShouldPersistTaps="handled">
        <Pressable style={[styles.idea, styles.ideaStrong]} onPress={() => router.push('/ai/schedule')} accessibilityRole="button">
          <Ionicons name="mic-outline" size={14} color={colors.primary} />
          <Text style={[styles.ideaText, { color: colors.primary }]}>Plan visits by voice</Text>
        </Pressable>
        {ideas.map((x) => (
          <Pressable key={x} style={styles.idea} onPress={() => ask(x)} accessibilityRole="button">
            <Text style={styles.ideaText}>{x}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#fff', borderRadius: radius.pill, paddingLeft: space.lg, paddingRight: 6, paddingVertical: 6, minHeight: 50 },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 8, minWidth: 0, outlineStyle: 'none' } as never,
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ideas: { gap: space.sm, paddingTop: space.sm },
  idea: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  ideaStrong: { backgroundColor: '#fff', borderColor: '#fff' },
  ideaText: { fontSize: 13, color: '#fff', fontWeight: '500' },
});
