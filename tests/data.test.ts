import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repsUnder, scopeSnapshot } from '../src/data/access';
import { exportCalls, importAccounts, importUsers, parseCsv, toCsv } from '../src/data/csv';
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
  assert.ok(importAccounts('name\nX\n', s).missingColumns.includes('owner_email'));
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
