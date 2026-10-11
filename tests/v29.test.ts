import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCheckpoint, parseCheckpoint, replay, type CompanyFile, type JournalFile, type JournalSource } from '../src/cloud/journal';
import { scopeSnapshot } from '../src/data/access';
import { ACCOUNT_GRID, applyEdits, USER_GRID } from '../src/data/grid';
import { describeHandover, handover } from '../src/data/handover';
import { inviteMessage, whatsappLink } from '../src/data/invite';
import { fitBounds, project, unproject, visitStatus } from '../src/data/mapData';
import { applyMutation, type Mutation } from '../src/data/mutations';
import { nextCyclePlan } from '../src/data/nextPlan';
import { batchStock, sampleStock } from '../src/data/samples';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import { setupSteps } from '../src/data/setupChecklist';
import { inReviewWindow, tierSuggestions } from '../src/data/tierReview';
import { emptySnapshot, type Account, type Call, type Snapshot, type User } from '../src/data/types';
import { compareVersions, versionGroups } from '../src/data/versions';

const now = new Date('2026-10-03T12:00:00');
const seed = (): Snapshot => ({ ...buildSeed(now), tasks: [], events: [], sampleRequests: [] });
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const run = (s: Snapshot, m: Mutation, as: string, at = now) => applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify(m)), at), user(s, as), at);

test('handover: accounts, live plans, planned visits, open tasks, events and sample stock move; history stays', () => {
  let s = seed();
  const cycleId = s.plans.find((p) => p.ownerId === 'usr_rep1')!.cycleId;
  s = run(s, { type: 'task.save', task: { id: 't1', ownerId: 'usr_rep1', title: 'Send leaflet', due: '2026-10-10', createdAt: '' } }, 'usr_rep1');
  const before = sampleStock(s, 'usr_rep1').reduce((n, x) => n + x.balance, 0);
  const toBefore = sampleStock(s, 'usr_rep2').reduce((n, x) => n + x.balance, 0);
  const owned = s.accounts.filter((a) => a.ownerId === 'usr_rep1' && !a.deletedAt).length;
  const submitted = s.calls.filter((c) => c.ownerId === 'usr_rep1' && c.status === 'Submitted').length;
  const planned = s.calls.filter((c) => c.ownerId === 'usr_rep1' && c.status === 'Planned').length;

  // Reps cannot; a manager of both people can; someone outside the team cannot.
  assert.throws(() => run(s, { type: 'user.handover', fromId: 'usr_rep1', toId: 'usr_rep2' }, 'usr_rep2'), /administrator or a manager/);
  assert.throws(() => run(s, { type: 'user.handover', fromId: 'usr_rep1', toId: 'usr_rep3' }, 'usr_flm1'), /administrator or a manager/);
  assert.throws(() => run(s, { type: 'user.handover', fromId: 'usr_rep1', toId: 'usr_flm2' }, 'usr_admin'), /another Rep/);

  const preview = handover(s, 'usr_rep1', 'usr_rep2', 'usr_flm1', now.toISOString()).summary;
  const t = run(s, { type: 'user.handover', fromId: 'usr_rep1', toId: 'usr_rep2' }, 'usr_flm1');
  assert.equal(t.accounts.filter((a) => a.ownerId === 'usr_rep1' && !a.deletedAt).length, 0);
  assert.equal(preview.accounts, owned);
  assert.equal(t.calls.filter((c) => c.ownerId === 'usr_rep1' && c.status === 'Submitted').length, submitted, 'submitted calls stay');
  assert.equal(t.calls.filter((c) => c.ownerId === 'usr_rep1' && c.status === 'Planned').length, 0);
  assert.equal(preview.plannedCalls, planned);
  assert.equal(t.tasks!.find((x) => x.id === 't1')!.ownerId, 'usr_rep2');
  // Both reps had a plan for the cycle, so the leaver's targets are merged into the other plan, which is a draft again.
  const plan2 = t.plans.find((p) => p.ownerId === 'usr_rep2' && p.cycleId === cycleId)!;
  assert.equal(plan2.status, 'Draft');
  assert.ok(!t.plans.some((p) => p.ownerId === 'usr_rep1' && p.cycleId === cycleId));
  assert.ok(plan2.targets.every((x) => x.planned <= 50));
  // Sample stock moves batch by batch.
  assert.equal(sampleStock(t, 'usr_rep1').reduce((n, x) => n + x.balance, 0), 0);
  assert.equal(sampleStock(t, 'usr_rep2').reduce((n, x) => n + x.balance, 0), toBefore + before);
  assert.ok(batchStock(t, 'usr_rep1').every((b) => b.balance === 0));
  assert.ok(describeHandover(preview).some((l) => /account/.test(l)));
  // Every device makes the same movements (ids come from the change time).
  assert.deepEqual(run(s, { type: 'user.handover', fromId: 'usr_rep1', toId: 'usr_rep2' }, 'usr_flm1').samples, t.samples);
});

