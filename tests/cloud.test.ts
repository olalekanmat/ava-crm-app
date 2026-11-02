import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { DriveError, MemoryDrive, normalizeProvider, providerAccount, providerLabel } from '../src/cloud/drive';
import { COMPANY_FILE, journalName, type CompanyFile, type JournalFile } from '../src/cloud/journal';
import { licenseState, verifyToken, type LicenseFile } from '../src/cloud/license';
import { createCompany, EXPORT_FILES, newCache, pendingCount, rebuild, rosterKey, syncOnce, writeLicense, type CloudCache } from '../src/cloud/sync';
import { applyMutation, type Mutation } from '../src/data/mutations';
import type { Account, Call, User } from '../src/data/types';

const T0 = Date.parse('2026-10-04T08:00:00Z');
const at = (min: number) => new Date(T0 + min * 60000);

const genesis: CompanyFile = {
  format: 'ava-crm/1',
  companyId: 'cmp_test123456789',
  createdAt: at(0).toISOString(),
  createdBy: 'boss@acme.com',
  provider: 'google',
  company: { name: 'Acme Pharma' },
  admin: { id: 'usr_admin', name: 'Bola Admin', email: 'boss@acme.com', role: 'Admin', active: true, createdAt: at(0).toISOString() },
};

const flm: User = { id: 'usr_flm', name: 'Femi FLM', email: 'femi@acme.com', role: 'FLM', active: true, createdAt: at(0).toISOString() };
const rep: User = { id: 'usr_rep', name: 'Rita Rep', email: 'rita@acme.com', role: 'Rep', managerId: 'usr_flm', territory: 'Ikeja', active: true, createdAt: at(0).toISOString() };
const account: Account = { id: 'acc_1', type: 'HCP', name: 'Dr. One', specialty: 'GP', tier: 'T1', address: '', city: 'Ikeja', ownerId: 'usr_rep', createdAt: at(0).toISOString() };

/** A simulated phone: its own cache, applying changes locally like the app does. */
class Device {
  cache: CloudCache;
  constructor(
    private drive: MemoryDrive,
    readonly email: string,
    userId: string,
    deviceId: string,
    private batch = false,
  ) {
    this.cache = newCache(genesis.companyId, userId, email, deviceId);
  }
  run(m: Mutation, when: Date) {
    // Check the rules locally first, as the app does.
    const s = rebuild(this.cache, when)?.snapshot;
    if (s) applyMutation(s, m, s.users.find((u) => u.id === this.cache.own.userId)!, when);
    this.cache = { ...this.cache, own: { ...this.cache.own, entries: [...this.cache.own.entries, { seq: this.cache.own.entries.length + 1, at: when.toISOString(), m }] } };
  }
  async sync(when: Date, writeExports = false) {
    const r = await syncOnce(this.drive.as(this.email, undefined, { batch: this.batch }), this.cache, { now: when, writeExports });
    this.cache = r.cache;
    return r.result!;
  }
}

async function company(batch = false) {
  const drive = new MemoryDrive();
  await createCompany(drive.as('boss@acme.com'), genesis);
  const admin = new Device(drive, 'boss@acme.com', 'usr_admin', 'dA', batch);
  return { drive, admin };
}

