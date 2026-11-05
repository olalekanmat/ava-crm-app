import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Whether the calendar shows Saturday and Sunday, remembered per person on this device. 2.15: hidden
 * by default (field work is Monday to Friday); the Weekends switch shows them.
 */
export function useWeekends(userId?: string): [boolean, () => void] {
  const key = `ava:weekWeekends:${userId ?? 'anon'}`;
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .then((v) => live && setOn(v === 'on'))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  const toggle = () =>
    setOn((was) => {
      AsyncStorage.setItem(key, was ? 'off' : 'on').catch(() => {});
      return !was;
    });
  return [on, toggle];
}
