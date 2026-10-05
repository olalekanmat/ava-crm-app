import { isAdmin } from '../data/access';
import { exportAccounts, exportCalls, exportCyclePlans, exportUsers } from '../data/csv';
import { currentCycle } from '../data/metrics';
import type { Snapshot } from '../data/types';
import type { DriveAdapter, DriveFile } from './drive';
import { COMPANY_FILE, JOURNAL_PREFIX, journalName, LICENSE_FILE, parseCompanyFile, parseJournal, replay, type CompanyFile, type JournalFile, type ReplayResult } from './journal';
import { parseLicenseFile, type LicenseFile } from './license';

/** Everything a device keeps between syncs, so it works offline. */
export interface CloudCache {
  companyId: string;
  genesis?: CompanyFile;
  genesisVersion?: string;
  /** Other devices' journals, by file id. */
  journals: Record<string, { name: string; version: string; modifiedBy?: string; journal: JournalFile }>;
  /** This device's journal: the source of truth for changes made here. */
  own: JournalFile;
  ownFileId?: string;
  /** Version of this device's journal file after its last upload. */
  ownVersion?: string;
  /** How many of `own.entries` are in the drive. */
  uploaded: number;
  license?: LicenseFile;
  licenseFileId?: string;
  licenseVersion?: string;
  lastSync?: string;
  lastExport?: string;
  /** The sign-in list last written to ava-roster.json (administrators). */
  rosterSent?: string;
  /** Version of ava-roster.json now in the drive, and its sign-in list in the same form as rosterSent. */
  remoteRosterVersion?: string;
  remoteRoster?: string;
}

export function newCache(companyId: string, userId: string, email: string, deviceId: string): CloudCache {
  return { companyId, journals: {}, own: { format: 'ava-journal/1', companyId, userId, email: email.toLowerCase(), deviceId, entries: [] }, uploaded: 0 };
}

export const pendingCount = (c: CloudCache) => c.own.entries.length - c.uploaded;

/** Rebuilds the company data from what this device has (works offline). */
export function rebuild(c: CloudCache, now = new Date()): ReplayResult | undefined {
  if (!c.genesis) return undefined;
  const sources = [...Object.values(c.journals).map((x) => ({ journal: x.journal, modifiedBy: x.modifiedBy })), { journal: c.own }];
  return replay(c.genesis, sources, now);
}

const EXPORT_EVERY_MS = 60 * 60 * 1000;
export const ROSTER_FILE = 'ava-roster.json';

export interface RosterEntry { id: string; name: string; email: string; role: string; active: boolean }
/** The sign-in list in one comparable form. */
export const rosterKey = (users: RosterEntry[]): string =>
  JSON.stringify(users.map((u) => ({ id: u.id, name: u.name, email: u.email.toLowerCase(), role: u.role, active: u.active !== false })).sort((x, y) => x.id.localeCompare(y.id)));

export interface SyncOptions {
  now?: Date;
  /** Admins also write readable CSV copies of the data into the folder, at most hourly. */
  writeExports?: boolean;
  /** Refresh the CSV copies now (the admin pressed Sync). */
  forceExports?: boolean;
  /** Read the sign-in list when it changed (administrators keep it in step). */
  readRoster?: boolean;
}

/**
 * One round with the drive: download journals that changed, upload this device's new
 * entries, refresh the licence file, then rebuild. Returns the updated cache.
 */
