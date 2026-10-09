import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdmin, repsUnder, roleLabel, scopeSnapshot, withoutDeleted } from '../src/data/access';
import { exportAccounts, exportCalls, exportUsers, importAccounts, importProducts, importUsers, parseCsv, toCsv } from '../src/data/csv';
import { byDay, calendarState, monthGrid } from '../src/data/calendar';
import { distanceM, geoStatus } from '../src/data/geo';
import { currentCycle, repMetrics, teamRollup } from '../src/data/metrics';
import { applyMutation, RuleError } from '../src/data/mutations';
import { buildSeed } from '../src/data/seed';
import type { Call } from '../src/data/types';
import { sanitizeMutation } from '../src/data/sanitize';

const now = new Date('2026-10-03T12:00:00');
const seed = () => buildSeed(now);
const user = (s: ReturnType<typeof seed>, id: string) => s.users.find((u) => u.id === id)!;

test('seed is deterministic and consistent', () => {
  const a = seed();
  const b = seed();
  assert.deepEqual(a, b);
  assert.equal(a.users.filter((u) => u.role === 'Rep').length, 4);
  for (const c of a.calls) assert.ok(a.accounts.some((x) => x.id === c.accountId && x.ownerId === c.ownerId));
  for (const c of a.calls.filter((x) => x.status === 'Submitted')) assert.ok(new Date(c.datetime) <= now, 'no submitted call in the future');
});

test('scoping: rep sees own data, FLM sees team, SLM sees region, admin sees all', () => {
  const s = seed();
  const rep = scopeSnapshot(s, user(s, 'usr_rep1'));
  assert.ok(rep.accounts.length > 0 && rep.accounts.every((a) => a.ownerId === 'usr_rep1'));
  assert.ok(rep.calls.every((c) => c.ownerId === 'usr_rep1'));
  assert.ok(rep.users.some((u) => u.id === 'usr_flm1'), 'rep can see their manager’s name');
  assert.ok(!rep.users.some((u) => u.id === 'usr_rep2'));

  const flm = scopeSnapshot(s, user(s, 'usr_flm1'));
  assert.deepEqual(new Set(flm.calls.map((c) => c.ownerId)), new Set(['usr_rep1', 'usr_rep2']));
  assert.deepEqual(repsUnder(s.users, user(s, 'usr_slm')).map((u) => u.id).sort(), ['usr_rep1', 'usr_rep2', 'usr_rep3', 'usr_rep4']);
  assert.equal(scopeSnapshot(s, user(s, 'usr_admin')).calls.length, s.calls.length);
  // An SLM's scoped data still contains the FLMs, so team rollups work on it.
  const slm = user(s, 'usr_slm');
  const scoped = scopeSnapshot(s, slm);
  assert.equal(repsUnder(scoped.users, slm).length, 4);
  assert.ok(scoped.users.some((u) => u.id === 'usr_flm2'));
});

