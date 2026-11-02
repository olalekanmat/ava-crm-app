import type { JournalEntry, JournalFile, Provider } from './journal';

/** Where a company keeps its data, chosen by its administrator at setup. OneDrive is the default. */
export const SETUP_PROVIDERS = ['onedrive', 'google'] as const;
export type SetupProvider = (typeof SETUP_PROVIDERS)[number];

/** The provider named in a server response; anything unknown or missing means OneDrive. */
export function normalizeProvider(v: unknown): Provider {
  return v === 'google' || v === 'sharepoint' ? v : 'onedrive';
}

/** "Google Drive", "OneDrive" or "SharePoint", for sentences such as "your company’s OneDrive". */
export function providerLabel(p?: Provider): string {
  return p === 'google' ? 'Google Drive' : p === 'sharepoint' ? 'SharePoint' : 'OneDrive';
}

/** The company that signs the administrator in to the drive. */
export function providerAccount(p?: Provider): string {
  return p === 'google' ? 'Google' : 'Microsoft';
}

/** A file in the company folder. */
export interface DriveFile {
  id: string;
  name: string;
  /** Changes whenever the content changes (etag, version or modified time). */
  version: string;
  /** Email of the person who last changed the file, when the drive reports it. */
  modifiedBy?: string;
  webUrl?: string;
}

/** The company folder, as stored on each device after sign-in. */
export interface FolderRef {
  provider: Provider;
  /** Google: folder id. Microsoft: `<driveId>!<itemId>`. */
  id: string;
  name?: string;
  webUrl?: string;
}

/** What Ava needs from a cloud drive: one folder it can list, read and write. */
export interface DriveAdapter {
  readonly folder: FolderRef;
  list(): Promise<DriveFile[]>;
  read(fileId: string): Promise<string>;
  /** Creates the file, or replaces its content if a file with that name exists. */
  write(name: string, content: string, mimeType?: string, existingId?: string): Promise<DriveFile>;
  /** Gives a person edit access to the folder and sends them the drive's invitation email. */
  share(email: string): Promise<void>;
  /**
   * One request per sync (2.12): the folder list with the changed files inside, journals as only the
   * entries after the ones this device has. Drives without it are listed and read file by file.
   */
  sync?(req: DriveSyncRequest): Promise<DriveSyncResult>;
  /**
   * Adds entries to this device's journal in the drive without sending the whole file (2.12.1).
   * Throws DriveError 409 when the drive's copy is not the version and length this device expects.
   */
  append?(req: DriveAppendRequest): Promise<DriveFile>;
}

export interface DriveAppendRequest {
  name: string;
  /** The journal's version in the drive after this device's last upload. */
  base: string;
  /** How many entries the drive has, and the last one's seq and time. */
  from: number;
  seq: number;
  at: string;
  entries: JournalEntry[];
}

/** What this device already has of a file, by file id (or by name when it keeps no id). */
export interface DriveSyncKnown {
  version: string;
  /** Journals: how many entries this device has, and the last one's seq and time. */
  count?: number;
  seq?: number;
  at?: string;
}
export interface DriveSyncRequest {
  /** This device's own journal file name: never sent back. */
  own: string;
  known: Record<string, DriveSyncKnown>;
  /** Administrators also want the sign-in list when it changed. */
  readRoster?: boolean;
}
export type DriveSyncContent =
  | { text: string }
  | { delta: { head: Omit<JournalFile, 'entries'>; from: number; entries: JournalEntry[] } };
export interface DriveSyncResult {
  files: DriveFile[];
  /** Changed files, by id. A changed file missing here (too big for one answer) is read on its own. */
  content: Record<string, DriveSyncContent>;
}

const SYNC_ALWAYS = new Set(['ava-company.json', 'ava-license.json', 'ava-checkpoint.json']);
const isJournalName = (n: string) => n.startsWith('ava-journal-') && n.endsWith('.json');

/** The same answer as the server's drive/sync, for the in-memory drive. */
export function answerSync(files: { id: string; name: string; version: string; content: string }[], req: DriveSyncRequest): DriveSyncResult {
  const content: DriveSyncResult['content'] = {};
  for (const f of files) {
    const k = req.known[f.id] ?? req.known[f.name];
    if (k?.version === f.version || f.name === req.own) continue;
    if (!(SYNC_ALWAYS.has(f.name) || isJournalName(f.name) || (req.readRoster && f.name === 'ava-roster.json'))) continue;
    let delta: Extract<DriveSyncContent, { delta: unknown }>['delta'] | undefined;
    if (isJournalName(f.name) && k?.count) {
      try {
        const { entries, ...head } = JSON.parse(f.content) as JournalFile;
        const last = entries[k.count - 1];
        if (last && last.seq === k.seq && last.at === k.at) delta = { head, from: k.count, entries: entries.slice(k.count) };
      } catch {}
    }
    content[f.id] = delta ? { delta } : { text: f.content };
  }
  return { files: files.map(({ id, name, version }) => ({ id, name, version })), content };
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    /** The server's reason, e.g. "update_required" (2.9). */
    readonly code?: string,
  ) {
    super(message);
  }
  get unauthorized() {
    return this.status === 401;
  }
}

/** An in-memory drive shared by several simulated devices, for tests and the demo. */
export class MemoryDrive {
  files = new Map<string, { name: string; content: string; version: number; modifiedBy: string }>();
  shared = new Set<string>();
  private next = 1;

  /** Requests each device made, by kind, so tests can count them. */
  calls = { list: 0, read: 0, write: 0, sync: 0, append: 0 };

  as(email: string, folderId = 'mem-folder', { batch = false }: { batch?: boolean } = {}): DriveAdapter {
    const self = this;
    const meta = (id: string) => {
      const f = self.files.get(id)!;
      return { id, name: f.name, version: String(f.version), modifiedBy: f.modifiedBy };
    };
    const adapter: DriveAdapter = {
      folder: { provider: 'google', id: folderId },
      async list() {
        self.calls.list++;
        return [...self.files.keys()].map(meta);
      },
      async read(id) {
        self.calls.read++;
        const f = self.files.get(id);
        if (!f) throw new DriveError('Not found', 404);
        return f.content;
      },
      async write(name, content, _mime, existingId) {
        self.calls.write++;
        const id = existingId && self.files.has(existingId) ? existingId : [...self.files].find(([, f]) => f.name === name)?.[0] ?? `f${self.next++}`;
        const prev = self.files.get(id);
        self.files.set(id, { name, content, version: (prev?.version ?? 0) + 1, modifiedBy: email });
        return meta(id);
      },
      async share(who) {
        self.shared.add(who.toLowerCase());
      },
    };
    if (batch) {
      adapter.sync = async (req) => {
        self.calls.sync++;
        return answerSync([...self.files].map(([id, f]) => ({ id, name: f.name, version: String(f.version), content: f.content })), req);
      };
      adapter.append = async (req) => {
        self.calls.append++;
        const hit = [...self.files].find(([, f]) => f.name === req.name);
        const j = hit && (JSON.parse(hit[1].content) as JournalFile);
        const last = j?.entries[req.from - 1];
        if (!hit || !j || String(hit[1].version) !== req.base || j.entries.length !== req.from || last?.seq !== req.seq || last?.at !== req.at) {
          throw new DriveError('The journal in the drive changed. Sending all of it.', 409, 'append_conflict');
        }
        self.files.set(hit[0], { ...hit[1], content: JSON.stringify({ ...j, entries: [...j.entries, ...req.entries] }), version: hit[1].version + 1, modifiedBy: email });
        return meta(hit[0]);
      };
    }
    return adapter;
  }
}
