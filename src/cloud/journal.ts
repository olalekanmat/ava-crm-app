import { applyMutation, describeMutation, RuleError, type Mutation } from '../data/mutations';
import { sanitizeMutation } from '../data/sanitize';
import { companyCycles, companyMonthCycles } from '../data/cycles';
import { emptySnapshot, type Company, type Snapshot, type User } from '../data/types';

/**
 * How a company's data lives in its drive folder:
 *
 *   ava-company.json                      who set the company up (written once by the admin)
 *   ava-journal-<userId>-<deviceId>.json  every change made on one device, in order
 *   ava-license.json                      the latest licence from the approval server
 *
 * Each device only ever writes its own journal, so two phones never overwrite each other.
 * Every device rebuilds the company's data by replaying all journals through the same rules
 * (applyMutation), in the same order, so they all arrive at the same result.
 */

export const COMPANY_FILE = 'ava-company.json';
export const LICENSE_FILE = 'ava-license.json';
export const JOURNAL_PREFIX = 'ava-journal-';
export const CHECKPOINT_FILE = 'ava-checkpoint.json';

/**
 * Condensed history (2.9): the company's data after replaying every journal entry up to
 * `covered[journal file]` (a sequence number). Devices start from it and replay only later entries,
 * so a company with years of history opens quickly. Administrators' devices write it; the journals
 * stay untouched in the drive, so older app versions (which ignore this file) still work.
 */
export interface Checkpoint {
  format: 'ava-checkpoint/1';
  companyId: string;
  /** Entries up to this time are condensed (when every earlier entry in their journal is too). */
  until: string;
  covered: Record<string, number>;
  /** How many entries the snapshot holds. */
  entries: number;
  createdAt: string;
  snapshot: Snapshot;
}

export function parseCheckpoint(text: string, companyId: string): Checkpoint | undefined {
  try {
    const c = JSON.parse(text);
    const snap = c?.snapshot;
    if (c?.format !== 'ava-checkpoint/1' || c.companyId !== companyId || typeof c.until !== 'string' || Number.isNaN(Date.parse(c.until))) return undefined;
    if (!c.covered || typeof c.covered !== 'object' || Object.values(c.covered).some((v) => typeof v !== 'number')) return undefined;
    if (!snap || !Array.isArray(snap.users) || !Array.isArray(snap.accounts) || !Array.isArray(snap.calls) || !Array.isArray(snap.plans) || !Array.isArray(snap.cycles) || !Array.isArray(snap.products) || !snap.settings || !snap.company) return undefined;
    return c as Checkpoint;
  } catch {
    return undefined;
  }
}

export type Provider = 'google' | 'onedrive' | 'sharepoint';

export interface CompanyFile {
  format: 'ava-crm/1';
  companyId: string;
  createdAt: string;
  /** Email of the admin who created the company; only they may change this file. */
  createdBy: string;
  provider: Provider;
  company: Company;
  admin: User;
}

export interface JournalEntry {
  seq: number;
  at: string;
  m: Mutation;
}

export interface JournalFile {
  format: 'ava-journal/1';
  companyId: string;
  userId: string;
  email: string;
  deviceId: string;
  entries: JournalEntry[];
}

export const journalName = (userId: string, deviceId: string) => `${JOURNAL_PREFIX}${userId}-${deviceId}.json`;

export interface ReplayLogEntry {
  at: string;
  userId: string;
  deviceId: string;
  seq: number;
  what: string;
  error?: string;
}

/** A journal as read from the drive, with who last changed the file when the drive reports it. */
export interface JournalSource {
  journal: JournalFile;
  modifiedBy?: string;
}

export interface ReplayResult {
  snapshot: Snapshot;
  log: ReplayLogEntry[];
  /** Files that were skipped, with the reason (for the admin). */
  warnings: string[];
}

const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Parses an untrusted journal file. Returns undefined when it is not one. */
export function parseJournal(text: string): JournalFile | undefined {
  try {
    const j = JSON.parse(text);
    if (j?.format !== 'ava-journal/1' || typeof j.userId !== 'string' || typeof j.email !== 'string' || typeof j.deviceId !== 'string' || !Array.isArray(j.entries)) return undefined;
    return j as JournalFile;
  } catch {
    return undefined;
  }
}

export function parseCompanyFile(text: string): CompanyFile | undefined {
  try {
    const c = JSON.parse(text);
    if (c?.format !== 'ava-crm/1' || typeof c.companyId !== 'string' || typeof c.createdBy !== 'string' || !c.admin?.id) return undefined;
    return c as CompanyFile;
  } catch {
    return undefined;
  }
}

/** The starting point before any journal: the company and its first administrator. */
export function genesisSnapshot(g: CompanyFile, now = new Date()): Snapshot {
  const admin: User = { id: g.admin.id, name: g.admin.name, email: g.admin.email.toLowerCase(), role: 'Admin', active: true, createdAt: g.createdAt };
  // Planning cycles are the calendar quarters (Cycle 1 = Jan–Mar …) and the calendar months,
  // created automatically. Administrators choose which length the company plans with.
  return { ...emptySnapshot({ name: g.company?.name || 'My company' }), users: [admin], cycles: [...companyCycles(g.createdAt, now), ...companyMonthCycles(g.createdAt, now)] };
}

/** Entry order: by time, then user, device and sequence, so every device replays in the same order. */
interface Item {
  j: JournalFile;
  e: JournalEntry;
  /** Sort time: entries older than the checkpoint that it does not hold (a phone that was offline) go right after it. */
  t: string;
}

