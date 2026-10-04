import Constants from 'expo-constants';
import type { CloudSession } from '../data/store';
import { addDays, toDateKey } from '../data/dates';
import type { Company } from '../data/types';
import type { CloudAccount } from './auth';
import { adapterFor, randomId, randomKey, readCompany } from './connect';
import type { FolderRef } from './drive';
import type { CompanyFile, Provider } from './journal';
import { licenseApi, type LicenseFile } from './license';
import { createCompany, newCache, rebuild, syncOnce, writeLicense, type CloudCache } from './sync';

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

export interface NewCompany {
  account: CloudAccount;
  provider: Provider;
  folder: FolderRef;
  company: Company;
  server: string;
}

/**
 * Sets up a new company in an empty folder: writes the company file, the admin's first changes
 * (profile, a first cycle) and the licence request, then asks the approval server to approve it.
 * Returns the session to enter. A failed approval request is reported but does not undo setup;
 * the admin can send it again from Company & approval.
 */
export async function setUpCompany(n: NewCompany): Promise<{ session: CloudSession; cache: CloudCache; registerError?: string }> {
  const now = new Date();
  const companyId = randomId('cmp', 15);
  const admin = { id: randomId('usr', 9), name: n.account.name, email: n.account.email, role: 'Admin' as const, active: true, createdAt: now.toISOString() };
  const genesis: CompanyFile = { format: 'ava-crm/1', companyId, createdAt: now.toISOString(), createdBy: n.account.email, provider: n.provider, company: { name: n.company.name }, admin };
  const drive = adapterFor(n.folder);
  await createCompany(drive, genesis);

  const dev = await deviceId();
  let cache = newCache(companyId, admin.id, admin.email, dev);
  const at = now.toISOString();
  cache.own.entries = [
    { seq: 1, at, m: { type: 'company.update', company: n.company } },
    { seq: 2, at, m: { type: 'cycle.upsert', cycle: { id: randomId('cyc', 6), name: 'Cycle 1', start: toDateKey(now), end: toDateKey(addDays(now, 55)) } } },
  ];

  const license: LicenseFile = { companyId, server: n.server.trim().replace(/\/+$/, ''), statusKey: randomKey(), status: 'pending', requestedAt: at, updatedAt: at };
  let registerError: string | undefined;
  try {
    const r = await requestApproval(license, n.company, admin, n.folder);
    license.status = r.status;
  } catch (e) {
    registerError = e instanceof Error ? e.message : String(e);
  }
  cache = await writeLicense(drive, cache, license);
  cache = (await syncOnce(drive, cache)).cache;
  return { session: { mode: 'cloud', userId: admin.id, email: admin.email, companyId, folder: n.folder, deviceId: dev }, cache, registerError };
}

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

/** Opens an existing company folder as the signed-in person. */
export async function joinCompany(account: CloudAccount, folder: FolderRef): Promise<{ session: CloudSession; cache: CloudCache }> {
  const g = await readCompany(folder);
  if (!g) throw new Error('This folder does not contain an Ava CRM company. Check the link with your administrator.');
  const ref = { ...folder, provider: g.provider };
  const drive = adapterFor(ref);
  // Read everything first to find this person in the company.
  const probe = await syncOnce(drive, newCache(g.companyId, '', account.email, 'probe'));
  const users = rebuild(probe.cache)?.snapshot.users ?? [];
  const me = users.find((u) => u.email.toLowerCase() === account.email.toLowerCase());
  if (!me) throw new Error(`${account.email} is not a user of ${probe.result?.snapshot.company.name || g.company.name}. Ask your administrator to add you under Users & roles.`);
  if (!me.active) throw new Error(`Your access to ${g.company.name} has been switched off by an administrator.`);
  const dev = await deviceId();
  // If this device used the company before, carry on with its existing journal instead of overwriting it.
  const journals = { ...probe.cache.journals };
  const previous = Object.entries(journals).find(([, j]) => j.journal.userId === me.id && j.journal.deviceId === dev);
  if (previous) delete journals[previous[0]];
  const cache: CloudCache = previous
    ? { ...probe.cache, journals, own: previous[1].journal, ownFileId: previous[0], uploaded: previous[1].journal.entries.length }
    : { ...probe.cache, journals, own: newCache(g.companyId, me.id, me.email, dev).own, ownFileId: undefined, uploaded: 0 };
  return { session: { mode: 'cloud', userId: me.id, email: me.email, companyId: g.companyId, folder: ref, deviceId: dev }, cache };
}
