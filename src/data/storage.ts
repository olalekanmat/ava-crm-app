import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device storage. AsyncStorage maps to on-device storage on iOS/Android and to localStorage
 * on web. Holds the session and the demo data set; the cloud cache lives in bigStorage.
 */
export const KEYS = {
  session: 'ava:session',
  demo: 'ava:demo:v3',
  /** Cloud mode: the company's journals, cached for offline use (see bigStorage). */
  cache: 'ava-cloud-cache-v1',
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
