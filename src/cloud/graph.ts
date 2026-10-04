import { DriveError, type DriveAdapter, type DriveFile, type FolderRef } from './drive';
import { authed, json, type TokenGetter } from './http';
import { COMPANY_FILE, type Provider } from './journal';

/** Microsoft Graph: OneDrive (personal or work) and SharePoint document libraries. */
const API = 'https://graph.microsoft.com/v1.0';
const SELECT = 'id,name,eTag,cTag,webUrl,lastModifiedBy,parentReference,folder,file';

interface GItem {
  id: string;
  name: string;
  eTag?: string;
  cTag?: string;
  webUrl?: string;
  folder?: unknown;
  file?: unknown;
  parentReference?: { driveId?: string; id?: string };
  lastModifiedBy?: { user?: { email?: string; displayName?: string } };
  remoteItem?: GItem;
  '@microsoft.graph.downloadUrl'?: string;
}

const split = (ref: FolderRef) => {
  const [driveId, itemId] = ref.id.split('!');
  return { driveId, itemId };
};
const toFile = (i: GItem): DriveFile => ({ id: i.id, name: i.name, version: i.cTag ?? i.eTag ?? '', modifiedBy: i.lastModifiedBy?.user?.email?.toLowerCase(), webUrl: i.webUrl });
const folderRef = (provider: Provider, i: GItem): FolderRef => ({ provider, id: `${i.parentReference?.driveId}!${i.id}`, name: i.name, webUrl: i.webUrl });

/** Graph's sharing-link id: "u!" + unpadded base64url of the URL. */
export function shareId(url: string): string {
  const bytes = unescape(encodeURIComponent(url.trim()));
  const b64 = btoa(bytes);
  return `u!${b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
}

export function graphDrive(getToken: TokenGetter, folder: FolderRef): DriveAdapter {
  const { driveId, itemId } = split(folder);
  const call = (url: string, init?: RequestInit) => authed(getToken, url, init);
  return {
    folder,
    async list() {
      const out: DriveFile[] = [];
      let url: string | undefined = `${API}/drives/${driveId}/items/${itemId}/children?$select=${SELECT}&$top=999`;
      while (url) {
        const r: { value: GItem[]; '@odata.nextLink'?: string } = await json(await call(url));
        out.push(...r.value.filter((i) => i.file).map(toFile));
        url = r['@odata.nextLink'];
      }
      return out;
    },
    async read(id) {
      // The download URL is pre-authorised and avoids a cross-origin redirect in browsers.
      const meta = await json<GItem>(await call(`${API}/drives/${driveId}/items/${id}?$select=id,@microsoft.graph.downloadUrl`));
      const url = meta['@microsoft.graph.downloadUrl'];
      if (!url) return (await call(`${API}/drives/${driveId}/items/${id}/content`)).text();
      const res = await fetch(url);
      if (!res.ok) throw new DriveError(`Download failed (${res.status}).`, res.status);
      return res.text();
    },
    async write(name, content, mimeType = 'application/json', existingId) {
      const url = existingId
        ? `${API}/drives/${driveId}/items/${existingId}/content`
        : `${API}/drives/${driveId}/items/${itemId}:/${encodeURIComponent(name)}:/content`;
      const r = await call(url, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: content });
      return toFile(await json<GItem>(r));
    },
    async share(email) {
      await call(`${API}/drives/${driveId}/items/${itemId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: [{ email }], requireSignIn: true, sendInvitation: true, roles: ['write'], message: 'You have been added to your company’s Ava CRM folder. Install Ava CRM and sign in with this account.' }),
      });
    },
  };
}

export const graph = {
  async me(getToken: TokenGetter) {
    const r = await json<{ displayName?: string; mail?: string; userPrincipalName: string }>(await authed(getToken, `${API}/me?$select=displayName,mail,userPrincipalName`));
    const email = (r.mail || r.userPrincipalName).toLowerCase();
    return { email, name: r.displayName || email };
  },

  /** Resolves a OneDrive or SharePoint folder link (a sharing link or the address bar URL). */
  async folderFromLink(getToken: TokenGetter, provider: Provider, link: string): Promise<FolderRef> {
    if (!/^https:\/\//.test(link.trim())) throw new DriveError('Paste the full folder link, starting with https://');
    let item: GItem;
    try {
      item = await json<GItem>(await authed(getToken, `${API}/shares/${shareId(link)}/driveItem?$select=${SELECT}`));
    } catch (e) {
      if (e instanceof DriveError && (e.status === 400 || e.status === 404)) {
        throw new DriveError('Could not open that link. In OneDrive or SharePoint, use Share > Copy link on the folder, and make sure your account can open it.', e.status);
      }
      throw e;
    }
    if (!item.folder) throw new DriveError('That link is to a file, not a folder.');
    return folderRef(provider, item);
  },

  async createFolder(getToken: TokenGetter, name: string): Promise<FolderRef> {
    const r = await authed(getToken, `${API}/me/drive/root/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    });
    return folderRef('onedrive', await json<GItem>(r));
  },

  /** Company folders this account can reach: its own, and folders shared with it. */
  async findCompanyFolders(getToken: TokenGetter, provider: Provider): Promise<FolderRef[]> {
    const out = new Map<string, FolderRef>();
    try {
      const r = await json<{ value: GItem[] }>(await authed(getToken, `${API}/me/drive/root/search(q='${COMPANY_FILE}')?$select=id,name,parentReference`));
      for (const i of r.value.filter((x) => x.name === COMPANY_FILE && x.parentReference?.driveId && x.parentReference.id)) {
        const p = await json<GItem>(await authed(getToken, `${API}/drives/${i.parentReference!.driveId}/items/${i.parentReference!.id}?$select=${SELECT}`));
        out.set(p.id, folderRef(provider, p));
      }
    } catch {
      // Search is not available on every account type.
    }
    try {
      const shared = await json<{ value: GItem[] }>(await authed(getToken, `${API}/me/drive/sharedWithMe`));
      for (const s of shared.value) {
        const ri = s.remoteItem;
        if (!ri?.folder || !ri.parentReference?.driveId) continue;
        const ref = folderRef(provider, { ...ri, name: ri.name ?? s.name });
        const kids = await graphDrive(getToken, ref).list();
        if (kids.some((k) => k.name === COMPANY_FILE)) out.set(ri.id, ref);
      }
    } catch {
      // Not every tenant allows listing shared items.
    }
    return [...out.values()];
  },
};
