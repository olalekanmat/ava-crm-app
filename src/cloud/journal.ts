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

/**
 * Rebuilds the company's data from every journal. Entries are ordered by time, then user,
 * device and sequence, so every device gets the same order. An entry that breaks a rule at
 * its point in the order is skipped and logged.
 */
export function replay(g: CompanyFile, sources: JournalSource[], now = new Date()): ReplayResult {
  const warnings: string[] = [];
  const log: ReplayLogEntry[] = [];
  const latest = now.getTime() + 24 * 3600 * 1000;
  const items: { j: JournalFile; e: JournalEntry }[] = [];

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
    const seen = new Set<number>();
    for (const e of j.entries) {
      if (!e || typeof e.seq !== 'number' || seen.has(e.seq) || typeof e.at !== 'string') continue;
      const t = Date.parse(e.at);
      if (Number.isNaN(t) || t > latest) continue;
      seen.add(e.seq);
      items.push({ j, e });
    }
  }

  items.sort((x, y) => x.e.at.localeCompare(y.e.at) || x.j.userId.localeCompare(y.j.userId) || x.j.deviceId.localeCompare(y.j.deviceId) || x.e.seq - y.e.seq);

  let s = genesisSnapshot(g, now);
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
  return { snapshot: s, log, warnings };
}