test('handover: a plan moves whole when the new person has none, and direct reports follow a manager', () => {
  let s = seed();
  const cycleId = s.plans.find((p) => p.ownerId === 'usr_rep1')!.cycleId;
  s = { ...s, plans: s.plans.filter((p) => !(p.ownerId === 'usr_rep2' && p.cycleId === cycleId)) };
  const t = run(s, { type: 'user.handover', fromId: 'usr_rep1', toId: 'usr_rep2' }, 'usr_admin');
  const moved = t.plans.find((p) => p.ownerId === 'usr_rep2' && p.cycleId === cycleId)!;
  assert.equal(moved.status, 'Draft');
  assert.equal(moved.reviewerId, undefined);
  const m = run(s, { type: 'user.handover', fromId: 'usr_flm1', toId: 'usr_flm2' }, 'usr_slm');
  assert.equal(user(m, 'usr_rep1').managerId, 'usr_flm2');
  assert.equal(user(m, 'usr_rep2').managerId, 'usr_flm2');
});

test('sample restock: a rep asks, the manager approves and the issue is recorded; others cannot decide', () => {
  let s = seed();
  const req = { id: 'r1', repId: 'usr_rep1', items: [{ product: 'Cardiovex', qty: 20 }, { product: 'Neurolin', qty: 5 }], note: 'CME next week', status: 'Pending' as const, at: '' };
  assert.throws(() => run(s, { type: 'sample.request', request: { ...req, repId: 'usr_rep2' } }, 'usr_rep1'), /yourself/);
  assert.throws(() => run(s, { type: 'sample.request', request: { ...req, items: [{ product: 'Nope', qty: 1 }] } }, 'usr_rep1'), /not a product/);
  assert.throws(() => run(s, { type: 'sample.request', request: { ...req, items: [{ product: 'Cardiovex', qty: 0 }] } }, 'usr_rep1'), /whole number/);
  s = run(s, { type: 'sample.request', request: req }, 'usr_rep1');
  assert.equal(s.sampleRequests![0].status, 'Pending');
  assert.equal(scopeSnapshot(s, user(s, 'usr_rep3')).sampleRequests!.length, 0, 'other teams do not see it');
  assert.throws(() => run(s, { type: 'sample.requestReview', id: 'r1', approve: true }, 'usr_rep1'), /manager/);
  assert.throws(() => run(s, { type: 'sample.requestReview', id: 'r1', approve: true }, 'usr_flm2'), /manager/);
  assert.throws(() => run(s, { type: 'sample.requestReview', id: 'r1', approve: false }, 'usr_flm1'), /Say why/);
  const before = sampleStock(s, 'usr_rep1').find((x) => x.product === 'Cardiovex')!.balance;
  s = run(s, { type: 'sample.requestReview', id: 'r1', approve: true }, 'usr_flm1');
  s = run(s, { type: 'sample.issue', issue: { id: 'r1-0', repId: 'usr_rep1', product: 'Cardiovex', qty: 20, note: 'Restock request', byId: '', at: '' } }, 'usr_flm1');
  assert.equal(s.sampleRequests![0].status, 'Approved');
  assert.equal(sampleStock(s, 'usr_rep1').find((x) => x.product === 'Cardiovex')!.balance, before + 20);
  assert.throws(() => run(s, { type: 'sample.requestReview', id: 'r1', approve: true }, 'usr_flm1'), /already decided/);
  // A rep cancels their own pending request.
  s = run(s, { type: 'sample.request', request: { ...req, id: 'r2' } }, 'usr_rep1');
  s = run(s, { type: 'sample.requestCancel', id: 'r2' }, 'usr_rep1');
  assert.equal(s.sampleRequests!.find((r) => r.id === 'r2')!.status, 'Cancelled');
});