for (const batch of [false, true]) test(`admin sets up a company; a rep and FLM join, work offline and sync${batch ? ' (one request per sync, 2.12)' : ''}`, async () => {
  const { drive, admin } = await company(batch);
  const setupLists = drive.calls.list;
  await assert.rejects(createCompany(drive.as('boss@acme.com'), genesis), /already has/);

  admin.run({ type: 'company.update', company: { name: 'Acme Pharma Ltd', city: 'Lagos' } }, at(1));
  admin.run({ type: 'import.users', users: [flm, rep] }, at(2));
  admin.run({ type: 'import.accounts', accounts: [account] }, at(3));
  admin.run({ type: 'cycle.upsert', cycle: { id: 'cyc_1', name: 'Cycle 1', start: '2026-10-01', end: '2026-11-25' } }, at(4));
  assert.equal(pendingCount(admin.cache), 4);
  let r = await admin.sync(at(5));
  assert.equal(pendingCount(admin.cache), 0);
  assert.equal(r.snapshot.company.name, 'Acme Pharma Ltd');
  assert.equal(r.snapshot.users.length, 3);
  assert.ok(drive.files.size >= 2);

  const ritaPhone = new Device(drive, 'rita@acme.com', 'usr_rep', 'dR', batch);
  const femiPhone = new Device(drive, 'femi@acme.com', 'usr_flm', 'dF', batch);
  await ritaPhone.sync(at(6));
  await femiPhone.sync(at(6));

  // Rita works offline: logs a call and submits her plan.
  const call: Call = { id: 'call_1', accountId: 'acc_1', ownerId: 'usr_rep', datetime: at(10).toISOString(), channel: 'In person', status: 'Submitted', products: [{ product: 'X', priority: 1 }], keyMessages: [], createdAt: at(10).toISOString(), updatedAt: at(10).toISOString() };
  ritaPhone.run({ type: 'call.save', call }, at(20));
  ritaPhone.run({ type: 'plan.save', plan: { id: 'pln_1', ownerId: 'usr_rep', cycleId: 'q2026-4', status: 'Draft', targets: [{ accountId: 'acc_1', planned: 6 }], updatedAt: at(21).toISOString() } }, at(21));
  ritaPhone.run({ type: 'plan.submit', id: 'pln_1' }, at(22));
  assert.equal(rebuild(ritaPhone.cache, at(22))!.snapshot.calls.length, 1, 'visible on the phone before syncing');
  assert.equal((await femiPhone.sync(at(23))).snapshot.calls.length, 0, 'not on the FLM’s phone until Rita syncs');

  await ritaPhone.sync(at(30));
  r = await femiPhone.sync(at(31));
  assert.equal(r.snapshot.calls.length, 1);
  assert.equal(r.snapshot.plans[0].status, 'Submitted');

  femiPhone.run({ type: 'plan.review', id: 'pln_1', approve: true }, at(32));
  await femiPhone.sync(at(33));
  r = await ritaPhone.sync(at(34));
  assert.equal(r.snapshot.plans[0].status, 'Approved');
  assert.equal(r.snapshot.plans[0].reviewerId, 'usr_flm');

  // Every device ends up with the same data.
  const a = (await admin.sync(at(40))).snapshot;
  assert.deepEqual(a, (await ritaPhone.sync(at(40))).snapshot);
  assert.deepEqual(a, (await femiPhone.sync(at(40))).snapshot);
  if (batch) assert.deepEqual([drive.calls.list - setupLists, drive.calls.read], [1, 0], 'every sync was one request, nothing read file by file (one list from the second company set-up attempt)');
  else assert.ok(drive.calls.read > 0);
});

test('replay drops changes that break the rules, the same way on every device', async () => {
  const { drive, admin } = await company();
  admin.run({ type: 'import.users', users: [flm, rep] }, at(1));
  admin.run({ type: 'import.accounts', accounts: [account] }, at(2));
  await admin.sync(at(3));

  // A modified app writes a change the rules do not allow: a rep making themselves admin.
  const evil: JournalFile = {
    format: 'ava-journal/1', companyId: genesis.companyId, userId: 'usr_rep', email: 'rita@acme.com', deviceId: 'hack',
    entries: [{ seq: 1, at: at(4).toISOString(), m: { type: 'user.upsert', user: { ...rep, role: 'Admin' } } }],
  };
  await drive.as('rita@acme.com').write(journalName('usr_rep', 'hack'), JSON.stringify(evil));
  const r = await admin.sync(at(5));
  assert.equal(r.snapshot.users.find((u) => u.id === 'usr_rep')!.role, 'Rep');
  assert.match(r.log.find((l) => l.deviceId === 'hack')!.error!, /administrator/);

  // Someone edits another person's journal directly in the drive: the file is ignored.
  const forged: JournalFile = { ...evil, userId: 'usr_admin', email: 'boss@acme.com', deviceId: 'forged', entries: [{ seq: 1, at: at(6).toISOString(), m: { type: 'user.upsert', user: { ...rep, role: 'Admin' } } }] };
  await drive.as('rita@acme.com').write(journalName('usr_admin', 'forged'), JSON.stringify(forged));
  const r2 = await admin.sync(at(7));
  assert.equal(r2.snapshot.users.find((u) => u.id === 'usr_rep')!.role, 'Rep');
  assert.ok(r2.warnings.some((w) => /last changed by rita@acme.com/.test(w)));

  // A deactivated user's later changes do not apply.
  admin.run({ type: 'user.upsert', user: { ...rep, active: false } }, at(8));
  await admin.sync(at(9));
  const ritaPhone = new Device(drive, 'rita@acme.com', 'usr_rep', 'dR');
  ritaPhone.cache = { ...ritaPhone.cache, own: { ...ritaPhone.cache.own, entries: [{ seq: 1, at: at(10).toISOString(), m: { type: 'account.pin', id: 'acc_1', lat: 6.5, lng: 3.3 } }] } };
  const r3 = await ritaPhone.sync(at(11));
  assert.equal(r3.snapshot.accounts[0].lat, undefined);
  assert.match(r3.log.at(-1)!.error!, /not an active user/);
});

