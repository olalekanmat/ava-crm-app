import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/** Opens the right screen when a notification from Ava is tapped. Renders nothing. */
export function NotificationTaps() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = response.notification.request.content.data ?? {};
    const route = data.kind === 'ava-weekly' ? '/weekly' : data.kind === 'ava-task' ? '/tasks' : typeof data.route === 'string' && data.route.startsWith('/') ? data.route : undefined;
    if (route) router.push(route as never);
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [response]);
  return null;
}
