import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMe } from '@/data/store';
import { Button, text } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
interface Step {
  icon: IconName;
  title: string;
  body: string;
  /** Who sees this step; all roles when absent. */
  for?: 'rep' | 'manager' | 'admin';
}

const STEPS: Step[] = [
  { icon: 'home-outline', title: 'Your day at a glance', body: 'Home shows today’s visits, alerts and how your cycle plan is going. Visit next suggests who to see and why: an objective to pick up, a follow-up, an event invite or a doctor at a hospital you are already visiting.' },
  { icon: 'chatbubbles-outline', title: 'Log a call in a minute', body: 'Pick the account, set your objectives, dictate notes (even offline) and let Ava tidy them. Present product slides full screen; Ava times each slide and asks how the doctor responded.', for: 'rep' },
  { icon: 'medkit-outline', title: 'Samples with a signature', body: 'Choose the batch, and the doctor signs on your screen. Expired batches are blocked, and once a month you count your stock so the records match.', for: 'rep' },
  { icon: 'calendar-outline', title: 'Plan your cycle', body: 'Build the cycle plan by tier, plan visits by voice, and see them in your Outlook or Google calendar (More › Display & calendar).' },
  { icon: 'business-outline', title: 'Clean account data', body: 'Link doctors to every hospital they work at. Spot a wrong phone or address? Suggest a correction and your manager approves it. Ava warns before anyone adds a duplicate.' },
  { icon: 'people-circle-outline', title: 'Events and CMEs', body: 'Invite doctors, track who confirmed and attended, keep the budget, and Visit next reminds you to follow up while it is fresh.' },
  { icon: 'checkmark-done-outline', title: 'Approvals in one place', body: 'Plans, leave, account corrections and new accounts wait for you under Approvals, with a phone notification when something arrives.', for: 'manager' },
  { icon: 'newspaper-outline', title: 'The weekly summary', body: 'Every Monday: calls against last week, plan pace, objectives met and coaching, rep by rep, with AI tips on who needs a word.', for: 'manager' },
  { icon: 'options-outline', title: 'Set the rules', body: 'Products and their presentations, call objectives, sample signatures, account review, duplicates, and live tables that Excel and Power BI refresh from your drive.', for: 'admin' },
  { icon: 'sparkles-outline', title: 'Ask Ava', body: 'Ask about your territory in plain words, get a brief before each visit, and talking points for the doctor you are about to see.' },
];

/** A short guided tour of what Ava does, tailored to the person's role. */
export default function TourScreen() {
  const me = useMe();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const role = me.role === 'Rep' ? 'rep' : me.role === 'Admin' ? 'admin' : 'manager';
  const steps = STEPS.filter((s) => !s.for || s.for === role || (role === 'admin' && s.for === 'manager'));
  const last = index === steps.length - 1;
  const pageWidth = Math.min(width, 640);

  const go = (i: number) => {
    setIndex(i);
    scroll.current?.scrollTo({ x: i * pageWidth, animated: true });
  };
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.top, { width: pageWidth }]}>
        <Text style={text.small}>
          {index + 1} of {steps.length}
        </Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={text.link}>Skip</Text>
        </Pressable>
      </View>
      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd} style={{ flexGrow: 0, width: pageWidth }}>
        {steps.map((s) => (
          <View key={s.title} style={[styles.page, { width: pageWidth }]}>
            <View style={styles.icon}>
              <Ionicons name={s.icon} size={44} color={colors.primary} />
            </View>
            <Text style={[text.h1, { textAlign: 'center' }]}>{s.title}</Text>
            <Text style={[text.body, styles.body]}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {steps.map((s, i) => (
          <Pressable key={s.title} onPress={() => go(i)} accessibilityLabel={`Step ${i + 1}`} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
      <View style={[styles.actions, { width: pageWidth }]}>
        {index > 0 ? <Button variant="ghost" title="Back" onPress={() => go(index - 1)} /> : <View />}
        <Button title={last ? 'Start using Ava' : 'Next'} icon={last ? 'checkmark' : 'arrow-forward'} onPress={() => (last ? close() : go(index + 1))} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  page: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, gap: space.lg, paddingVertical: space.xl },
  icon: { width: 96, height: 96, borderRadius: radius.lg * 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  body: { textAlign: 'center', color: colors.muted, maxWidth: 460, lineHeight: 22 },
  dots: { flexDirection: 'row', gap: 6, marginVertical: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.primary },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.lg },
});
