import { router } from 'expo-router';
import { useEffect } from 'react';
import { APP_VERSION } from '@/cloud/relay';
import { loadJson, saveJson } from '@/data/storage';
import { useStore } from '@/data/store';
import { RELEASE_NOTES } from '@/data/versions';

export const SEEN_VERSION_KEY = 'ava.seenVersion';

/** Opens What's new once after the app updates. A fresh sign-in marks the version as seen (see sign-in). */
export function WhatsNewCheck() {
  const { session } = useStore();
  const demo = !!session?.demo;
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    (async () => {
      const seen = await loadJson<string>(SEEN_VERSION_KEY);
      if (cancelled || seen === APP_VERSION) return;
      await saveJson(SEEN_VERSION_KEY, APP_VERSION);
      if (RELEASE_NOTES.some((n) => n.version === APP_VERSION)) setTimeout(() => router.push('/whats-new'), 600);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [demo]);
  return null;
}
