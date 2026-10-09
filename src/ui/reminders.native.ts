import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Task } from '@/data/types';

export const remindersSupported = true;
const KIND = 'ava-task';
/** Android and iOS cap pending notifications; the soonest ones matter. */
const MAX = 50;
let asked = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Schedules a phone notification for each of the person's open tasks that has a reminder time in
 * the future, replacing the ones scheduled before. Called whenever their tasks change.
 */
export async function syncReminders(tasks: Task[], userId: string, accountName: (id: string) => string): Promise<void> {
  const now = Date.now();
  const due = tasks
    .filter((t) => t.ownerId === userId && !t.doneAt && t.remindAt)
    .map((t) => ({ t, at: new Date(`${t.due}T${t.remindAt}:00`) }))
    .filter((x) => x.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((n) => n.content.data?.kind === KIND);
  const want = new Map(due.map((x) => [`${x.t.id}@${x.at.toISOString()}|${x.t.title}`, x]));
  // Leave unchanged reminders alone; replace the rest.
  for (const n of ours) {
    const key = String(n.content.data?.key ?? '');
    if (want.has(key)) want.delete(key);
    else await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  if (!want.size) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) {
    if (asked || !perm.canAskAgain) return;
    asked = true;
    if (!(await Notifications.requestPermissionsAsync()).granted) return;
  }
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('tasks', { name: 'Task reminders', importance: Notifications.AndroidImportance.HIGH });
  for (const [key, { t, at }] of want) {
    await Notifications.scheduleNotificationAsync({
      content: { title: t.title, body: t.accountId ? `Ava CRM · ${accountName(t.accountId)}` : 'Ava CRM task', data: { kind: KIND, key, taskId: t.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'tasks' },
    });
  }
}
