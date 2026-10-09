import type { Account, CycleLength } from './types';

/**
 * Extra calls per quarter for accounts worth seeing more often: two for a key opinion leader and
 * one for high prescribing potential. A monthly cycle gets a third of that, rounded up.
 */
export function profileBoost(a: Pick<Account, 'kol' | 'potential'>, length: CycleLength = 'quarter'): number {
  const perQuarter = (a.kol ? 2 : 0) + (a.potential === 'High' ? 1 : 0);
  return length === 'month' ? Math.ceil(perQuarter / 3) : perQuarter;
}

/** Short tags for lists: "KOL", "High potential", the segment. */
export function profileTags(a: Pick<Account, 'kol' | 'potential' | 'segment'>): string[] {
  return [a.kol ? 'KOL' : '', a.potential ? `${a.potential} potential` : '', a.segment ?? ''].filter(Boolean);
}
