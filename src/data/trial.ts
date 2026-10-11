import type { TrialLimits } from '../cloud/license';
import type { Snapshot } from './types';

const liveAccounts = (s: Snapshot, type: 'HCP' | 'HCO') => s.accounts.filter((a) => a.type === type && !a.deletedAt).length;
const liveProducts = (s: Snapshot) => s.products.filter((p) => p.active).length;

/**
 * A free trial caps HCPs, HCOs and active products (users are capped by the licence's seats).
 * Returns why a change is not allowed, or undefined. Like the user cap, a list already over the
 * limit may shrink but not grow, so nothing recorded earlier is lost.
 */
export function trialLimitError(before: Snapshot, after: Snapshot, limits: TrialLimits): string | undefined {
  const checks: [number, number, number, string][] = [
    [liveAccounts(before, 'HCP'), liveAccounts(after, 'HCP'), limits.hcps, 'HCPs'],
    [liveAccounts(before, 'HCO'), liveAccounts(after, 'HCO'), limits.hcos, 'HCOs'],
    [liveProducts(before), liveProducts(after), limits.products, 'active products'],
  ];
  for (const [had, want, max, what] of checks) {
    if (want > max && want > had) return `The free trial includes up to ${max} ${what}${had >= max ? ', and all are in use' : ` and this would make ${want}`}. Subscribe to add more.`;
  }
  return undefined;
}

/** One line describing what a trial includes, e.g. for banners. */
export function trialSummary(l: TrialLimits): string {
  return `${l.users} users, ${l.hcps} HCPs, ${l.hcos} HCOs, ${l.products} products and ${l.aiPerDay} Ava AI requests a day`;
}
