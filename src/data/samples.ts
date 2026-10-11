import type { Call, SampleCount, SampleIssue, Snapshot } from './types';

export interface SampleStock {
  product: string;
  /** Received from managers, less what was taken back. */
  received: number;
  /** Handed out in recorded calls (drafts and submitted). */
  given: number;
  balance: number;
}

/** Samples handed out in a person's recorded calls, newest first. */
export function samplesGiven(calls: Call[], repId: string): { call: Call; product: string; qty: number; batch?: string }[] {
  return calls
    .filter((c) => c.ownerId === repId && c.status !== 'Planned' && c.samples?.length)
    .flatMap((c) => c.samples!.map((x) => ({ call: c, ...x })))
    .sort((a, b) => b.call.datetime.localeCompare(a.call.datetime));
}

/** A rep's sample stock per product: what managers issued minus what calls handed out. */
export function sampleStock(s: Pick<Snapshot, 'calls' | 'samples'>, repId: string, exceptCallId?: string): SampleStock[] {
  const by = new Map<string, SampleStock>();
  const row = (product: string) => {
    let r = by.get(product);
    if (!r) by.set(product, (r = { product, received: 0, given: 0, balance: 0 }));
    return r;
  };
  for (const x of s.samples ?? []) if (x.repId === repId) row(x.product).received += x.qty;
  for (const g of samplesGiven(s.calls, repId)) if (g.call.id !== exceptCallId) row(g.product).given += g.qty;
  for (const r of by.values()) r.balance = r.received - r.given;
  return [...by.values()].sort((a, b) => a.product.localeCompare(b.product));
}

/** Issues to and from a rep, newest first. */
export function sampleIssues(s: Pick<Snapshot, 'samples'>, repId: string): SampleIssue[] {
  return (s.samples ?? []).filter((x) => x.repId === repId).sort((a, b) => b.at.localeCompare(a.at));
}

export interface BatchStock {
  product: string;
  batch?: string;
  /** YYYY-MM */
  expiry?: string;
  balance: number;
}

/** A rep's stock per product and batch, soonest expiry first (hand those out first). */
export function batchStock(s: Pick<Snapshot, 'calls' | 'samples'>, repId: string, exceptCallId?: string): BatchStock[] {
  const by = new Map<string, BatchStock>();
  const row = (product: string, batch?: string, expiry?: string) => {
    const key = `${product}|${batch ?? ''}`;
    let r = by.get(key);
    if (!r) by.set(key, (r = { product, batch, expiry, balance: 0 }));
    if (expiry && !r.expiry) r.expiry = expiry;
    return r;
  };
  for (const x of s.samples ?? []) if (x.repId === repId) row(x.product, x.batch, x.expiry).balance += x.qty;
  for (const g of samplesGiven(s.calls, repId)) if (g.call.id !== exceptCallId) row(g.product, g.batch).balance -= g.qty;
  return [...by.values()].sort((a, b) => a.product.localeCompare(b.product) || (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999') || (a.batch ?? '').localeCompare(b.batch ?? ''));
}

/** Batches that have expired (`month` is YYYY-MM) or expire within `withinMonths`. */
export function expiringBatches(stock: BatchStock[], month: string, withinMonths = 1): { expired: BatchStock[]; soon: BatchStock[] } {
  const [y, m] = month.split('-').map(Number);
  const limitDate = new Date(y, m - 1 + withinMonths, 1);
  const limit = `${limitDate.getFullYear()}-${String(limitDate.getMonth() + 1).padStart(2, '0')}`;
  const live = stock.filter((b) => b.balance > 0 && b.expiry);
  return { expired: live.filter((b) => b.expiry! < month), soon: live.filter((b) => b.expiry! >= month && b.expiry! <= limit) };
}

export interface Reconciliation {
  product: string;
  /** What the records say the rep holds at the time of the count. */
  expected: number;
  counted: number;
  /** counted - expected: negative means samples are missing. */
  variance: number;
}

/** Compares a rep's physical count with the records as they stood when it was made. */
export function reconcile(s: Pick<Snapshot, 'calls' | 'samples'>, count: SampleCount): Reconciliation[] {
  const at = count.at;
  const upTo = { samples: (s.samples ?? []).filter((x) => x.at <= at), calls: s.calls.filter((c) => (c.submittedAt ?? c.updatedAt) <= at) };
  const expected = new Map(sampleStock(upTo, count.repId).map((x) => [x.product, x.balance]));
  const products = [...new Set([...expected.keys(), ...count.counts.map((c) => c.product)])];
  return products
    .map((product) => {
      const counted = count.counts.find((c) => c.product === product)?.counted ?? 0;
      const exp = expected.get(product) ?? 0;
      return { product, expected: exp, counted, variance: counted - exp };
    })
    .filter((r) => r.expected || r.counted)
    .sort((a, b) => a.product.localeCompare(b.product));
}

/** Calls with samples handed over but no signature, newest first. */
export const unsignedSampleCalls = (calls: Call[], repId?: string) =>
  calls.filter((c) => (!repId || c.ownerId === repId) && c.status === 'Submitted' && c.samples?.length && !c.signature).sort((a, b) => b.datetime.localeCompare(a.datetime));