test('company file tampering and wrong folders are refused', async () => {
  const { drive, admin } = await company();
  await admin.sync(at(1));
  const other = newCache('cmp_other', 'usr_admin', 'boss@acme.com', 'dX');
  await assert.rejects(syncOnce(drive.as('boss@acme.com'), other), /different company/);
  const id = [...drive.files].find(([, f]) => f.name === COMPANY_FILE)![0];
  await drive.as('rita@acme.com').write(COMPANY_FILE, JSON.stringify({ ...genesis, admin: { ...genesis.admin, email: 'rita@acme.com' } }), 'application/json', id);
  await assert.rejects(new Device(drive, 'rita@acme.com', 'usr_rep', 'dR').sync(at(2)), /changed by rita@acme.com/);
});

test('admin device writes readable CSV copies to the drive, at most hourly', async () => {
  const { drive, admin } = await company();
  admin.run({ type: 'import.users', users: [flm, rep] }, at(1));
  await admin.sync(at(2), true);
  const names = () => [...drive.files.values()].map((f) => f.name);
  assert.ok(names().includes(EXPORT_FILES.calls) && names().includes(EXPORT_FILES.users));
  const users = [...drive.files.values()].find((f) => f.name === EXPORT_FILES.users)!;
  assert.match(users.content, /rita@acme.com/);
  const v = users.version;
  await admin.sync(at(30), true);
  assert.equal(users.version, v, 'not rewritten within the hour');
  await admin.sync(at(70), true);
  assert.equal([...drive.files.values()].find((f) => f.name === EXPORT_FILES.users)!.version, v + 1);
});

test('licence tokens: signature, company, expiry and revocation', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'jwk' }).x!;
  const b64url = (b: Buffer) => b.toString('base64url');
  const make = (payload: object, key = privateKey) => {
    const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
    return `${body}.${b64url(sign(null, Buffer.from(body, 'ascii'), key))}`;
  };
  const payload = { v: 1, companyId: genesis.companyId, company: 'Acme Pharma — Lagos', adminEmail: 'boss@acme.com', issuedAt: at(0).toISOString(), expiresAt: at(14 * 24 * 60).toISOString(), subscriptionEnd: at(90 * 24 * 60).toISOString() };
  const token = make(payload);
  assert.equal(verifyToken(token, pub)?.company, 'Acme Pharma — Lagos');
  const flip = (t: string, i: number) => t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1);
  assert.equal(verifyToken(flip(token, token.length - 10), pub), undefined, 'changed signature');
  assert.equal(verifyToken(flip(token, 5), pub), undefined, 'changed payload');
  assert.equal(verifyToken(make(payload, generateKeyPairSync('ed25519').privateKey), pub), undefined, 'another server’s key');

  const file: LicenseFile = { companyId: genesis.companyId, server: 'https://x', statusKey: 'k', status: 'active', token, requestedAt: at(0).toISOString(), updatedAt: at(0).toISOString() };
  const st = licenseState(file, genesis.companyId, at(60), pub);
  assert.equal(st.state, 'active');
  assert.equal(st.state === 'active' && st.daysLeft, 90);
  assert.equal(licenseState(file, genesis.companyId, at(15 * 24 * 60), pub).state, 'expired', 'token lapses after 14 days offline');
  assert.equal(licenseState(file, 'cmp_someone_else', at(60), pub).state, 'invalid');
  assert.equal(licenseState({ ...file, status: 'revoked' }, genesis.companyId, at(60), pub).state, 'revoked');
  assert.equal(licenseState({ ...file, status: 'pending', token: undefined }, genesis.companyId, at(60), pub).state, 'pending');

  // The licence file travels through the drive to every device.
  const { drive, admin } = await company();
  await admin.sync(at(1));
  admin.cache = await writeLicense(drive.as('boss@acme.com'), admin.cache, file);
  const phone = new Device(drive, 'rita@acme.com', 'usr_rep', 'dR');
  await phone.sync(at(2));
  assert.equal(phone.cache.license?.token, token);
});

