import * as Crypto from 'expo-crypto';
import { getAccessToken, type AuthProvider } from './auth';
import type { DriveAdapter, FolderRef } from './drive';
import { google, googleDrive } from './google';
import { graph, graphDrive } from './graph';
import { COMPANY_FILE, parseCompanyFile, type CompanyFile, type Provider } from './journal';

export const authFor = (p: Provider): AuthProvider => (p === 'google' ? 'google' : 'microsoft');

export const PROVIDER_LABEL: Record<Provider, string> = { google: 'Google Drive', onedrive: 'OneDrive', sharepoint: 'SharePoint' };

export function adapterFor(folder: FolderRef): DriveAdapter {
  return folder.provider === 'google' ? googleDrive(getAccessToken, folder) : graphDrive(getAccessToken, folder);
}

export function folderFromLink(provider: Provider, link: string): Promise<FolderRef> {
  return provider === 'google' ? google.folderFromLink(getAccessToken, link) : graph.folderFromLink(getAccessToken, provider, link);
}

export function createFolder(provider: Provider, name: string): Promise<FolderRef> {
  return provider === 'google' ? google.createFolder(getAccessToken, name) : graph.createFolder(getAccessToken, name).then((f) => ({ ...f, provider }));
}

/** Reads the company file in a folder, if it has one. */
export async function readCompany(folder: FolderRef): Promise<CompanyFile | undefined> {
  const drive = adapterFor(folder);
  const f = (await drive.list()).find((x) => x.name === COMPANY_FILE);
  return f ? parseCompanyFile(await drive.read(f.id)) : undefined;
}

/** Companies this account can open: folders with an ava-company.json it can reach. */
export async function findCompanies(provider: AuthProvider): Promise<{ folder: FolderRef; company: CompanyFile }[]> {
  const folders = provider === 'google' ? await google.findCompanyFolders(getAccessToken) : await graph.findCompanyFolders(getAccessToken, 'onedrive');
  const out: { folder: FolderRef; company: CompanyFile }[] = [];
  for (const folder of folders) {
    try {
      const company = await readCompany(folder);
      if (company) out.push({ folder: { ...folder, provider: company.provider === 'google' ? 'google' : company.provider }, company });
    } catch {
      // Skip folders we cannot read.
    }
  }
  return out;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

/** Random id safe for file names and URLs. */
export const randomId = (prefix: string, bytes = 12) => `${prefix}_${b64url(Crypto.getRandomBytes(bytes)).replace(/[-_]/g, 'x')}`;
export const randomKey = () => b64url(Crypto.getRandomBytes(32));
