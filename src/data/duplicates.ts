import type { Account } from './types';

/** Titles and words that do not tell two doctors or hospitals apart. */
const NOISE = new Set(['dr', 'doctor', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'pharm', 'pharmacist', 'nurse', 'sir', 'chief', 'the', 'and', 'of', 'ltd', 'limited', 'plc', 'nig', 'nigeria']);

/** Name in one comparable form: lower case, no accents, punctuation or titles, words sorted. */
export function normalName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .sort()
    .join(' ');
}

/** The last 10 digits of a phone number, so +234 803… and 0803… match. */
export function normalPhone(phone?: string): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : '';
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 1 for the same name, falling towards 0 as the spelling differs. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalName(a);
  const y = normalName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

const sameCity = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

type Candidate = Pick<Account, 'name' | 'type' | 'city' | 'phone'> & { id?: string };

/** Why two accounts look like the same person or place, or undefined when they do not. */
export function duplicateReason(a: Candidate, b: Candidate): { score: number; reason: string } | undefined {
  if (a.type !== b.type) return undefined;
  const phone = normalPhone(a.phone);
  if (phone && phone === normalPhone(b.phone)) return { score: 1, reason: 'Same phone number' };
  const sim = nameSimilarity(a.name, b.name);
  if (sim === 1) return { score: sameCity(a.city, b.city) ? 0.98 : 0.9, reason: sameCity(a.city, b.city) ? 'Same name and city' : 'Same name' };
  if (sim >= 0.85 && sameCity(a.city, b.city)) return { score: sim * 0.95, reason: 'Very similar name, same city' };
  return undefined;
}

/** Accounts that may be the one being added (best match first). */
export function possibleDuplicates(c: Candidate, accounts: Account[], limit = 5): { account: Account; reason: string }[] {
  if (!c.name.trim()) return [];
  return accounts
    .filter((a) => !a.deletedAt && a.id !== c.id)
    .map((a) => ({ account: a, hit: duplicateReason(c, a) }))
    .filter((x): x is { account: Account; hit: { score: number; reason: string } } => !!x.hit)
    .sort((x, y) => y.hit.score - x.hit.score)
    .slice(0, limit)
    .map((x) => ({ account: x.account, reason: x.hit.reason }));
}

export interface DuplicateGroup {
  /** Best kept first: the one with the most history. */
  accounts: Account[];
  reason: string;
  score: number;
}

/**
 * Groups of accounts that look like duplicates. Names are only compared within small buckets
 * (same kind and first letters), so it stays quick with tens of thousands of accounts.
 */
export function findDuplicates(accounts: Account[], callCount: (id: string) => number = () => 0, limit = 200): DuplicateGroup[] {
  const live = accounts.filter((a) => !a.deletedAt);
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let p = parent.get(id) ?? id;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    return p;
  };
  const hits: { a: string; score: number; reason: string }[] = [];
  const linked = new Set<string>();
  const link = (a: Account, b: Account, hit: { score: number; reason: string }) => {
    const ra = find(a.id);
    const rb = find(b.id);
    if (ra !== rb) parent.set(rb, ra);
    linked.add(a.id).add(b.id);
    hits.push({ a: a.id, ...hit });
  };

  const buckets = new Map<string, Account[]>();
  const add = (key: string, a: Account) => {
    const list = buckets.get(key);
    if (list) list.push(a);
    else buckets.set(key, [a]);
  };
  for (const a of live) {
    const n = normalName(a.name);
    if (n) for (const w of n.split(' ')) if (w.length >= 3) add(`${a.type}|w|${w.slice(0, 4)}`, a);
    const p = normalPhone(a.phone);
    if (p) add(`${a.type}|p|${p}`, a);
  }
  const checked = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length < 2 || list.length > 400) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const hit = duplicateReason(a, b);
        if (hit) link(a, b, hit);
      }
    }
  }

  const groups = new Map<string, Account[]>();
  for (const a of live) {
    if (!linked.has(a.id)) continue;
    const root = find(a.id);
    const list = groups.get(root);
    if (list) list.push(a);
    else groups.set(root, [a]);
  }
  const best = new Map<string, { score: number; reason: string }>();
  for (const h of hits) {
    const root = find(h.a);
    if ((best.get(root)?.score ?? -1) < h.score) best.set(root, h);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([root, list]) => ({
      accounts: list.sort((x, y) => callCount(y.id) - callCount(x.id) || x.createdAt.localeCompare(y.createdAt)),
      reason: best.get(root)?.reason ?? 'Similar details',
      score: best.get(root)?.score ?? 0.5,
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