test('calls: submit rules, lock, ownership', () => {
  const s = seed();
  const rep = user(s, 'usr_rep1');
  const acc = s.accounts.find((a) => a.ownerId === rep.id)!;
  const base: Call = {
    id: 'call_t', accountId: acc.id, ownerId: rep.id, datetime: new Date(now.getTime() - 3600000).toISOString(), channel: 'In person',
    status: 'Submitted', products: [], keyMessages: [], createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  assert.throws(() => applyMutation(s, { type: 'call.save', call: base }, rep, now), /at least one product/);
  const ok = { ...base, products: [{ product: 'Cardiovex', priority: 1 }] };
  const s2 = applyMutation(s, { type: 'call.save', call: ok }, rep, now);
  assert.ok(s2.calls.find((c) => c.id === 'call_t')?.submittedAt);
  assert.throws(() => applyMutation(s2, { type: 'call.save', call: { ...ok, notes: 'edit' } }, rep, now), /locked/);
  assert.throws(() => applyMutation(s2, { type: 'call.delete', id: 'call_t' }, rep, now), /cannot be deleted/);
  // Another rep cannot log a call on this account; a manager cannot log calls as the rep.
  assert.throws(() => applyMutation(s, { type: 'call.save', call: { ...ok, ownerId: 'usr_rep2' } }, user(s, 'usr_rep2'), now), RuleError);
  assert.throws(() => applyMutation(s, { type: 'call.save', call: ok }, user(s, 'usr_flm1'), now), /your own calls/);
  // Future calls cannot be submitted.
  assert.throws(() => applyMutation(s, { type: 'call.save', call: { ...ok, datetime: new Date(now.getTime() + 86400000).toISOString() } }, rep, now), /future/);
  // Check-in can be required.
  const strict = { ...s, settings: { ...s.settings, requireCheckIn: true } };
  assert.throws(() => applyMutation(strict, { type: 'call.save', call: ok }, rep, now), /Check in/);
});

test('cycle plan: submit, manager review, rep cannot approve own plan', () => {
  const s = seed();
  const rep = user(s, 'usr_rep4');
  const plan = s.plans.find((p) => p.ownerId === rep.id)!;
  assert.equal(plan.status, 'Draft');
  const s2 = applyMutation(s, { type: 'plan.submit', id: plan.id }, rep, now);
  assert.throws(() => applyMutation(s2, { type: 'plan.review', id: plan.id, approve: true }, rep, now), /manager/);
  assert.throws(() => applyMutation(s2, { type: 'plan.review', id: plan.id, approve: true }, user(s, 'usr_flm1'), now), /manager/, 'other team’s FLM');
  assert.throws(() => applyMutation(s2, { type: 'plan.review', id: plan.id, approve: false }, user(s, 'usr_flm2'), now), /what needs to change/);
  const s3 = applyMutation(s2, { type: 'plan.review', id: plan.id, approve: false, note: 'Add more tier A calls' }, user(s, 'usr_flm2'), now);
  const rejected = s3.plans.find((p) => p.id === plan.id)!;
  assert.equal(rejected.status, 'Rejected');
  // Editing a rejected plan keeps the manager’s note.
  const s4 = applyMutation(s3, { type: 'plan.save', plan: { ...rejected, targets: rejected.targets.map((t) => ({ ...t, planned: t.planned + 1 })) } }, rep, now);
  assert.equal(s4.plans.find((p) => p.id === plan.id)!.reviewNote, 'Add more tier A calls');
  const s5 = applyMutation(applyMutation(s4, { type: 'plan.submit', id: plan.id }, rep, now), { type: 'plan.review', id: plan.id, approve: true }, user(s, 'usr_slm'), now);
  assert.equal(s5.plans.find((p) => p.id === plan.id)!.status, 'Approved', 'SLM can approve too');
});

test('admin-only changes', () => {
  const s = seed();
  assert.throws(() => applyMutation(s, { type: 'settings.update', settings: { geofenceM: 500 } }, user(s, 'usr_flm1'), now), /administrator/);
  const s2 = applyMutation(s, { type: 'settings.update', settings: { geofenceM: 500 } }, user(s, 'usr_admin'), now);
  assert.equal(s2.settings.geofenceM, 500);
  const rep = user(s, 'usr_rep1');
  assert.throws(() => applyMutation(s, { type: 'user.upsert', user: { ...rep, managerId: 'usr_slm' } }, user(s, 'usr_admin'), now), /reports to an FLM/);
  assert.throws(() => applyMutation(s, { type: 'user.upsert', user: { ...user(s, 'usr_admin'), active: false } }, user(s, 'usr_admin'), now), /your own admin/);
});

test('metrics: attainment counts each target only up to its plan', () => {
  const s = seed();
  const cycle = currentCycle(s.cycles, now)!;
  assert.equal(cycle.id, 'cyc_now');
  const m = repMetrics(s, user(s, 'usr_rep1'), cycle);
  assert.ok(m.planned > 0 && m.onPlan <= m.planned && m.attainment > 0 && m.attainment <= 1);
  const team = teamRollup(s, user(s, 'usr_flm1'), cycle);
  assert.equal(team.reps.length, 2);
  assert.equal(team.plansPending, 1);
  const region = teamRollup(s, user(s, 'usr_slm'), cycle);
  assert.equal(region.reps.length, 4);
  assert.equal(region.plansMissing, 0);
});

test('geo: distance and status', () => {
  assert.ok(Math.abs(distanceM({ lat: 6.6018, lng: 3.3515 }, { lat: 6.6108, lng: 3.3515 }) - 1001) < 5);
  const c = { channel: 'In person', checkIn: { lat: 0, lng: 0, at: '', distanceM: 120 } } as Call;
  assert.equal(geoStatus(c, 300), 'Verified');
  assert.equal(geoStatus({ ...c, checkIn: { ...c.checkIn!, distanceM: 900 } }, 300), 'Off-site');
  assert.equal(geoStatus({ ...c, checkIn: undefined }, 300), 'Missing');
  assert.equal(geoStatus({ ...c, channel: 'Phone' }, 300), 'Remote');
});

test('csv: round trip with quotes, commas, newlines and formula guard', () => {
  const csv = toCsv(['a', 'b', 'c'], [['x, y', 'say "hi"', 'line1\nline2'], ['=HYPERLINK("x")', '+1 555 0100', '-3.5']]);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[1], ['x, y', 'say "hi"', 'line1\nline2']);
  assert.deepEqual(rows[2], [`'=HYPERLINK("x")`, '+1 555 0100', '-3.5']);
});

