import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { shouldAskForReview, type ReviewState } from '@/data/reviewPrompt';

const KEY = 'ava:review:v1';

/** Counts a good moment and, when it is time, shows the store's rating sheet a moment later. Pass skip in the demo or when signed in as someone. */
export function recordWin(skip = false): void {
  if (skip) return;
  void (async () => {
    const saved = await AsyncStorage.getItem(KEY).catch(() => null);
    const s: ReviewState = saved ? { wins: 0, ...JSON.parse(saved) } : { wins: 0 };
    s.wins += 1;
    const now = new Date();
    const ask = shouldAskForReview(s, now) && (await StoreReview.hasAction().catch(() => false));
    if (ask) s.askedAt = now.toISOString();
    await AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
    if (ask) setTimeout(() => StoreReview.requestReview().catch(() => {}), 1500);
  })().catch(() => {});
}