export async function syncOnce(drive: DriveAdapter, cache: CloudCache, opts: SyncOptions = {}): Promise<{ cache: CloudCache; result?: ReplayResult }> {
  const now = opts.now ?? new Date();
  const c: CloudCache = { ...cache, journals: { ...cache.journals } };
  const files = await drive.list();
  const byName = new Map(files.map((f) => [f.name, f]));

  const companyFile = byName.get(COMPANY_FILE);
  if (!companyFile) throw new Error('The company folder has no ava-company.json. Check the folder link with your administrator.');
  if (companyFile.version !== c.genesisVersion || !c.genesis) {
    const g = parseCompanyFile(await drive.read(companyFile.id));
    if (!g) throw new Error('ava-company.json in the company folder is damaged.');
    if (g.companyId !== c.companyId) throw new Error('This folder belongs to a different company.');
    if (companyFile.modifiedBy && companyFile.modifiedBy.toLowerCase() !== g.createdBy.toLowerCase()) {
      throw new Error(`ava-company.json was changed by ${companyFile.modifiedBy}. Ask your administrator to restore it from the drive's version history.`);
    }
    c.genesis = g;
    c.genesisVersion = companyFile.version;
  }

  const ownName = journalName(c.own.userId, c.own.deviceId);
  const seen = new Set<string>();
  for (const f of files) {
    if (!f.name.startsWith(JOURNAL_PREFIX) || f.name === ownName) continue;
    seen.add(f.id);
    if (c.journals[f.id]?.version === f.version) continue;
    const j = parseJournal(await drive.read(f.id));
    if (j) c.journals[f.id] = { name: f.name, version: f.version, modifiedBy: f.modifiedBy, journal: j };
  }
  for (const id of Object.keys(c.journals)) if (!seen.has(id)) delete c.journals[id];

  // Upload this device's journal when it has new entries (or is missing from the drive).
  const ownRemote = byName.get(ownName);
  // The drive has a newer copy of this device's journal than this cache knows about (for example a
  // browser that restored an old copy): keep everything in the drive and add only the new changes.
  if (ownRemote && c.ownVersion && ownRemote.version !== c.ownVersion) {
    const remote = parseJournal(await drive.read(ownRemote.id));
    if (remote && remote.entries.length >= c.uploaded) {
      let seq = remote.entries.at(-1)?.seq ?? 0;
      const fresh = c.own.entries.slice(c.uploaded).map((e) => ({ ...e, seq: ++seq }));
      c.own = { ...c.own, entries: [...remote.entries, ...fresh] };
      c.uploaded = remote.entries.length;
    }
    c.ownVersion = ownRemote.version;
  }
  if (c.uploaded < c.own.entries.length || !ownRemote) {
    if (c.own.entries.length || ownRemote) {
      const count = c.own.entries.length;
      const written = await drive.write(ownName, JSON.stringify(c.own), 'application/json', ownRemote?.id ?? c.ownFileId);
      c.ownFileId = written.id;
      c.ownVersion = written.version;
      c.uploaded = count;
    }
  }

  const lic = byName.get(LICENSE_FILE);
  if (lic && lic.version !== c.licenseVersion) {
    const parsed = parseLicenseFile(await drive.read(lic.id));
    if (parsed && parsed.companyId === c.companyId) c.license = parsed;
    c.licenseFileId = lic.id;
    c.licenseVersion = lic.version;
  }

  // Lets an administrator notice when someone else (e.g. an older app) rewrote the sign-in list.
  const rosterFile = byName.get(ROSTER_FILE);
  if (opts.readRoster && rosterFile && rosterFile.version !== c.remoteRosterVersion) {
    try {
      c.remoteRoster = rosterKey(JSON.parse(await drive.read(rosterFile.id)).users);
    } catch {
      c.remoteRoster = undefined;
    }
  }
  if (!rosterFile) c.remoteRoster = undefined;
  c.remoteRosterVersion = rosterFile?.version;

  c.lastSync = now.toISOString();
  const result = rebuild(c, now);

  // Decide from the data just rebuilt: someone whose admin rights were removed must not try.
  const meNow = result?.snapshot.users.find((u) => u.id === c.own.userId && !u.deletedAt && u.active);
  if (opts.writeExports && result && isAdmin(meNow) && (opts.forceExports || !c.lastExport || now.getTime() - Date.parse(c.lastExport) >= EXPORT_EVERY_MS)) {
    // The readable CSV copies are a convenience: a failure here must not lose the sync.
    try {
      await writeExports(drive, result.snapshot, byName);
      c.lastExport = now.toISOString();
    } catch (e) {
      console.warn('Could not write the CSV copies', e);
    }
  }
  return { cache: c, result };
}

export const EXPORT_FILES = {
  calls: 'Ava CRM - calls.csv',
  accounts: 'Ava CRM - accounts.csv',
  plans: 'Ava CRM - cycle plans.csv',
  users: 'Ava CRM - users.csv',
};

/** Readable copies for the company: open them in Excel or Sheets straight from the drive. */
async function writeExports(drive: DriveAdapter, s: Snapshot, byName: Map<string, DriveFile>) {
  const cycle = currentCycle(s.cycles);
  const files: [string, string][] = [
    [EXPORT_FILES.calls, exportCalls(s)],
    [EXPORT_FILES.accounts, exportAccounts(s)],
    [EXPORT_FILES.plans, cycle ? exportCyclePlans(s, cycle) : ''],
    [EXPORT_FILES.users, exportUsers(s)],
  ];
  for (const [name, csv] of files) await drive.write(name, '﻿' + csv, 'text/csv', byName.get(name)?.id);
}

/** Writes the licence file so every device in the company sees the latest licence. */
export async function writeLicense(drive: DriveAdapter, c: CloudCache, license: LicenseFile): Promise<CloudCache> {
  const f = await drive.write(LICENSE_FILE, JSON.stringify(license, null, 2), 'application/json', c.licenseFileId);
  return { ...c, license, licenseFileId: f.id, licenseVersion: f.version };
}

/** Creates a company in an empty folder: the company file plus the admin's first journal. */
export async function createCompany(drive: DriveAdapter, g: CompanyFile): Promise<void> {
  const files = await drive.list();
  if (files.some((f) => f.name === COMPANY_FILE)) throw new Error('This folder already has an Ava CRM company. Use an empty folder, or join that company instead.');
  await drive.write(COMPANY_FILE, JSON.stringify(g, null, 2), 'application/json');
}
