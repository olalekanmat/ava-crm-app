import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { loadBig, saveBig } from '../data/bigStorage';
import { KEYS, loadJson } from '../data/storage';
import { loadAuthConfig, restoreAuth } from './auth';
import { adapterFor } from './connect';
import type { FolderRef } from './drive';
import { syncOnce, type CloudCache } from './sync';

/**
 * Hourly sync while the app is closed. Android and iOS decide when background work actually
 * runs (battery saver, how often the app is used), so this is best effort: the app also syncs
 * on open, every hour while open, and from the Sync button.
 */
const TASK = 'ava-hourly-sync';

/** When the app is open, the background task hands over to the app's own sync. */
let foreground: (() => Promise<void>) | null = null;
export const setForegroundSync = (fn: (() => Promise<void>) | null) => {
  foreground = fn;
};

if (Platform.OS !== 'web') {
  TaskManager.defineTask(TASK, async () => {
    try {
      if (foreground) {
        await foreground();
        return BackgroundTask.BackgroundTaskResult.Success;
      }
      const session = await loadJson<{ mode: string; companyId: string; folder: FolderRef }>(KEYS.session);
      const cache = await loadBig<CloudCache>(KEYS.cache);
      if (session?.mode !== 'cloud' || !cache || cache.companyId !== session.companyId) return BackgroundTask.BackgroundTaskResult.Success;
      await loadAuthConfig();
      if (!(await restoreAuth())) return BackgroundTask.BackgroundTaskResult.Failed;
      const { cache: next } = await syncOnce(adapterFor(session.folder), cache);
      await saveBig(KEYS.cache, next);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundSync() {
  if (Platform.OS === 'web') return;
  if (await TaskManager.isTaskRegisteredAsync(TASK)) return;
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 60 });
}

export async function unregisterBackgroundSync() {
  if (Platform.OS === 'web') return;
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
}