test('next cycle plan: tier frequency now, missed visits carried (at most two), new accounts added, dropped tiers out', () => {
  const acc = (id: string, tier: string, createdAt = '2026-01-01T00:00:00Z'): Account => ({ id, type: 'HCP', name: id, specialty: 'GP', tier, address: '', city: 'Lagos', ownerId: 'r', createdAt });
  const freq: Record<string, number> = { ST: 8, T1: 6, T2: 4, T3: 0 };
  const territory = [acc('a', 'T1'), acc('b', 'T2'), acc('c', 'T3'), acc('d', 'T1', '2026-08-01T00:00:00Z'), acc('e', 'ST')];
  const prev = { targets: [{ accountId: 'a', planned: 6 }, { accountId: 'b', planned: 6 }, { accountId: 'c', planned: 2 }, { accountId: 'e', planned: 8 }, { accountId: 'gone', planned: 3 }] };
  const done = new Map([['a', 6], ['b', 4], ['e', 3]]);
  const r = nextCyclePlan(prev, territory, done, (a) => freq[a.tier], '2026-07-01');
  const by = new Map(r.targets.map((t) => [t.accountId, t.planned]));
  assert.equal(by.get('a'), 6, 'on plan: same');
  assert.equal(by.get('b'), 6, 'tier T2 is 4, plus 2 missed');
  assert.equal(by.get('e'), 10, 'missed 5, carry capped at 2');
  assert.equal(by.has('c'), false, 'T3 has no visits now');
  assert.equal(by.get('d'), 6, 'new account');
  assert.ok(r.changes.some((c) => c.accountId === 'gone' && c.to === 0));
  assert.ok(r.changes.find((c) => c.accountId === 'e')!.reason.includes('missed'));
  assert.equal(r.changes.some((c) => c.accountId === 'b'), false, 'b ends up at its old number');
});

test('tier review: up for high potential with positive reactions, down for low potential; one tier at a time', () => {
  const s = seed();
  const cycle = s.cycles.find((c) => c.id === 'cyc_now')!;
  const doctors = s.accounts.filter((a) => a.ownerId === 'usr_rep1' && a.type === 'HCP');
  const up = doctors.find((a) => a.tier !== 'ST')!;
  const down = doctors.find((a) => a.tier !== 'T3' && a.id !== up.id)!;
  const call = (id: string, accountId: string, reaction: Call['reaction']): Call => ({ id, accountId, ownerId: 'usr_rep1', datetime: '2026-10-02T09:00:00.000Z', channel: 'In person', status: 'Submitted', products: [{ product: 'Cardiovex', priority: 1 }], keyMessages: [], reaction, createdAt: '', updatedAt: '' });
  const t: Snapshot = {
    ...s,
    accounts: s.accounts.map((a) => (a.id === up.id ? { ...a, potential: 'High' as const, kol: false } : a.id === down.id ? { ...a, potential: 'Low' as const, kol: false } : { ...a, potential: undefined, kol: false })),
    calls: [...s.calls.map((c) => ({ ...c, reaction: undefined })), call('x1', up.id, 'Positive'), call('x2', up.id, 'Positive')],
  };
  const list = tierSuggestions(t, cycle, new Set(['usr_rep1']));
  const u = list.find((x) => x.account.id === up.id)!;
  const d = list.find((x) => x.account.id === down.id)!;
  assert.equal(u.direction, 'up');
  assert.equal(d.direction, 'down');
  const scheme = t.settings.tiers.map((x) => x.name);
  assert.equal(scheme.indexOf(u.to), scheme.indexOf(up.tier) - 1);
  assert.equal(scheme.indexOf(d.to), scheme.indexOf(down.tier) + 1);
  assert.equal(inReviewWindow({ id: 'q', name: 'q', start: '2026-10-01', end: '2026-12-31' }, new Date('2026-12-20T10:00:00')), true);
  assert.equal(inReviewWindow({ id: 'q', name: 'q', start: '2026-10-01', end: '2026-12-31' }, new Date('2026-11-01T10:00:00')), false);
});