function collect(g: CompanyFile, sources: JournalSource[], now: Date, warnings: string[], cp?: Checkpoint): Item[] {
  const latest = now.getTime() + 24 * 3600 * 1000;
  const items: Item[] = [];
  for (const { journal: j, modifiedBy } of sources) {
    if (j.companyId !== g.companyId) {
      warnings.push(`${journalName(j.userId, j.deviceId)} belongs to another company and was ignored.`);
      continue;
    }
    // Someone with access to the folder edited another person's journal: ignore it.
    if (modifiedBy && !same(modifiedBy, j.email)) {
      warnings.push(`${journalName(j.userId, j.deviceId)} was last changed by ${modifiedBy}, not ${j.email}, and was ignored.`);
      continue;
    }
    const covered = cp?.covered[journalName(j.userId, j.deviceId)] ?? 0;
    const seen = new Set<number>();
    for (const e of j.entries) {
      if (!e || typeof e.seq !== 'number' || seen.has(e.seq) || typeof e.at !== 'string') continue;
      const t = Date.parse(e.at);
      if (Number.isNaN(t) || t > latest) continue;
      seen.add(e.seq);
      if (e.seq <= covered) continue;
      items.push({ j, e, t: cp && e.at < cp.until ? cp.until : e.at });
    }
  }
  items.sort((x, y) => x.t.localeCompare(y.t) || x.e.at.localeCompare(y.e.at) || x.j.userId.localeCompare(y.j.userId) || x.j.deviceId.localeCompare(y.j.deviceId) || x.e.seq - y.e.seq);
  return items;
}

/** The starting point: the checkpoint when there is one (with this year's cycles added), else the genesis. */
function startFrom(g: CompanyFile, now: Date, cp?: Checkpoint): Snapshot {
  const base = genesisSnapshot(g, now);
  if (!cp) return base;
  const have = new Set(cp.snapshot.cycles.map((c) => c.id));
  return { ...cp.snapshot, cycles: [...cp.snapshot.cycles, ...base.cycles.filter((c) => !have.has(c.id))] };
}

function applyItems(s: Snapshot, items: Item[], log: ReplayLogEntry[]): Snapshot {
  for (const { j, e } of items) {
    const at = new Date(e.at);
    const entry: ReplayLogEntry = { at: e.at, userId: j.userId, deviceId: j.deviceId, seq: e.seq, what: String((e.m as { type?: unknown })?.type ?? 'change') };
    try {
      const actor = s.users.find((u) => u.id === j.userId);
      if (!actor || !actor.active) throw new RuleError('This person is not an active user of the company.');
      if (!same(actor.email, j.email)) throw new RuleError('The journal’s email does not match the user.');
      const m = sanitizeMutation(e.m, at);
      entry.what = describeMutation(m);
      s = applyMutation(s, m, actor, at);
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
    }
    log.push(entry);
  }
  return s;
}

/**
 * Rebuilds the company's data from every journal (starting from the condensed history when there
 * is one). Entries are ordered by time, then user, device and sequence, so every device gets the
 * same order. An entry that breaks a rule at its point in the order is skipped and logged.
 */
export function replay(g: CompanyFile, sources: JournalSource[], now = new Date(), cp?: Checkpoint): ReplayResult {
  const warnings: string[] = [];
  const log: ReplayLogEntry[] = [];
  const checkpoint = cp && cp.companyId === g.companyId ? cp : undefined;
  const snapshot = applyItems(startFrom(g, now, checkpoint), collect(g, sources, now, warnings, checkpoint), log);
  return { snapshot, log, warnings };
}

/** Entries older than this are condensed into the checkpoint. */
export const CHECKPOINT_AGE_DAYS = 30;
/** A new checkpoint is only worth writing once this many old entries are not in one yet. */
export const CHECKPOINT_MIN_ENTRIES = 500;

/**
 * A new checkpoint holding every entry older than `CHECKPOINT_AGE_DAYS` (for each journal, up to
 * its first newer entry, so nothing is held twice or skipped). Returns undefined when too few
 * entries would be added to be worth it.
 */
export function buildCheckpoint(g: CompanyFile, sources: JournalSource[], now = new Date(), prev?: Checkpoint, minEntries = CHECKPOINT_MIN_ENTRIES): Checkpoint | undefined {
  const until = new Date(now.getTime() - CHECKPOINT_AGE_DAYS * 864e5).toISOString();
  const base = prev && prev.companyId === g.companyId ? prev : undefined;
  const covered: Record<string, number> = { ...(base?.covered ?? {}) };
  for (const { journal: j } of sources) {
    const name = journalName(j.userId, j.deviceId);
    let k = covered[name] ?? 0;
    for (const e of [...j.entries].filter((x) => x && typeof x.seq === 'number' && x.seq > k).sort((a, b) => a.seq - b.seq)) {
      if (typeof e.at !== 'string' || !(e.at < until)) break;
      k = e.seq;
    }
    if (k) covered[name] = k;
  }
  // Only the entries the new checkpoint covers, on top of the previous one.
  const held = sources.map(({ journal: j, modifiedBy }) => ({ modifiedBy, journal: { ...j, entries: j.entries.filter((e) => e && typeof e.seq === 'number' && e.seq <= (covered[journalName(j.userId, j.deviceId)] ?? 0)) } }));
  const warnings: string[] = [];
  const items = collect(g, held, now, warnings, base);
  if (items.length < minEntries) return undefined;
  const snapshot = applyItems(startFrom(g, now, base), items, []);
  return { format: 'ava-checkpoint/1', companyId: g.companyId, until, covered, entries: (base?.entries ?? 0) + items.length, createdAt: now.toISOString(), snapshot };
}
