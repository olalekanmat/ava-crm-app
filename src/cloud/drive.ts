import type { Provider } from './journal';

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
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 0,
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

  as(email: string, folderId = 'mem-folder'): DriveAdapter {
    const self = this;
    const meta = (id: string) => {
      const f = self.files.get(id)!;
      return { id, name: f.name, version: String(f.version), modifiedBy: f.modifiedBy };
    };
    return {
      folder: { provider: 'google', id: folderId },
      async list() {
        return [...self.files.keys()].map(meta);
      },
      async read(id) {
        const f = self.files.get(id);
        if (!f) throw new DriveError('Not found', 404);
        return f.content;
      },
      async write(name, content, _mime, existingId) {
        const id = existingId && self.files.has(existingId) ? existingId : [...self.files].find(([, f]) => f.name === name)?.[0] ?? `f${self.next++}`;
        const prev = self.files.get(id);
        self.files.set(id, { name, content, version: (prev?.version ?? 0) + 1, modifiedBy: email });
        return meta(id);
      },
      async share(who) {
        self.shared.add(who.toLowerCase());
      },
    };
  }
}