test('map: overdue accounts and the map maths', () => {
  const s = seed();
  const cycle = s.cycles.find((c) => c.id === 'cyc_now')!;
  const st = visitStatus(s, cycle, now);
  assert.equal(st.size, s.accounts.length);
  assert.ok([...st.values()].some((x) => x.overdue));
  assert.ok([...st.values()].some((x) => !x.overdue));
  const p = project(6.5, 3.35, 12);
  const back = unproject(p.x, p.y, 12);
  assert.ok(Math.abs(back.lat - 6.5) < 1e-9 && Math.abs(back.lng - 3.35) < 1e-9);
  const fit = fitBounds([{ lat: 6.4, lng: 3.3 }, { lat: 6.6, lng: 3.5 }], 400, 400);
  assert.ok(fit.zoom >= 9 && fit.zoom <= 12, String(fit.zoom));
  assert.equal(fitBounds([], 400, 400).zoom, 5);
});

test('grid editing: edits are checked per cell and save as one import; undoing a save restores the rows', () => {
  let s = seed();
  const a = s.accounts.find((x) => x.ownerId === 'usr_rep1')!;
  const edits = [
    { rowId: a.id, key: 'city', before: a.city, after: 'Surulere' },
    { rowId: a.id, key: 'tier', before: a.tier, after: 'zz' },
    { rowId: a.id, key: 'potential', before: '', after: 'high' },
  ];
  const r = applyEdits(s.accounts, edits, ACCOUNT_GRID, s);
  assert.match(r.problems.get(`${a.id}|tier`)!, /Tier must be/);
  const ok = applyEdits(s.accounts, [edits[0], { ...edits[1], after: 't2' }, edits[2]], ACCOUNT_GRID, s);
  assert.equal(ok.problems.size, 0);
  assert.equal(ok.changed[0].tier, 'T2');
  assert.equal(ok.changed[0].potential, 'High');
  s = run(s, { type: 'import.accounts', accounts: ok.changed }, 'usr_admin');
  assert.equal(s.accounts.find((x) => x.id === a.id)!.city, 'Surulere');
  s = run(s, { type: 'import.accounts', accounts: [a] }, 'usr_admin');
  assert.equal(s.accounts.find((x) => x.id === a.id)!.city, a.city);
  // Users: a manager by email, Active as Yes/No.
  const u = applyEdits(s.users, [{ rowId: 'usr_rep1', key: 'manager', before: '', after: 'flm.island@ava.demo' }, { rowId: 'usr_rep1', key: 'active', before: 'Yes', after: 'maybe' }], USER_GRID, s);
  assert.equal(u.changed[0].managerId, 'usr_flm2');
  assert.ok(u.problems.has('usr_rep1|active'));
});

test('setup checklist ticks itself off; invites carry the code and starting password', () => {
  const s = emptySnapshot({ name: 'Acme' });
  assert.equal(setupSteps(s).filter((x) => x.done).length, 0);
  const full = seed();
  const steps = setupSteps({ ...full, company: { ...full.company, phone: '0800' } }, { invited: true, cycleChecked: true });
  assert.ok(steps.every((x) => x.done));
  const msg = inviteMessage('Acme', '7KQ2MD', { name: 'Rita Rep', email: 'rita@acme.com' }, 'Bola');
  assert.match(msg, /Hi Rita/);
  assert.match(msg, /7KQ2MD/);
  assert.match(msg, /12345678/);
  assert.match(whatsappLink(msg), /^https:\/\/wa\.me\/\?text=/);
});

test('versions compare by number and group people', () => {
  assert.equal(compareVersions('2.10.0', '2.9.0'), 1);
  assert.equal(compareVersions(undefined, '2.7.0'), -1);
  const people = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] as User[];
  const g = versionGroups(people, [{ userId: 'a', v: '2.9.0', at: '' }, { userId: 'b', at: '' }]);
  assert.deepEqual(g.map((x) => x.label), ['Version 2.9.0', 'Before 2.9', 'Not synced since 2.9']);
});

// ----- condensed history -----

