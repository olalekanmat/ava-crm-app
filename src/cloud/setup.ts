import Constants from 'expo-constants';
import type { CloudSession } from '../data/store';
import type { Company } from '../data/types';
import { adapterFor, randomId } from './connect';
import { normalizeProvider, type FolderRef } from './drive';
import { licenseApi, type LicenseFile } from './license';
import type { LoginResult } from './relay';
import { newCache, rebuild, syncOnce, type CloudCache } from './sync';

const DEVICE_KEY = 'ava.device';

/** A stable id for this install, so each device writes its own journal. */
export async function deviceId(): Promise<string> {
  const { loadJson, saveJson } = await import('../data/storage');
  const saved = await loadJson<string>(DEVICE_KEY);
  if (saved) return saved;
  const id = randomId('d', 6).slice(2);
  await saveJson(DEVICE_KEY, id);
  return id;
}

/** Re-sends the company's approval request (admin, from Company & approval). */
export function requestApproval(license: LicenseFile, company: Company, admin: { name: string; email: string }, folder: FolderRef) {
  return licenseApi.register(license.server, {
    companyId: license.companyId,
    statusKey: license.statusKey,
    company: { name: company.name, address: [company.address, company.city].filter(Boolean).join(', ') || undefined, country: company.country, phone: company.phone, email: company.email, website: company.website },
    admin: { name: admin.name, email: admin.email },
    drive: { provider: folder.provider, folderUrl: folder.webUrl ?? folder.id },
    server: license.server,
    appVersion: Constants.expoConfig?.version,
  });
}

/**
 * Opens the company after a successful sign-in: reads everything once, finds this person,
 * and carries on with this device's earlier journal if it has one.
 */
export async function openCompany(login: LoginResult): Promise<{ session: CloudSession; cache: CloudCache }> {
  const folder: FolderRef = { provider: normalizeProvider(login.provider), id: login.companyId, name: login.companyName };
  const drive = adapterFor(folder);
  const dev = await deviceId();
  const probe = await syncOnce(drive, newCache(login.companyId, login.user.id, login.user.email, `probe${dev}`));
  const me = rebuild(probe.cache)?.snapshot.users.find((u) => u.id === login.user.id);
  if (!me) throw new Error('Your account was not found in the company data yet. Ask your administrator to open Ava CRM so the change uploads, then try again.');
  if (!me.active) throw new Error('Your access has been switched off by your administrator.');
  const journals = { ...probe.cache.journals };
  const previous = Object.entries(journals).find(([, j]) => j.journal.userId === me.id && j.journal.deviceId === dev);
  if (previous) delete journals[previous[0]];
  const cache: CloudCache = previous
    ? { ...probe.cache, journals, own: previous[1].journal, ownFileId: previous[0], uploaded: previous[1].journal.entries.length }
    : { ...probe.cache, journals, own: newCache(login.companyId, me.id, me.email, dev).own, ownFileId: undefined, uploaded: 0 };
  return { session: { mode: 'cloud', userId: me.id, email: me.email, companyId: login.companyId, companyCode: login.companyCode, folder, deviceId: dev }, cache };
}
