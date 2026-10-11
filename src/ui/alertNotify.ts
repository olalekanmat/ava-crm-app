import type { AlertItem } from '@/data/alerts';

export const ALERT_KIND = 'ava-alert';
/** The web app shows alerts under the bell instead of notifications. */
export async function notifyNewAlerts(_userId: string, _items: AlertItem[], _ask = false): Promise<void> {}
