import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { MemoryDrive } from '../src/cloud/drive';
import { COMPANY_FILE, journalName, type CompanyFile, type JournalFile } from '../src/cloud/journal';
import { licenseState, verifyToken, type LicenseFile } from '../src/cloud/license';
import { createCompany, EXPORT_FILES, newCache, pendingCount, rebuild, syncOnce, writeLicense, type CloudCache } from '../src/cloud/sync';
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
    const r = await syncOnce(this.drive.as(this.email), this.cache, { now: when, writeExports });
    this.cache = r.cache;
    return r.result!;
  }
}

async function company() {
  const drive = new MemoryDrive();
  await createCompany(drive.as('boss@acme.com'), genesis);
  const admin = new Device(drive, 'boss@acme.com', 'usr_admin', 'dA');
  return { drive, admin };
}

test('admin sets up a company; a rep and FLM join, work offline and sync', async () => {
  const { drive, admin } = await company();
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

  const ritaPhone = new Device(drive, 'rita@acme.com', 'usr_rep', 'dR');
  const femiPhone = new Device(drive, 'femi@acme.com', 'usr_flm', 'dF');
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

test('the roster version in the drive is reported so admins can notice an outside rewrite', async () => {
  const { drive, admin } = await company();
  await admin.sync(at(1));
  assert.equal(admin.cache.remoteRosterVersion, undefined);
  await drive.as('boss@acme.com').write('ava-roster.json', '{}');
  await admin.sync(at(2));
  assert.equal(admin.cache.remoteRosterVersion, '1');
});

test('a failed CSV copy does not fail the sync', async () => {
  const { drive, admin } = await company();
  const d = drive.as('boss@acme.com');
  const failing = { ...d, write: async (name: string, content: string, mime?: string, id?: string) => (name.endsWith('.csv') ? Promise.reject(new Error('403')) : d.write(name, content, mime, id)) };
  const r = await syncOnce(failing, admin.cache, { now: at(1), writeExports: true });
  assert.ok(r.result);
  assert.equal(r.cache.lastExport, undefined);
});
