import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device storage. AsyncStorage maps to on-device storage on iOS/Android and to localStorage
 * on web. Holds the session, the demo data set, and in server mode an offline cache plus the
 * queue of changes waiting to sync.
 */
export const KEYS = {
  session: 'ava:session',
  demo: 'ava:demo:v2',
  cache: 'ava:cache:v2',
  outbox: 'ava:outbox:v2',
};

export async function loadJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeKeys(...keys: string[]): Promise<void> {
  await AsyncStorage.multiRemove(keys);
}