test('csv import: accounts validate and map owners; users resolve managers in file order', () => {
  const s = seed();
  const text = 'type,name,specialty,tier,city,owner_email,lat,lng\nHCP,Dr. New,Cardiology,t1,Ikeja,tunde@ava.demo,6.6,3.35\nXYZ,,Cardiology,D,,nobody@x.com,1,\n';
  const r = importAccounts(text, s);
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].ownerId, 'usr_rep1');
  assert.equal(r.valid[0].tier, 'T1');
  assert.ok(r.rows[1].errors.length >= 5);
  const s2 = applyMutation(s, { type: 'import.accounts', accounts: r.valid }, user(s, 'usr_admin'), now);
  assert.equal(s2.accounts.length, s.accounts.length + 1);

  const users = importUsers('name,email,role,manager_email\nNew FLM,nf@x.com,FLM,slm@ava.demo\nNew Rep,nr@x.com,rep,nf@x.com\nBad,bad@x.com,Rep,slm@ava.demo\n', s);
  assert.equal(users.valid.length, 2);
  assert.match(users.rows[2].errors.join(), /FLM/);
  const s3 = applyMutation(s, { type: 'import.users', users: users.valid }, user(s, 'usr_admin'), now);
  assert.equal(s3.users.find((u) => u.email === 'nr@x.com')!.managerId, users.valid[0].id);
  assert.ok(importAccounts('name\nX\n', s).missingColumns.some((c) => c.startsWith('owner_email')));
});

test('export: calls CSV has one row per call', () => {
  const s = seed();
  assert.equal(parseCsv(exportCalls(s)).length, s.calls.length + 1);
});

test('sanitizer drops unknown fields and rejects bad types', () => {
  const s = seed();
  const c = s.calls[0];
  const m = sanitizeMutation({ type: 'call.save', call: { ...c, evil: 1, submittedAt: '2000-01-01T00:00:00Z' } }, now);
  assert.ok(m.type === 'call.save' && !('evil' in m.call) && m.call.submittedAt === undefined);
  assert.throws(() => sanitizeMutation({ type: 'call.save', call: { ...c, products: 'x' } }, now), RuleError);
  assert.throws(() => sanitizeMutation({ type: 'drop.tables' }, now), RuleError);
});

test('tiers: per-team names, renames move that team’s accounts only, CSV checks the owner’s scheme', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  assert.deepEqual(s.settings.tiers.map((t) => t.name), ['ST', 'T1', 'T2', 'T3']);
  const team1 = s.accounts.filter((a) => user(s, a.ownerId).managerId === 'usr_flm1');
  const team2 = s.accounts.filter((a) => user(s, a.ownerId).managerId === 'usr_flm2');
  const s2 = applyMutation(
    s,
    { type: 'tiers.update', teamId: 'usr_flm1', tiers: [{ name: 'Gold', frequency: 8 }, { name: 'Silver', frequency: 4 }, { name: 'Bronze', frequency: 2 }], renames: { ST: 'Gold', T1: 'Gold', T2: 'Silver', T3: 'Bronze' } },
    admin,
    now,
  );
  for (const a of team1) assert.ok(['Gold', 'Silver', 'Bronze'].includes(s2.accounts.find((x) => x.id === a.id)!.tier));
  for (const a of team2) assert.equal(s2.accounts.find((x) => x.id === a.id)!.tier, a.tier);
  assert.equal(importAccounts('type,name,specialty,tier,city,owner_email\nHCP,Dr. X,GP,gold,Ikeja,tunde@ava.demo\n', s2).valid[0].tier, 'Gold');
  assert.match(importAccounts('type,name,specialty,tier,city,owner_email\nHCP,Dr. X,GP,ST,Ikeja,tunde@ava.demo\n', s2).rows[0].errors.join(), /Gold, Silver, Bronze/);
  assert.throws(() => applyMutation(s, { type: 'tiers.update', tiers: [{ name: 'A', frequency: 2 }, { name: 'a', frequency: 1 }] }, admin, now), /twice/);
  assert.throws(() => applyMutation(s, { type: 'tiers.update', teamId: 'usr_flm1', tiers: null }, user(s, 'usr_flm1'), now), RuleError);
  const reach = teamRollup(s2, user(s2, 'usr_slm'), currentCycle(s2.cycles, now)!).reachByTier;
  assert.ok(reach.Gold && reach.ST, 'rollups keep both schemes');
});

