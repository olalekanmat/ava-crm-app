import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryDrive } from '../src/cloud/drive';
import type { CompanyFile } from '../src/cloud/journal';
import { cacheAs, createCompany, newCache, pendingCount, rebuild, syncOnce, type CloudCache } from '../src/cloud/sync';
import type { Call, User } from '../src/data/types';

// 2.10: an administrator signs in as one of their people on their own device.

const T0 = Date.parse('2026-10-11T08:00:00Z');
const at = (min: number) => new Date(T0 + min * 60000);
const genesis: CompanyFile = {
  format: 'ava-crm/1', companyId: 'cmp_test123456789', createdAt: at(0).toISOString(), createdBy: 'boss@acme.com', provider: 'onedrive',
  company: { name: 'Acme Pharma' },
  admin: { id: 'usr_admin', name: 'Bola Admin', email: 'boss@acme.com', role: 'Admin', active: true, createdAt: at(0).toISOString() },
};
const rep: User = { id: 'usr_rep', name: 'Rita Rep', email: 'rita@acme.com', role: 'Rep', territory: 'Ikeja', active: true, createdAt: at(0).toISOString() };
const add = (c: CloudCache, m: unknown, when: Date): CloudCache => ({ ...c, own: { ...c.own, entries: [...c.own.entries, { seq: c.own.entries.length + 1, at: when.toISOString(), m: m as never }] } });

test("the administrator's data opens as the rep, changes are saved as the rep's, and the administrator's own cache is untouched", async () => {
  const drive = new MemoryDrive();
  await createCompany(drive.as('boss@acme.com'), genesis);
  let admin = newCache(genesis.companyId, 'usr_admin', 'boss@acme.com', 'dA');
  admin = add(admin, { type: 'import.users', users: [rep] }, at(1));
  admin = add(admin, { type: 'import.accounts', accounts: [{ id: 'acc_1', type: 'HCP', name: 'Dr. One', specialty: 'GP', tier: 'T1', address: '', city: 'Ikeja', ownerId: 'usr_rep', createdAt: at(1).toISOString() }] }, at(1));
  admin = (await syncOnce(drive.as('boss@acme.com'), admin, { now: at(2) })).cache;
  assert.equal(pendingCount(admin), 0);

  // Signed in as Rita: everything the administrator had, with Rita's journal for this device as its own.
  let as = cacheAs(admin, 'usr_rep', 'rita@acme.com', 'asdA');
  assert.equal(as.own.userId, 'usr_rep');
  assert.equal(as.uploaded, 0);
  assert.deepEqual(rebuild(as, at(3))!.snapshot, rebuild(admin, at(3))!.snapshot, 'nothing is lost: the administrator’s own journal joins the others');

  const call: Call = { id: 'call_1', accountId: 'acc_1', ownerId: 'usr_rep', datetime: at(4).toISOString(), channel: 'In person', status: 'Submitted', products: [{ product: 'X', priority: 1 }], keyMessages: [], createdAt: at(4).toISOString(), updatedAt: at(4).toISOString() };
  as = add(as, { type: 'call.save', call }, at(4));
  as = (await syncOnce(drive.as('rita@acme.com'), as, { now: at(5) })).cache;
  assert.equal(pendingCount(as), 0);
  assert.ok([...drive.files.values()].some((f) => f.name === 'ava-journal-usr_rep-asdA.json'));

  // Back on the administrator's own account, Rita's call arrives like anyone else's.
  const back = (await syncOnce(drive.as('boss@acme.com'), admin, { now: at(6) })).result!;
  assert.equal(back.snapshot.calls.length, 1);
  assert.equal(back.snapshot.calls[0].ownerId, 'usr_rep');

  // Signing in as Rita again on this device carries on with the same journal.
  const again = cacheAs((await syncOnce(drive.as('boss@acme.com'), admin, { now: at(7) })).cache, 'usr_rep', 'rita@acme.com', 'asdA');
  assert.equal(again.own.entries.length, 1);
  assert.equal(again.uploaded, 1);
  assert.ok(again.ownFileId);
});
