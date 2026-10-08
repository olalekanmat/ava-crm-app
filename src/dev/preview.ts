import { Platform } from 'react-native';
import type { LicenseState } from '@/cloud/license';
import { buildSeed } from '@/data/seed';
import type { Snapshot } from '@/data/types';

/**
 * UI preview, for screenshots and design review only. It is OFF unless the web build was exported
 * with EXPO_PUBLIC_AVA_UI_PREVIEW=1 (Expo inlines the value at build time, so release builds, which
 * never set it, carry no preview path). When on, the app skips sign-in and shows the fictional demo
 * data from the seed; `?as=rep|flm|slm|admin` in the address picks whose view. Nothing syncs.
 */
export const UI_PREVIEW = process.env.EXPO_PUBLIC_AVA_UI_PREVIEW === '1';

const AS: Record<string, string> = { rep: 'usr_rep1', flm: 'usr_flm1', slm: 'usr_slm', admin: 'usr_admin' };

export function previewState(): { snapshot: Snapshot; session: { mode: 'cloud'; userId: string; email: string; companyId: string; folder: { provider: 'google'; id: string }; deviceId: string }; license: LicenseState } {
  const as = Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('as') ?? 'rep' : 'rep';
  const snapshot = buildSeed();
  const userId = AS[as] ?? AS.rep;
  const email = snapshot.users.find((u) => u.id === userId)?.email ?? '';
  const now = Date.now();
  return {
    snapshot,
    session: { mode: 'cloud', userId, email, companyId: 'preview', folder: { provider: 'google', id: 'preview' }, deviceId: 'preview' },
    license: {
      state: 'active',
      daysLeft: 365,
      payload: { v: 1, companyId: 'preview', company: snapshot.company.name, adminEmail: '', issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 14 * 864e5).toISOString(), subscriptionEnd: new Date(now + 365 * 864e5).toISOString() },
    },
  };
}
