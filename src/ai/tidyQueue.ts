import AsyncStorage from '@react-native-async-storage/async-storage';

/** Draft calls whose dictated notes AI tidies once the phone is back online. */
const key = (userId: string) => `ava:tidy-queue:${userId}`;

export async function tidyQueue(userId: string): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(key(userId))) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export async function queueTidy(userId: string, callId: string): Promise<void> {
  const list = await tidyQueue(userId);
  if (!list.includes(callId)) await AsyncStorage.setItem(key(userId), JSON.stringify([...list, callId].slice(-50)));
}

export async function unqueueTidy(userId: string, callId: string): Promise<void> {
  const list = await tidyQueue(userId);
  if (list.includes(callId)) await AsyncStorage.setItem(key(userId), JSON.stringify(list.filter((x) => x !== callId)));
}