test('company profile: admin only, logo must be a small image', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const s2 = applyMutation(s, { type: 'company.update', company: { name: 'Acme Pharma', logo: 'data:image/png;base64,iVBORw0KGgo=' } }, admin, now);
  assert.equal(s2.company.name, 'Acme Pharma');
  assert.equal(s2.company.city, s.company.city);
  assert.throws(() => applyMutation(s, { type: 'company.update', company: { logo: 'javascript:alert(1)' } }, admin, now), /logo/);
  assert.throws(() => applyMutation(s, { type: 'company.update', company: { name: ' ' } }, admin, now), /required/);
  assert.throws(() => applyMutation(s, { type: 'company.update', company: { name: 'X' } }, user(s, 'usr_rep1'), now), RuleError);
});

test('calendar: submitted green, planned blue until its day passes, then red', () => {
  const at = new Date('2026-10-04T15:00:00');
  assert.equal(calendarState({ status: 'Submitted', datetime: '2026-10-01T10:00:00' }, at), 'submitted');
  assert.equal(calendarState({ status: 'Planned', datetime: new Date('2026-10-04T09:00:00').toISOString() }, at), 'planned', 'later the same day is not overdue yet');
  assert.equal(calendarState({ status: 'Planned', datetime: new Date('2026-10-03T09:00:00').toISOString() }, at), 'overdue');
  assert.equal(calendarState({ status: 'Saved', datetime: new Date('2026-10-02T09:00:00').toISOString() }, at), 'overdue', 'a draft never submitted is overdue too');
  const weeks = monthGrid(2026, 9);
  assert.equal(weeks[0][0], '2026-09-28', 'October 2026 starts on a Thursday; grid starts Monday');
  assert.ok(weeks.every((w) => w.length === 7));
  const s = seed();
  const days = byDay(s.calls, now);
  assert.ok([...days.values()].some((d) => d.overdue > 0) && [...days.values()].some((d) => d.planned > 0) && [...days.values()].some((d) => d.submitted > 0), 'demo shows all three colours');
});

test('cycles follow the calendar quarters', async () => {
  const { quarterCycles, companyCycles, isQuarterId } = await import('../src/data/cycles');
  const y = quarterCycles(2026, 2026);
  assert.deepEqual(
    y.map((c) => [c.id, c.start, c.end]),
    [
      ['q2026-1', '2026-01-01', '2026-03-31'],
      ['q2026-2', '2026-04-01', '2026-06-30'],
      ['q2026-3', '2026-07-01', '2026-09-30'],
      ['q2026-4', '2026-10-01', '2026-12-31'],
    ],
  );
  assert.match(y[0].name, /^Cycle 1 · Jan–Mar 2026$/);
  const cs = companyCycles('2026-10-04T10:00:00Z', new Date('2026-10-04T12:00:00Z'));
  assert.equal(cs[0].id, 'q2025-1');
  assert.equal(cs[cs.length - 1].id, 'q2027-4');
  assert.ok(isQuarterId('q2026-3') && !isQuarterId('cyc_1'));
});

