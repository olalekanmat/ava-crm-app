import { Platform } from 'react-native';
import { DEFAULT_TRIAL, type LicenseState } from '@/cloud/license';
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

export function previewState(): { snapshot: Snapshot; session: { mode: 'cloud'; userId: string; email: string; companyId: string; folder: { provider: 'google'; id: string }; deviceId: string; actingAs?: { adminId: string; adminName: string; expiresAt: string } }; license: LicenseState } {
  const as = Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('as') ?? 'rep' : 'rep';
  const snapshot = buildSeed();
  const userId = AS[as] ?? AS.rep;
  const email = snapshot.users.find((u) => u.id === userId)?.email ?? '';
  const now = Date.now();
  // Ava ERP (2.11) is on in previews; ?erp=0 shows a company without it.
  const modules = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('erp') === '0' ? [] : ['erp'];
  // ?trial=1 shows a company on a free trial with 8 days left, ?trial=ended one whose trial is over.
  const trial = UI_PREVIEW && Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('trial') : null;
  if (trial) {
    const end = now + (trial === 'ended' ? -864e5 : 8 * 864e5 - 3600e3);
    const payload = { v: 1 as const, companyId: 'preview', company: snapshot.company.name, adminEmail: '', issuedAt: new Date(now - 22 * 864e5).toISOString(), expiresAt: new Date(end).toISOString(), subscriptionEnd: new Date(end).toISOString(), seats: 5, trial: true, limits: DEFAULT_TRIAL, modules };
    return {
      snapshot,
      session: { mode: 'cloud', userId, email, companyId: 'preview', folder: { provider: 'google', id: 'preview' }, deviceId: 'preview' },
      license: trial === 'ended' ? { state: 'expired', payload, trial: true } : { state: 'active', payload, daysLeft: 8 },
    };
  }
  // ?actingAs=1 shows the banner an administrator sees while signed in as this person (2.10).
  const actingAs = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('actingAs') ? { adminId: 'usr_admin', adminName: 'Preview Admin', expiresAt: new Date(now + 45 * 60000).toISOString() } : undefined;
  return {
    snapshot,
    session: { mode: 'cloud', userId, email, companyId: 'preview', folder: { provider: 'google', id: 'preview' }, deviceId: 'preview', ...(actingAs ? { actingAs } : {}) },
    license: {
      state: 'active',
      daysLeft: 365,
      payload: { v: 1, companyId: 'preview', company: snapshot.company.name, adminEmail: '', issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 14 * 864e5).toISOString(), subscriptionEnd: new Date(now + 365 * 864e5).toISOString(), seats: 30, modules },
    },
  };
}

/** A made-up subscription quote, so the Subscription card can be reviewed without a server. */
export function previewBilling(pick: { kind: 'renew' | 'add' | 'module'; months: number; seats: number; modules?: string[] }, activeUsers: number) {
  const perUserMonth = 12500;
  const erpPrice = 2500;
  const has = ['erp'];
  const modules = pick.kind === 'add' ? has : pick.modules ?? has;
  const unit = (pick.kind === 'module' ? 0 : perUserMonth) + (modules.includes('erp') ? erpPrice : 0);
  const durationDiscounts = [{ minMonths: 3, percent: 5 }, { minMonths: 6, percent: 10 }, { minMonths: 12, percent: 16.67, label: '2 months free' }];
  const seats = pick.kind === 'add' ? Math.max(1, pick.seats) : pick.kind === 'module' ? 30 : Math.max(5, activeUsers, pick.seats);
  const days = pick.kind === 'renew' ? Math.round((pick.months * 365) / 12) : 120;
  const subtotal = pick.kind === 'renew' ? unit * 100 * seats * pick.months : Math.round((unit * 100 * seats * days * 12) / 365);
  const d = pick.kind === 'renew' ? durationDiscounts.filter((x) => pick.months >= x.minMonths).at(-1) : undefined;
  const discounts = [...(d ? [{ label: d.label ?? `${d.minMonths}+ month discount`, percent: d.percent }] : []), { label: 'Launch offer', percent: 10, until: '2026-10-31' }].map((x) => ({ ...x, amount: 0 }));
  let amount = subtotal;
  for (const x of discounts) {
    x.amount = Math.round((amount * x.percent) / 100);
    amount -= x.amount;
  }
  const modulePrices = modules.includes('erp') ? [{ id: 'erp', name: 'Ava ERP', perUserMonth: erpPrice }] : [];
  return {
    configured: true, currency: 'NGN', perUserMonth, minSeats: 5, maxMonths: 24, durationDiscounts, promotion: { label: 'Launch offer', percent: 10, until: '2026-10-31' }, activeUsers,
    modules: [{ id: 'erp', perUserMonth: erpPrice, active: true }],
    quote: { kind: pick.kind, months: pick.kind === 'renew' ? pick.months : 0, days, seats, minSeats: 5, perUserMonth, currency: 'NGN', subtotal, discounts, amount: Math.round(amount / 100) * 100, modules: modulePrices.map((m) => m.id), modulePrices },
    licence: { status: 'active', subscriptionEnd: new Date(Date.now() + 120 * 864e5).toISOString(), seats: 30, modules: has, payments: [{ at: '2026-09-01T10:00:00Z', kind: 'renew', amount: 2250000 * 100, currency: 'NGN', months: 6, seats: 30, modules: has, reference: 'ava-preview' }] },
  };
}
