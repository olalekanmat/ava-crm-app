import type { Task } from '@/data/types';

/** Task reminders are phone notifications; the web app shows due tasks in the app instead. */
export async function syncReminders(_tasks: Task[], _userId: string, _accountName: (id: string) => string): Promise<void> {}
export const remindersSupported = false;