test('dual role: a manager who is also an administrator', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const slm = user(s, 'usr_slm');
  assert.throws(() => applyMutation(s, { type: 'product.delete', ids: ['prd_neurolin'] }, slm, now), /administrator/);
  const s2 = applyMutation(s, { type: 'user.upsert', user: { ...slm, admin: true } }, admin, now);
  const slmAdmin = user(s2, 'usr_slm');
  assert.ok(isAdmin(slmAdmin) && slmAdmin.role === 'SLM');
  assert.equal(roleLabel(slmAdmin), 'Second-line manager · Administrator');
  // Admin rights: admin-only changes and the whole organisation's data, while staying the region's SLM.
  const s3 = applyMutation(s2, { type: 'product.delete', ids: ['prd_neurolin'] }, slmAdmin, now);
  assert.ok(!s3.products.some((p) => p.id === 'prd_neurolin'));
  assert.equal(scopeSnapshot(s2, slmAdmin).calls.length, s2.calls.length);
  assert.equal(repsUnder(s2.users, slmAdmin).length, 4);
  // The admin flag means nothing on the Admin role itself, and nobody can drop their own admin rights.
  assert.equal(applyMutation(s, { type: 'user.upsert', user: { ...admin, admin: true } }, admin, now).users.find((u) => u.id === admin.id)!.admin, undefined);
  assert.throws(() => applyMutation(s3, { type: 'user.upsert', user: { ...slmAdmin, admin: false } }, slmAdmin, now), /your own admin/);
});

test('user and territory IDs: unique user ID, CSV columns, accounts by territory ID', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const s2 = applyMutation(s, { type: 'user.upsert', user: { ...user(s, 'usr_rep1'), employeeId: ' EMP-1 ', territoryId: 'LAG-IKJ' } }, admin, now);
  assert.equal(user(s2, 'usr_rep1').employeeId, 'EMP-1');
  assert.throws(() => applyMutation(s2, { type: 'user.upsert', user: { ...user(s2, 'usr_rep2'), employeeId: 'emp-1' } }, admin, now), /already used by Tunde/);

  const users = importUsers('name,email,role,admin,user_id,manager_email,territory,territory_id\nNew FLM,nf@x.com,FLM,yes,EMP-9,slm@ava.demo,Kano,KAN\nClash,cl@x.com,Rep,,EMP-1,nf@x.com,,\n', s2);
  assert.equal(users.valid.length, 1);
  assert.deepEqual([users.valid[0].admin, users.valid[0].employeeId, users.valid[0].territoryId], [true, 'EMP-9', 'KAN']);
  assert.match(users.rows[1].errors.join(), /EMP-1 is already used/);

  const acc = importAccounts('type,name,specialty,tier,city,territory_id\nHCP,Dr. T,Cardiology,T2,Ikeja,lag-ikj\nHCP,Dr. U,Cardiology,T2,Ikeja,NOPE\n', s2);
  assert.equal(acc.valid.length, 1);
  assert.equal(acc.valid[0].ownerId, 'usr_rep1');
  assert.match(acc.rows[1].errors.join(), /no active rep with territory_id/);
  // Exports carry the IDs and re-import cleanly.
  const exported = exportUsers(s2);
  assert.match(exported, /EMP-1,tunde@ava.demo|EMP-1,flm/);
  assert.equal(importUsers(exported, s2).rows.filter((r) => r.errors.length).length, 0);
  assert.equal(importAccounts(exportAccounts(s2), s2).rows.filter((r) => r.errors.length).length, 0);
});