const genesis: CompanyFile = {
  format: 'ava-crm/1', companyId: 'cmp_cp', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'boss@acme.com', provider: 'google',
  company: { name: 'Acme' }, admin: { id: 'usr_admin', name: 'Boss', email: 'boss@acme.com', role: 'Admin', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
};

function history(): JournalSource[] {
  const rep: User = { id: 'usr_rep', name: 'Rita', email: 'rita@acme.com', role: 'Rep', active: true, createdAt: '' };
  const adminEntries: JournalFile['entries'] = [{ seq: 1, at: '2026-01-02T00:00:00.000Z', m: { type: 'import.users', users: [rep] } }];
  const accounts: Account[] = Array.from({ length: 30 }, (_, i) => ({ id: `acc_${i}`, type: 'HCP', name: `Dr ${i}`, specialty: 'GP', tier: 'T1', address: '', city: 'Ikeja', ownerId: 'usr_rep', createdAt: '' }));
  adminEntries.push({ seq: 2, at: '2026-01-03T00:00:00.000Z', m: { type: 'import.accounts', accounts } });
  const repEntries: JournalFile['entries'] = [];
  let seq = 0;
  // A visit a day from January to early October; the last month stays uncondensed.
  for (let d = 0; d < 270; d++) {
    const day = new Date(Date.parse('2026-01-05T09:00:00.000Z') + d * 864e5).toISOString();
    repEntries.push({ seq: ++seq, at: day, m: { type: 'call.save', call: { id: `c${d}`, accountId: `acc_${d % 30}`, ownerId: 'usr_rep', datetime: day, channel: 'Phone', status: 'Submitted', products: [], keyMessages: [], notes: 'ok', createdAt: '', updatedAt: '' } } as unknown as Mutation });
  }
  // A call that breaks the rules (no products) is dropped the same way either way.
  const journal = (userId: string, email: string, deviceId: string, entries: JournalFile['entries']): JournalSource => ({ journal: { format: 'ava-journal/1', companyId: 'cmp_cp', userId, email, deviceId, entries } });
  return [journal('usr_admin', 'boss@acme.com', 'dA', adminEntries), journal('usr_rep', 'rita@acme.com', 'dR', repEntries)];
}

test('condensed history: starting from a checkpoint gives the same data as replaying everything', () => {
  // Calls need a product to be submitted: give them one so they count.
  const sources = history().map((x) => ({ ...x, journal: { ...x.journal, entries: x.journal.entries.map((e) => (e.m.type === 'call.save' ? { ...e, m: { ...e.m, call: { ...e.m.call, products: [] } } } : e)) } }));
  const t = new Date('2026-10-05T12:00:00.000Z');
  const full = replay(genesis, sources, t);
  const cp = buildCheckpoint(genesis, sources, t, undefined, 10)!;
  assert.ok(cp, 'enough old entries to condense');
  assert.ok(cp.entries > 200 && cp.entries < 272);
  const parsed = parseCheckpoint(JSON.stringify(cp), 'cmp_cp')!;
  assert.ok(parsed);
  assert.equal(parseCheckpoint(JSON.stringify(cp), 'other'), undefined);
  const fast = replay(genesis, sources, t, parsed);
  // The checkpoint is stored as JSON, so compare as JSON (empty fields drop out either way).
  assert.deepEqual(json(fast.snapshot), json(full.snapshot));
  assert.ok(fast.log.length < full.log.length / 5, 'only recent entries are replayed');

  // Too few new old entries: no new checkpoint.
  assert.equal(buildCheckpoint(genesis, sources, t, cp, 10), undefined);

  // A phone that was offline uploads an old entry later: it is applied after the checkpoint.
  const late = sources.map((x) => (x.journal.userId === 'usr_rep' ? x : x));
  const lateRep: JournalSource = { journal: { format: 'ava-journal/1', companyId: 'cmp_cp', userId: 'usr_rep', email: 'rita@acme.com', deviceId: 'dR2', entries: [{ seq: 1, at: '2026-03-01T10:00:00.000Z', m: { type: 'account.pin', id: 'acc_1', lat: 6.6, lng: 3.35 } }] } };
  const withLate = replay(genesis, [...late, lateRep], t, parsed);
  assert.equal(withLate.snapshot.accounts.find((a) => a.id === 'acc_1')!.lat, 6.6);

  // A checkpoint built on top of the previous one holds every entry once.
  const later = new Date('2026-12-20T12:00:00.000Z');
  const cp2 = buildCheckpoint(genesis, sources, later, cp, 1)!;
  assert.deepEqual(json(replay(genesis, sources, later, JSON.parse(JSON.stringify(cp2))).snapshot), json(replay(genesis, sources, later).snapshot));
});
