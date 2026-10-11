import { isAdmin } from '../data/access';
import {
  DATA_MODEL_FILES, exportAccounts, exportCallObjectives, exportCallProducts, exportCalls, exportCyclePlans, exportDataModel, exportEventAttendees, exportEvents,
  exportLeave, exportPresentations, exportSampleMovements, exportTasks, exportUsers,
} from '../data/csv';
import { activeCycleLength } from '../data/cycles';
import { currentCycle } from '../data/metrics';
import type { Snapshot } from '../data/types';
import type { DriveAdapter, DriveFile } from './drive';
import { buildCheckpoint, CHECKPOINT_FILE, COMPANY_FILE, JOURNAL_PREFIX, journalName, LICENSE_FILE, parseCheckpoint, parseCompanyFile, parseJournal, replay, type Checkpoint, type CompanyFile, type JournalFile, type ReplayResult } from './journal';
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
  /** Condensed older history (2.9), and the drive version it came from. */
  checkpoint?: Checkpoint;
  checkpointVersion?: string;
  /** When this device last tried to write a checkpoint (administrators). */
  lastCheckpointTry?: string;
}

export function newCache(companyId: string, userId: string, email: string, deviceId: string): CloudCache {
  return { companyId, journals: {}, own: { format: 'ava-journal/1', companyId, userId, email: email.toLowerCase(), deviceId, entries: [] }, uploaded: 0 };
}

export const pendingCount = (c: CloudCache) => c.own.entries.length - c.uploaded;

/** Rebuilds the company data from what this device has (works offline). */
export function rebuild(c: CloudCache, now = new Date()): ReplayResult | undefined {
  if (!c.genesis) return undefined;
  return replay(c.genesis, sourcesOf(c), now, c.checkpoint);
}

const sourcesOf = (c: CloudCache) => [...Object.values(c.journals).map((x) => ({ journal: x.journal, modifiedBy: x.modifiedBy })), { journal: c.own }];

/** Administrators' devices check this often whether older history is worth condensing. */
const CHECKPOINT_EVERY_MS = 24 * 60 * 60 * 1000;
/** The relay takes files up to about 5.5 MB; a bigger checkpoint is not written. */
const CHECKPOINT_MAX_CHARS = 5_000_000;

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
  /** Condense history older than a month into ava-checkpoint.json when it is worth it (administrators, 2.9). */
  writeCheckpoint?: boolean;
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
      // Entries the drive already has (uploaded just before the app closed) are not added twice.
      const fresh = c.own.entries
        .slice(c.uploaded)
        .filter((e) => !remote.entries.some((r) => r.seq === e.seq && r.at === e.at))
        .map((e) => ({ ...e, seq: ++seq }));
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

  // Condensed older history (2.9): start from it instead of replaying every journal from the start.
  const cpFile = byName.get(CHECKPOINT_FILE);
  if (cpFile && cpFile.version !== c.checkpointVersion) {
    const cp = parseCheckpoint(await drive.read(cpFile.id), c.companyId);
    if (cp) c.checkpoint = cp;
    c.checkpointVersion = cpFile.version;
  }
  if (!cpFile) {
    c.checkpoint = undefined;
    c.checkpointVersion = undefined;
  }

  c.lastSync = now.toISOString();
  const result = rebuild(c, now);

  // Decide from the data just rebuilt: someone whose admin rights were removed must not try.
  const meNow = result?.snapshot.users.find((u) => u.id === c.own.userId && !u.deletedAt && u.active);
  if (opts.writeExports && result && isAdmin(meNow) && (opts.forceExports || !c.lastExport || now.getTime() - Date.parse(c.lastExport) >= EXPORT_EVERY_MS)) {
    // The readable CSV copies are a convenience: a failure here must not lose the sync.
    try {
      await writeExports(drive, result.snapshot, byName, now);
      c.lastExport = now.toISOString();
    } catch (e) {
      console.warn('Could not write the CSV copies', e);
    }
  }
  if (opts.writeCheckpoint && c.genesis && result && isAdmin(meNow) && (!c.lastCheckpointTry || now.getTime() - Date.parse(c.lastCheckpointTry) >= CHECKPOINT_EVERY_MS)) {
    c.lastCheckpointTry = now.toISOString();
    // A convenience like the CSV copies: a failure here must not lose the sync.
    try {
      const cp = buildCheckpoint(c.genesis, sourcesOf(c), now, c.checkpoint);
      const text = cp && JSON.stringify(cp);
      if (cp && text && text.length <= CHECKPOINT_MAX_CHARS) {
        const f = await drive.write(CHECKPOINT_FILE, text, 'application/json', cpFile?.id);
        c.checkpoint = cp;
        c.checkpointVersion = f.version;
      }
    } catch (e) {
      console.warn('Could not condense older history', e);
    }
  }
  return { cache: c, result };
}

/** The readable copies in the company folder: one file per table, for Excel and Power BI (see DATA_MODEL in data/csv). */
export const EXPORT_FILES = DATA_MODEL_FILES;

/** Readable copies for the company: open them in Excel, Sheets or Power BI straight from the drive. */
async function writeExports(drive: DriveAdapter, s: Snapshot, byName: Map<string, DriveFile>, now: Date) {
  const cycle = currentCycle(s.cycles, now, activeCycleLength(s.settings));
  const files: [string, string][] = [
    [EXPORT_FILES.calls, exportCalls(s, true)],
    [EXPORT_FILES.accounts, exportAccounts(s, true)],
    [EXPORT_FILES.plans, cycle ? exportCyclePlans(s, cycle, true) : ''],
    [EXPORT_FILES.users, exportUsers(s, true)],
    [EXPORT_FILES.callProducts, exportCallProducts(s)],
    [EXPORT_FILES.callObjectives, exportCallObjectives(s)],
    [EXPORT_FILES.presentations, exportPresentations(s)],
    [EXPORT_FILES.samples, exportSampleMovements(s)],
    [EXPORT_FILES.tasks, exportTasks(s)],
    [EXPORT_FILES.leave, exportLeave(s)],
    [EXPORT_FILES.events, exportEvents(s)],
    [EXPORT_FILES.eventAttendees, exportEventAttendees(s)],
    // Last, so its refresh time is only written once every table above is.
    [EXPORT_FILES.model, exportDataModel(now)],
  ];
  for (const [name, csv] of files) await drive.write(name, '\ufeff' + csv, 'text/csv', byName.get(name)?.id);
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