test('deleting a user: accounts and team move on, open work goes, history stays', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const owned = s.accounts.filter((a) => a.ownerId === 'usr_rep1').length;
  const submitted = s.calls.filter((c) => c.ownerId === 'usr_rep1' && c.status === 'Submitted').length;
  assert.ok(owned > 0 && submitted > 0);
  assert.throws(() => applyMutation(s, { type: 'user.delete', users: [{ id: 'usr_rep1' }] }, admin, now), /Choose who takes/);
  assert.throws(() => applyMutation(s, { type: 'user.delete', users: [{ id: 'usr_rep1', transferTo: 'usr_flm1' }] }, admin, now), /another Rep/);
  assert.throws(() => applyMutation(s, { type: 'user.delete', users: [{ id: 'usr_admin' }] }, admin, now), /yourself/);
  assert.throws(() => applyMutation(s, { type: 'user.delete', users: [{ id: 'usr_rep2', transferTo: 'usr_rep1' }] }, user(s, 'usr_flm1'), now), /administrator/);

  const s2 = applyMutation(s, { type: 'user.delete', users: [{ id: 'usr_rep1', transferTo: 'usr_rep2' }] }, admin, now);
  const gone = user(s2, 'usr_rep1');
  assert.ok(gone.deletedAt && !gone.active);
  assert.equal(s2.accounts.filter((a) => a.ownerId === 'usr_rep2').length, s.accounts.filter((a) => a.ownerId === 'usr_rep2').length + owned);
  assert.equal(s2.calls.filter((c) => c.ownerId === 'usr_rep1').length, submitted, 'only submitted calls stay');
  assert.ok(!s2.plans.some((p) => p.ownerId === 'usr_rep1'));
  assert.ok(!withoutDeleted(s2).users.some((u) => u.id === 'usr_rep1'));
  assert.equal(teamRollup(s2, user(s2, 'usr_flm1'), currentCycle(s2.cycles, now)!).reps.length, 1);
  // Deleting is final for that record: it cannot be edited back, but the email can be used again.
  assert.throws(() => applyMutation(s2, { type: 'user.upsert', user: { ...gone, active: true } }, admin, now), /deleted/);
  const s3 = applyMutation(s2, { type: 'user.upsert', user: { ...gone, id: 'usr_new', active: true, deletedAt: undefined } }, admin, now);
  assert.equal(user(s3, 'usr_new').email, 'tunde@ava.demo');
  // A deleted manager's reps move to the new manager.
  const s4 = applyMutation(s, { type: 'user.delete', users: [{ id: 'usr_flm1', transferTo: 'usr_flm2' }] }, admin, now);
  assert.equal(user(s4, 'usr_rep1').managerId, 'usr_flm2');
  assert.equal(teamRollup(s4, user(s4, 'usr_flm2'), currentCycle(s4.cycles, now)!).reps.length, 4);
  // Deleting the same person twice (two admins at once) is harmless.
  assert.equal(applyMutation(s2, { type: 'user.delete', users: [{ id: 'usr_rep1', transferTo: 'usr_rep2' }] }, admin, now), s2);
});

test('deleting accounts and products, in the app and by CSV', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const rep = user(s, 'usr_rep1');
  const plan = s.plans.find((p) => p.ownerId === rep.id)!;
  const acc = s.accounts.find((a) => plan.targets.some((t) => t.accountId === a.id) && s.calls.some((c) => c.accountId === a.id && c.status === 'Submitted'))!;
  assert.throws(() => applyMutation(s, { type: 'account.delete', ids: [acc.id] }, rep, now), /administrator/);
  const s2 = applyMutation(s, { type: 'account.delete', ids: [acc.id] }, admin, now);
  assert.ok(s2.accounts.find((a) => a.id === acc.id)!.deletedAt);
  assert.ok(!withoutDeleted(s2).accounts.some((a) => a.id === acc.id));
  assert.ok(!s2.plans.some((p) => p.targets.some((t) => t.accountId === acc.id)));
  assert.ok(s2.calls.filter((c) => c.accountId === acc.id).every((c) => c.status === 'Submitted'));
  assert.ok(s2.calls.some((c) => c.accountId === acc.id), 'submitted calls stay in the history');
  assert.throws(() => applyMutation(s2, { type: 'account.pin', id: acc.id, lat: 1, lng: 1 }, rep, now), /not found/);
  assert.throws(() => applyMutation(s2, { type: 'account.upsert', account: acc }, admin, now), /deleted/);

  // CSV: the action column deletes; only the identifying columns are needed.
  const other = s.accounts.find((a) => a.id !== acc.id)!;
  const r = importAccounts(`action,id,name,city\ndelete,${other.id},,\ndelete,,${other.name},${other.city}\nremove,acc_nope,,\nexplode,x,,\n`, s);
  assert.deepEqual(r.missingColumns, []);
  assert.deepEqual(r.deletes, [{ id: other.id, transferTo: undefined }]);
  assert.match(r.rows[1].errors.join(), /duplicate/);
  assert.match(r.rows[2].errors.join(), /no account with id/);
  assert.match(r.rows[3].errors.join(), /action must be/);

  const u = importUsers('action,email,transfer_to_email\ndelete,tunde@ava.demo,chioma@ava.demo\ndelete,kemi@ava.demo,\n', s);
  assert.deepEqual(u.deletes, [{ id: 'usr_rep1', transferTo: 'usr_rep2' }]);
  assert.match(u.rows[1].errors.join(), /transfer_to_email/);
  const s3 = applyMutation(s, { type: 'user.delete', users: u.deletes }, admin, now);
  assert.ok(user(s3, 'usr_rep1').deletedAt);

  const p = importProducts('action,name\ndelete,glucara xr\ndelete,Nothing\n', s);
  assert.equal(p.deletes.length, 1);
  const s4 = applyMutation(s, { type: 'product.delete', ids: p.deletes.map((d) => d.id) }, admin, now);
  assert.ok(!s4.products.some((x) => x.name === 'Glucara XR'));
  assert.ok(s4.calls.some((c) => c.products.some((x) => x.product === 'Glucara XR')), 'past calls keep the product name');
});

