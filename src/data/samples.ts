import type { Call, SampleIssue, Snapshot } from './types';

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
