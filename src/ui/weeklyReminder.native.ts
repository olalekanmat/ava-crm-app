import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const weeklyReminderSupported = true;
const KIND = 'ava-weekly';
/** Expo's weekly trigger counts weekdays from 1 = Sunday, so Monday is 2. */
const MONDAY = 2;

/**
 * Schedules (or, with `enabled` false, cancels) a notification every Monday at 08:00 saying the
 * weekly team summary is ready. Calling it again does not add a second one. Returns true when
 * the reminder is scheduled.
 */
export async function scheduleWeeklySummary(enabled: boolean): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((n) => n.content.data?.kind === KIND);
  if (!enabled) {
    for (const n of ours) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    return false;
  }
  if (ours.length === 1) return true;
  for (const n of ours) await Notifications.cancelScheduledNotificationAsync(n.identifier);

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) {
    if (!perm.canAskAgain) return false;
    if (!(await Notifications.requestPermissionsAsync()).granted) return false;
  }
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('weekly', { name: 'Weekly summary', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Weekly summary', body: 'Your weekly team summary is ready', data: { kind: KIND } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: MONDAY, hour: 8, minute: 0, channelId: 'weekly' },
  });
  return true;
}
