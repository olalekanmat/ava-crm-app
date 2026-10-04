import { DriveError, type DriveAdapter, type DriveFile, type FolderRef } from './drive';
import { authed, json, type TokenGetter } from './http';
import { COMPANY_FILE } from './journal';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ALL = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
const FIELDS = 'id,name,version,lastModifyingUser(emailAddress),webViewLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface GFile {
  id: string;
  name: string;
  version?: string;
  mimeType?: string;
  webViewLink?: string;
  parents?: string[];
  lastModifyingUser?: { emailAddress?: string };
}

const toFile = (f: GFile): DriveFile => ({ id: f.id, name: f.name, version: f.version ?? '', modifiedBy: f.lastModifyingUser?.emailAddress?.toLowerCase(), webUrl: f.webViewLink });
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Folder id from a Google Drive link (…/folders/<id>, ?id=<id>) or a bare id. */
export function googleFolderId(link: string): string | undefined {
  const s = link.trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : undefined;
}

export function googleDrive(getToken: TokenGetter, folder: FolderRef): DriveAdapter {
  const call = (url: string, init?: RequestInit) => authed(getToken, url, init);
  return {
    folder,
    async list() {
      const out: DriveFile[] = [];
      let page = '';
      do {
        const url = `${API}/files?q=${encodeURIComponent(`'${q(folder.id)}' in parents and trashed=false`)}&fields=nextPageToken,files(${FIELDS})&pageSize=1000&${ALL}${page ? `&pageToken=${page}` : ''}`;
        const r = await json<{ files: GFile[]; nextPageToken?: string }>(await call(url));
        out.push(...r.files.map(toFile));
        page = r.nextPageToken ?? '';
      } while (page);
      return out;
    },
    async read(id) {
      return (await call(`${API}/files/${id}?alt=media&supportsAllDrives=true`)).text();
    },
    async write(name, content, mimeType = 'application/json', existingId) {
      if (existingId) {
        const r = await call(`${UPLOAD}/files/${existingId}?uploadType=media&supportsAllDrives=true&fields=${FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: content });
        return toFile(await json<GFile>(r));
      }
      const boundary = `ava${Math.random().toString(36).slice(2)}`;
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folder.id], mimeType })}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
      const r = await call(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      return toFile(await json<GFile>(r));
    },
    async share(email) {
      await call(`${API}/files/${folder.id}/permissions?sendNotificationEmail=true&supportsAllDrives=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
      });
    },
  };
}

export const google = {
  async me(getToken: TokenGetter) {
    const r = await json<{ email: string; name?: string }>(await authed(getToken, 'https://www.googleapis.com/oauth2/v3/userinfo'));
    return { email: r.email.toLowerCase(), name: r.name ?? r.email };
  },

  async folderFromLink(getToken: TokenGetter, link: string): Promise<FolderRef> {
    const id = googleFolderId(link);
    if (!id) throw new DriveError('That does not look like a Google Drive folder link. Open the folder in Drive and copy the address.');
    const f = await json<GFile>(await authed(getToken, `${API}/files/${id}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`));
    if (f.mimeType !== FOLDER_MIME) throw new DriveError('That link is to a file, not a folder.');
    return { provider: 'google', id: f.id, name: f.name, webUrl: f.webViewLink };
  },

  async createFolder(getToken: TokenGetter, name: string): Promise<FolderRef> {
    const r = await authed(getToken, `${API}/files?fields=id,name,webViewLink&supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    });
    const f = await json<GFile>(r);
    return { provider: 'google', id: f.id, name: f.name, webUrl: f.webViewLink };
  },

  /** Company folders this account can reach (its own and those shared with it). */
  async findCompanyFolders(getToken: TokenGetter): Promise<FolderRef[]> {
    const url = `${API}/files?q=${encodeURIComponent(`name='${COMPANY_FILE}' and trashed=false`)}&fields=files(id,parents)&corpora=allDrives&${ALL}&pageSize=50`;
    const r = await json<{ files: GFile[] }>(await authed(getToken, url));
    const ids = [...new Set(r.files.flatMap((f) => f.parents ?? []))];
    const out: FolderRef[] = [];
    for (const id of ids) {
      try {
        const f = await json<GFile>(await authed(getToken, `${API}/files/${id}?fields=id,name,webViewLink&supportsAllDrives=true`));
        out.push({ provider: 'google', id: f.id, name: f.name, webUrl: f.webViewLink });
      } catch {
        // A parent we cannot open; skip it.
      }
    }
    return out;
  },
};
