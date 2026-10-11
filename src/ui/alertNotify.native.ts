import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AlertItem } from '@/data/alerts';
import { alertRoute } from '@/data/notifyAlerts';

export const ALERT_KIND = 'ava-alert';
const seenKey = (userId: string) => `ava:notified:${userId}`;
/** Ids remembered per person; older ones fall off. */
const KEEP = 400;
let running: Promise<void> = Promise.resolve();

/**
 * Shows a phone notification for each approval or decision that appeared since the last check.
 * The first check on a phone only remembers what is there, so nobody gets a flood of old alerts.
 * `ask` lets the app (not the background task) ask for notification permission once.
 */
export function notifyNewAlerts(userId: string, items: AlertItem[], ask = false): Promise<void> {
  running = running.then(() => run(userId, items, ask)).catch(() => undefined);
  return running;
}

async function run(userId: string, items: AlertItem[], ask: boolean): Promise<void> {
  const raw = await AsyncStorage.getItem(seenKey(userId));
  const seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  const fresh = raw ? items.filter((i) => !seen.has(i.id)) : [];
  for (const i of items) seen.add(i.id);
  await AsyncStorage.setItem(seenKey(userId), JSON.stringify([...seen].slice(-KEEP)));
  if (!fresh.length) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) {
    if (!ask || !perm.canAskAgain) return;
    if (!(await Notifications.requestPermissionsAsync()).granted) return;
  }
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('approvals', { name: 'Approvals and decisions', importance: Notifications.AndroidImportance.HIGH });
  const shown = fresh.length > 3 ? [] : fresh;
  for (const i of shown) {
    await Notifications.scheduleNotificationAsync({ content: { title: 'Ava CRM', body: i.title, data: { kind: ALERT_KIND, route: alertRoute(i) } }, trigger: Platform.OS === 'android' ? { channelId: 'approvals' } : null });
  }
  if (!shown.length) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Ava CRM', body: `${fresh.length} new approvals and updates are waiting for you`, data: { kind: ALERT_KIND, route: '/approvals' } },
      trigger: Platform.OS === 'android' ? { channelId: 'approvals' } : null,
    });
  }
}
