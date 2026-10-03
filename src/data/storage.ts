import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Account, Call } from './types';

/**
 * Local persistence. AsyncStorage maps to on-device storage on iOS/Android and to
 * localStorage on web. This is the seam where a sync backend plugs in later.
 */
const KEY = 'repfield:v1';

export interface Snapshot {
  accounts: Account[];
  calls: Call[];
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export async function saveSnapshot(s: Snapshot): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