test('a device restored from an old copy keeps the changes already in the drive', async () => {
  const { admin } = await company();
  admin.run({ type: 'user.upsert', user: flm }, at(1));
  await admin.sync(at(2));
  const stale = structuredClone(admin.cache);
  admin.run({ type: 'user.upsert', user: rep }, at(3));
  await admin.sync(at(4));
  // The browser comes back with the older copy and makes another change.
  admin.cache = stale;
  admin.run({ type: 'user.upsert', user: { ...flm, id: 'usr_flm2', email: 'f2@acme.com' } }, at(5));
  const r = await admin.sync(at(6));
  assert.ok(r.snapshot.users.some((u) => u.id === 'usr_rep'), 'the rep added after the old copy is still there');
  assert.ok(r.snapshot.users.some((u) => u.id === 'usr_flm2'), 'the new change is kept too');
  assert.deepEqual(admin.cache.own.entries.map((e) => e.seq), [1, 2, 3]);
});

test('admins read the sign-in list in the drive when it changes', async () => {
  const { drive, admin } = await company();
  await admin.sync(at(1));
  assert.equal(admin.cache.remoteRosterVersion, undefined);
  await drive.as('boss@acme.com').write('ava-roster.json', JSON.stringify({ users: [{ id: 'b', name: 'B', email: 'B@x.com', role: 'Rep', active: true }, { id: 'a', name: 'A', email: 'a@x.com', role: 'Admin' }] }));
  const r = await syncOnce(drive.as('boss@acme.com'), admin.cache, { now: at(2), readRoster: true });
  assert.equal(r.cache.remoteRosterVersion, '1');
  assert.equal(r.cache.remoteRoster, rosterKey([{ id: 'a', name: 'A', email: 'a@x.com', role: 'Admin', active: true }, { id: 'b', name: 'B', email: 'b@x.com', role: 'Rep', active: true }]));
});

test('a failed CSV copy does not fail the sync', async () => {
  const { drive, admin } = await company();
  const d = drive.as('boss@acme.com');
  const failing = { ...d, write: async (name: string, content: string, mime?: string, id?: string) => (name.endsWith('.csv') ? Promise.reject(new Error('403')) : d.write(name, content, mime, id)) };
  const r = await syncOnce(failing, admin.cache, { now: at(1), writeExports: true });
  assert.ok(r.result);
  assert.equal(r.cache.lastExport, undefined);
});

test('an upload the cache did not record is not added to the journal twice', async () => {
  const { admin } = await company();
  admin.run({ type: 'user.upsert', user: flm }, at(1));
  await admin.sync(at(2));
  const before = structuredClone(admin.cache);
  admin.run({ type: 'user.upsert', user: rep }, at(3));
  await admin.sync(at(4));
  // The app closed after uploading but before saving: same entries, old upload count and version.
  admin.cache = { ...before, own: admin.cache.own };
  await admin.sync(at(5));
  assert.deepEqual(admin.cache.own.entries.map((e) => e.seq), [1, 2]);
});