test('profile photos: your own, or anyone for an administrator', () => {
  const s = seed();
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  const rep = user(s, 'usr_rep1');
  const s2 = applyMutation(s, { type: 'user.photo', id: rep.id, photo }, rep, now);
  assert.equal(user(s2, rep.id).photo, photo);
  assert.throws(() => applyMutation(s, { type: 'user.photo', id: 'usr_rep2', photo }, rep, now), /your own photo/);
  assert.equal(user(applyMutation(s, { type: 'user.photo', id: 'usr_rep2', photo }, user(s, 'usr_admin'), now), 'usr_rep2').photo, photo);
  assert.throws(() => applyMutation(s, { type: 'user.photo', id: rep.id, photo: 'data:text/html;base64,AAAA' }, rep, now), /JPEG or PNG/);
  // Editing someone keeps their picture; removing it clears it.
  const s3 = applyMutation(s2, { type: 'user.upsert', user: { ...user(s2, rep.id), photo: undefined, territory: 'Ikeja North' } }, user(s, 'usr_admin'), now);
  assert.equal(user(s3, rep.id).photo, photo);
  assert.equal(user(applyMutation(s3, { type: 'user.photo', id: rep.id }, rep, now), rep.id).photo, undefined);
  // The journal sanitizer keeps the new change types and fields.
  assert.deepEqual(sanitizeMutation({ type: 'user.delete', users: [{ id: 'a', transferTo: 'b', x: 1 }] }, now), { type: 'user.delete', users: [{ id: 'a', transferTo: 'b' }] });
  const up = sanitizeMutation({ type: 'user.upsert', user: { ...rep, admin: true, employeeId: 'E1', territoryId: 'T1', photo, deletedAt: now.toISOString() } }, now);
  assert.ok(up.type === 'user.upsert' && up.user.admin && up.user.employeeId === 'E1' && up.user.territoryId === 'T1' && !('photo' in up.user && up.user.photo) && !up.user.deletedAt);
  assert.throws(() => sanitizeMutation({ type: 'account.delete', ids: 'all' }, now), RuleError);
});

test('mixed app versions: missing fields are kept, deleted records do not sink a whole change', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const s1 = applyMutation(s, { type: 'user.upsert', user: { ...user(s, 'usr_slm'), admin: true, employeeId: 'EMP-1', territoryId: 'WEST' } }, admin, now);
  // A 2.1.0 app sends users without admin, employeeId or territoryId; replay must keep them.
  const old = sanitizeMutation(JSON.parse(JSON.stringify({ type: 'user.upsert', user: { id: 'usr_slm', name: 'Michael Osei', email: 'slm@ava.demo', role: 'SLM', territory: 'New name', active: true } })), now);
  const s2 = applyMutation(s1, old, admin, now);
  assert.deepEqual([user(s2, 'usr_slm').admin, user(s2, 'usr_slm').employeeId, user(s2, 'usr_slm').territoryId, user(s2, 'usr_slm').territory], [true, 'EMP-1', 'WEST', 'New name']);
  // Clearing them explicitly still works.
  const s3 = applyMutation(s2, sanitizeMutation({ type: 'user.upsert', user: { ...user(s2, 'usr_slm'), admin: false, employeeId: '', territoryId: '' } }, now), admin, now);
  assert.deepEqual([user(s3, 'usr_slm').admin, user(s3, 'usr_slm').employeeId, user(s3, 'usr_slm').territoryId], [undefined, undefined, undefined]);
  // A users CSV without those columns keeps them too.
  const csv = importUsers('name,email,role\nMichael Osei,slm@ava.demo,SLM\n', s2);
  const s4 = applyMutation(s2, { type: 'import.users', users: csv.valid }, admin, now);
  assert.equal(user(s4, 'usr_slm').admin, true);
  assert.equal(user(s4, 'usr_slm').employeeId, 'EMP-1');

  // A plan made on an older app that still lists a deleted account keeps its other accounts.
  const rep = user(s, 'usr_rep1');
  const mine = s.accounts.filter((a) => a.ownerId === rep.id).slice(0, 2);
  const s5 = applyMutation(s, { type: 'account.delete', ids: [mine[0].id] }, admin, now);
  const cycle = s5.cycles.find((c) => !s5.plans.some((p) => p.ownerId === rep.id && p.cycleId === c.id))!;
  const s6 = applyMutation(s5, { type: 'plan.save', plan: { id: 'pln_old_app', ownerId: rep.id, cycleId: cycle.id, status: 'Draft', targets: mine.map((a) => ({ accountId: a.id, planned: 2 })), updatedAt: now.toISOString() } }, rep, now);
  assert.deepEqual(s6.plans.find((x) => x.id === 'pln_old_app')!.targets.map((t) => t.accountId), [mine[1].id]);
});

