/** The weekly summary reminder is a phone notification; the web app has nothing to schedule. */
export async function scheduleWeeklySummary(_enabled: boolean): Promise<boolean> {
  return false;
}
export const weeklyReminderSupported = false;