test('drive providers: OneDrive unless the server says Google Drive', () => {
  assert.equal(normalizeProvider(undefined), 'onedrive');
  assert.equal(normalizeProvider('google'), 'google');
  assert.equal(normalizeProvider('sharepoint'), 'sharepoint');
  assert.equal(normalizeProvider('dropbox'), 'onedrive');
  assert.equal(providerLabel('google'), 'Google Drive');
  assert.equal(providerLabel(undefined), 'OneDrive');
  assert.equal(providerAccount('google'), 'Google');
  assert.equal(providerAccount('onedrive'), 'Microsoft');
});

test('one-request sync (2.12) adds only new journal entries, and falls back for older servers', async () => {
  const drive = new MemoryDrive();
  await createCompany(drive.as('boss@acme.com'), genesis);
  const admin = new Device(drive, 'boss@acme.com', 'usr_admin', 'dA', true);
  admin.run({ type: 'import.users', users: [flm, rep] }, at(1));
  admin.run({ type: 'import.accounts', accounts: [account] }, at(2));
  await admin.sync(at(3));
  const rita = new Device(drive, 'rita@acme.com', 'usr_rep', 'dR', true);
  await rita.sync(at(4));

  // The server sends only the admin's new entry; Rita's copy of the admin's journal grows by one.
  const seen: unknown[] = [];
  const spy = drive.as('rita@acme.com', undefined, { batch: true });
  const inner = spy.sync!;
  spy.sync = async (req) => {
    const res = await inner(req);
    seen.push(...Object.values(res.content));
    return res;
  };
  admin.run({ type: 'company.update', company: { name: 'Acme Two', city: 'Lagos' } }, at(5));
  await admin.sync(at(6));
  const r = await syncOnce(spy, rita.cache, { now: at(7) });
  assert.equal(r.result!.snapshot.company.name, 'Acme Two');
  assert.equal(seen.length, 1);
  const only = seen[0] as { delta?: { from: number; entries: unknown[] } };
  assert.equal(only.delta?.from, 2);
  assert.equal(only.delta?.entries.length, 1);

  // A server without drive/sync answers 404: the device lists and reads as before, with the same result.
  const old = drive.as('rita@acme.com');
  let tried = 0;
  old.sync = async () => {
    tried++;
    throw new DriveError('Not found', 404);
  };
  const viaOld = await syncOnce(old, newCache(genesis.companyId, 'usr_rep', 'rita@acme.com', 'dR2'), { now: at(8) });
  assert.equal(tried, 1);
  assert.deepEqual(viaOld.result!.snapshot, (await syncOnce(spy, r.cache, { now: at(8) })).result!.snapshot);
});

test('uploads send only new entries (2.12.1); a changed copy in the drive gets the whole journal', async () => {
  const drive = new MemoryDrive();
  await createCompany(drive.as('boss@acme.com'), genesis);
  const admin = new Device(drive, 'boss@acme.com', 'usr_admin', 'dA', true);
  admin.run({ type: 'import.users', users: [flm, rep] }, at(1));
  await admin.sync(at(2));
  assert.equal(drive.calls.append, 0, 'the first upload creates the file');
  admin.run({ type: 'import.accounts', accounts: [account] }, at(3));
  await admin.sync(at(4));
  assert.equal(drive.calls.append, 1);
  const id = [...drive.files].find(([, f]) => f.name === journalName('usr_admin', 'dA'))![0];
  const entries = () => (JSON.parse(drive.files.get(id)!.content) as JournalFile).entries;
  assert.equal(entries().length, 2);

  // Someone else's copy of this journal lands in the drive (e.g. a restored browser) while this
  // device still thinks it has the latest: no blind append.
  const writes = drive.calls.write;
  const f = drive.files.get(id)!;
  drive.files.set(id, { ...f, content: JSON.stringify({ ...(JSON.parse(f.content) as JournalFile), entries: entries().slice(0, 1) }) });
  admin.run({ type: 'company.update', company: { name: 'Acme Three', city: 'Lagos' } }, at(5));
  const r = await admin.sync(at(6));
  assert.equal(drive.calls.append, 2, 'tried to append');
  assert.equal(drive.calls.write, writes + 1, 'then sent the whole journal');
  assert.equal(entries().length, 3);
  assert.equal(r.snapshot.company.name, 'Acme Three');
});