test('CSV: blank id makes a new account; deletes are checked after adds; limits match replay', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const r = importAccounts('id,type,name,specialty,tier,city,owner_email\n,HCP,Dr A,Cardiology,T1,Ikeja,tunde@ava.demo\n,HCP,Dr B,Cardiology,T1,Ikeja,tunde@ava.demo\n', s);
  assert.equal(r.valid.length, 2);
  assert.ok(r.valid.every((a) => a.id.startsWith('acc')) && r.valid[0].id !== r.valid[1].id);
  const long = importAccounts(`type,name,specialty,tier,city,owner_email,phone\nHCP,Dr C,Cardiology,T1,Ikeja,tunde@ava.demo,${'1'.repeat(61)}\n`, s);
  assert.match(long.rows[0].errors.join(), /phone must be 60/);
  // A new rep added in the same file can take over from one being deleted.
  const users = importUsers('action,name,email,role,manager_email,transfer_to_email\n,New Rep,newrep@x.com,Rep,flm.mainland@ava.demo,\ndelete,,tunde@ava.demo,,,newrep@x.com\n', s, admin.id);
  assert.equal(users.valid.length, 1);
  assert.equal(users.deletes.length, 1, users.rows.map((x) => x.errors.join()).join('|'));
  assert.match(importUsers('action,email\ndelete,admin@ava.demo\n', s, admin.id).rows[0].errors.join(), /yourself/);
});

test('user.leave: an administrator deletes their own account; work stays, reactivation clears the mark', () => {
  const s = seed();
  const rep = user(s, 'usr_rep1');
  const owned = s.accounts.filter((a) => a.ownerId === rep.id).length;
  const m = sanitizeMutation(JSON.parse(JSON.stringify({ type: 'user.leave', extra: 'ignored' })), now);
  assert.deepEqual(m, { type: 'user.leave' });
  assert.throws(() => applyMutation(s, m, rep, now), /administrator/, 'other people ask an administrator');
  // A rep who is also an administrator can.
  const withPhoto = { ...s, users: s.users.map((u) => (u.id === rep.id ? { ...u, admin: true, photo: 'data:image/jpeg;base64,AAAA' } : u)) };
  const next = applyMutation(withPhoto, m, user(withPhoto, rep.id), now);
  const left = user(next, rep.id);
  assert.equal(left.active, false);
  assert.equal(left.photo, undefined);
  assert.equal(left.leftAt, now.toISOString());
  assert.equal(next.accounts.filter((a) => a.ownerId === rep.id).length, owned, 'accounts stay for reassignment');
  // An administrator brings them back.
  const admin = user(s, 'usr_admin');
  const back = applyMutation(next, { type: 'user.upsert', user: { ...left, active: true } }, admin, now);
  assert.equal(user(back, rep.id).leftAt, undefined);
  // Editing them while still inactive keeps the mark.
  const edited = applyMutation(next, { type: 'user.upsert', user: { ...left, territory: 'Ikeja North' } }, admin, now);
  assert.equal(user(edited, rep.id).leftAt, now.toISOString());
});
