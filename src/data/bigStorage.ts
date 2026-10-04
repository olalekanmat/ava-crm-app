import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { loadJson, removeKeys, saveJson } from './storage';

/**
 * Storage for large JSON (the company's journals cached for offline use). Phones write a file
 * in the app's private documents folder, which has no practical size limit; browsers use
 * local storage.
 */
const file = (key: string) => new File(Paths.document, `${key.replace(/[^a-z0-9.-]/gi, '_')}.json`);

export async function loadBig<T>(key: string): Promise<T | null> {
  if (Platform.OS === 'web') return loadJson<T>(key);
  try {
    const f = file(key);
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
}

export async function saveBig(key: string, value: unknown): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      await saveJson(key, value);
    } catch (e) {
      // Browser storage is full: the data stays in the drive and in memory for this visit.
      console.warn('Could not cache company data in this browser', e);
    }
    return;
  }
  const f = file(key);
  if (!f.exists) f.create();
  f.write(JSON.stringify(value));
}

export async function removeBig(key: string): Promise<void> {
  if (Platform.OS === 'web') return removeKeys(key);
  const f = file(key);
  if (f.exists) f.delete();
}
