import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeSnapshot } from '../src/data/access';
import { computeAlerts } from '../src/data/alerts';
import { deckFileName, detailingStats, mergeViews, parseDeckFile } from '../src/data/detailing';
import { digestForAi, parseTips, weeklyDigest } from '../src/data/digest';
import { findDuplicates, nameSimilarity, normalName, possibleDuplicates } from '../src/data/duplicates';
import { currentCycle } from '../src/data/metrics';
import { applyMutation, type Mutation } from '../src/data/mutations';
import { nextVisits } from '../src/data/nextBest';
import { cleanObjectives, objectiveStats, openObjectives } from '../src/data/objectives';
import { batchStock, expiringBatches, reconcile } from '../src/data/samples';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import type { Account, Call, MeetingEvent, Snapshot } from '../src/data/types';

const now = new Date('2026-10-03T12:00:00');
const seed = (): Snapshot => {
  const s = buildSeed(now);
  return { ...s, leaves: [], tasks: [], samples: [], events: [], accountChanges: [], sampleCounts: [], calls: s.calls.map(({ samples: _s, coaching: _c, coachId: _k, objectives: _o, ...c }) => c) };
};
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const run = (s: Snapshot, m: Mutation, as: string, at = now) => applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify(m)), at), user(s, as), at);
const repAccount = (s: Snapshot, rep = 'usr_rep1', type: Account['type'] = 'HCP') => s.accounts.find((a) => a.ownerId === rep && a.type === type && !a.deletedAt)!;
const baseCall = (s: Snapshot, over: Partial<Call> = {}): Call => ({
  id: 'c27', accountId: repAccount(s).id, ownerId: 'usr_rep1', datetime: '2026-10-03T10:00:00.000Z', channel: 'Phone', status: 'Submitted',
  products: [{ product: 'Cardiovex', priority: 1 }], keyMessages: [], createdAt: '', updatedAt: '', ...over,
});

test('objectives: planned without results, recorded with them, open ones carry to the next visit', () => {
  let s = seed();
  const planned = baseCall(s, { id: 'p1', status: 'Planned', datetime: '2026-10-05T09:00:00.000Z', objectives: [{ text: 'Share new clinical data' }] });
  s = run(s, { type: 'call.save', call: planned }, 'usr_rep1');
  assert.deepEqual(s.calls.find((c) => c.id === 'p1')!.objectives, [{ text: 'Share new clinical data' }]);
  assert.throws(() => run(s, { type: 'call.save', call: { ...planned, objectives: [{ text: 'x', achieved: true }] } }, 'usr_rep1'), /when you record/);
  assert.throws(() => run(s, { type: 'call.save', call: baseCall(s, { objectives: Array.from({ length: 6 }, (_, i) => ({ text: `o${i}` })) }) }, 'usr_rep1'), /up to 5/);
  s = run(s, { type: 'call.save', call: baseCall(s, { objectives: [{ text: 'Agree a trial', achieved: false }, { text: 'Leave leaflets', achieved: true }] }) }, 'usr_rep1');
  const mine = s.calls.filter((c) => c.accountId === repAccount(s).id);
  assert.deepEqual(openObjectives(mine).map((o) => o.text), ['Agree a trial']);
  const st = objectiveStats(mine);
  assert.equal(st.achieved, 1);
  assert.equal(st.missed, 1);
  assert.equal(st.rate, 0.5);
  assert.deepEqual(cleanObjectives([{ text: ' A ' }, { text: 'a' }, { text: '' }, { text: 'B', achieved: true }], true), [{ text: 'A' }, { text: 'B' }]);
});

test('samples: expired batches cannot be given, signature rules, batch stock and reconciliation', () => {
  let s = seed();
  s = run(s, { type: 'sample.issue', issue: { id: 'i1', repId: 'usr_rep1', product: 'Cardiovex', qty: 10, batch: 'B1', expiry: '2026-09', byId: '', at: '' } }, 'usr_flm1');
  s = run(s, { type: 'sample.issue', issue: { id: 'i2', repId: 'usr_rep1', product: 'Cardiovex', qty: 5, batch: 'B2', expiry: '2027-03', byId: '', at: '' } }, 'usr_flm1');
  assert.throws(() => run(s, { type: 'sample.issue', issue: { id: 'i3', repId: 'usr_rep1', product: 'Cardiovex', qty: 1, expiry: '2027-13', byId: '', at: '' } }, 'usr_flm1'), /expiry/i);
  assert.throws(() => run(s, { type: 'call.save', call: baseCall(s, { samples: [{ product: 'Cardiovex', qty: 2, batch: 'B1', expiry: '2026-09' }] }) }, 'usr_rep1'), /expired/);

  const sig = { name: 'Dr Bello', strokes: [[10, 10, 200, 220, 400, 300]], at: now.toISOString() };
  s = { ...s, settings: { ...s.settings, sampleSignature: 'required' } };
  assert.throws(() => run(s, { type: 'call.save', call: baseCall(s, { samples: [{ product: 'Cardiovex', qty: 2, batch: 'B2', expiry: '2027-03' }] }) }, 'usr_rep1'), /sign/);
  assert.throws(() => run(s, { type: 'call.save', call: baseCall(s, { samples: [{ product: 'Cardiovex', qty: 2 }], signature: { ...sig, strokes: [[1, 2, 3]] } }) }, 'usr_rep1'), /signature/i);
  s = run(s, { type: 'call.save', call: baseCall(s, { samples: [{ product: 'Cardiovex', qty: 2, batch: 'B2', expiry: '2027-03' }], signature: sig }) }, 'usr_rep1');
  assert.equal(s.calls.find((c) => c.id === 'c27')!.signature!.name, 'Dr Bello');
  const noSamples = run({ ...s, calls: s.calls.filter((c) => c.id !== 'c27') }, { type: 'call.save', call: baseCall(s, { signature: sig }) }, 'usr_rep1');
  assert.equal(noSamples.calls.find((c) => c.id === 'c27')!.signature, undefined, 'a signature without samples is not kept');

  const stock = batchStock(s, 'usr_rep1');
  assert.deepEqual(stock.map((b) => [b.batch, b.balance]), [['B1', 10], ['B2', 3]], 'oldest expiry first');
  const exp = expiringBatches(stock, '2026-10', 6);
  assert.deepEqual(exp.expired.map((b) => b.batch), ['B1']);
  assert.deepEqual(exp.soon.map((b) => b.batch), ['B2']);

  assert.throws(() => run(s, { type: 'sample.count', count: { id: 'k1', repId: 'usr_rep2', month: '2026-10', counts: [], at: '' } }, 'usr_rep1'), /your own/);
  s = run(s, { type: 'sample.count', count: { id: 'k1', repId: 'usr_rep1', month: '2026-10', counts: [{ product: 'Cardiovex', counted: 12 }], at: '' } }, 'usr_rep1', new Date('2026-10-04T12:00:00'));
  const r = reconcile(s, s.sampleCounts![0]);
  assert.deepEqual(r, [{ product: 'Cardiovex', expected: 13, counted: 12, variance: -1 }]);
});

test('presentations: deck rules, files, time per slide and reactions', () => {
  let s = seed();
  const hash = 'a'.repeat(64);
  const deck = { file: deckFileName('prd_cardiovex', hash), hash, slides: 3, updatedAt: now.toISOString() };
  const product = s.products.find((p) => p.id === 'prd_cardiovex')!;
  assert.throws(() => run(s, { type: 'product.upsert', product: { ...product, deck: { ...deck, file: '../x.json' } } }, 'usr_admin'), /presentation/i);
  s = run(s, { type: 'product.upsert', product: { ...product, deck } }, 'usr_admin');
  assert.equal(s.products.find((p) => p.id === 'prd_cardiovex')!.deck!.slides, 3);
  s = run(s, { type: 'import.products', products: [{ ...product, deck: undefined, brochureUrl: undefined }] }, 'usr_admin');
  assert.ok(s.products.find((p) => p.id === 'prd_cardiovex')!.deck, 'a CSV import keeps the presentation');

  assert.equal(parseDeckFile('{"format":"ava-deck/1","productId":"p","slides":["data:text/html;base64,AAA"]}'), null, 'only images');
  assert.ok(parseDeckFile('{"format":"ava-deck/1","productId":"p","slides":["data:image/png;base64,AAAA"]}'));

  const views = mergeViews([{ product: 'Cardiovex', slide: 1, seconds: 20 }, { product: 'Cardiovex', slide: 2, seconds: 5 }, { product: 'Cardiovex', slide: 1, seconds: 10 }]);
  assert.deepEqual(views, [{ product: 'Cardiovex', slide: 1, seconds: 30 }, { product: 'Cardiovex', slide: 2, seconds: 5 }]);
  assert.throws(() => run(s, { type: 'call.save', call: baseCall(s, { detailing: [{ product: 'Nope', slide: 1, seconds: 3 }] }) }, 'usr_rep1'), /not a product/);
  s = run(s, { type: 'call.save', call: baseCall(s, { detailing: views, reaction: 'Positive' }) }, 'usr_rep1');
  const st = detailingStats(s.calls);
  assert.equal(st[0].product, 'Cardiovex');
  assert.equal(st[0].avgSeconds, 35);
  assert.equal(st[0].reactions.Positive, 1);
});

test('events: organiser or manager edits, invited doctors must be visible, held events stay', () => {
  let s = seed();
  const a = repAccount(s);
  const other = repAccount(s, 'usr_rep3');
  const ev: MeetingEvent = {
    id: 'ev1', title: ' Cardiology CME ', kind: 'CME', date: '2026-10-10', time: '18:00', ownerId: 'usr_rep1', products: ['Cardiovex'], budget: 500000, status: 'Planned',
    attendees: [{ accountId: a.id, status: 'Invited' }, { accountId: a.id, status: 'Confirmed' }], createdAt: '', updatedAt: '',
  };
  s = run(s, { type: 'event.save', event: ev }, 'usr_rep1');
  assert.equal(s.events![0].title, 'Cardiology CME');
  assert.equal(s.events![0].attendees.length, 1, 'one place per doctor');
  assert.throws(() => run(s, { type: 'event.save', event: { ...ev, attendees: [{ accountId: other.id, status: 'Invited' }] } }, 'usr_rep1'), /cannot invite/);
  assert.throws(() => run(s, { type: 'event.save', event: ev }, 'usr_rep2'), /your own or your team/);
  s = run(s, { type: 'event.save', event: { ...ev, status: 'Done', spent: 450000, attendees: [{ accountId: a.id, status: 'Attended' }] } }, 'usr_flm1');
  assert.equal(s.events![0].ownerId, 'usr_rep1', 'a manager editing keeps the organiser');
  assert.throws(() => run(s, { type: 'event.delete', id: 'ev1' }, 'usr_rep1'), /stays on record/);
  assert.equal(scopeSnapshot(s, user(s, 'usr_rep2')).events!.length, 0);
  assert.equal(scopeSnapshot(s, user(s, 'usr_flm1')).events!.length, 1);
});

test('account changes: reps ask, managers decide; new accounts wait for review when the company asks', () => {
  let s = seed();
  const a = repAccount(s);
  // A rep's direct edit only changes the profile, never the details.
  s = run(s, { type: 'account.upsert', account: { ...a, name: 'Renamed', kol: true } }, 'usr_rep1');
  const after = s.accounts.find((x) => x.id === a.id)!;
  assert.equal(after.name, a.name);
  assert.equal(after.kol, true);

  assert.throws(() => run(s, { type: 'account.change', change: { id: 'ch0', accountId: a.id, byId: '', at: '', changes: { name: a.name }, status: 'Pending' } }, 'usr_rep1'), /Nothing/);
  s = run(s, { type: 'account.change', change: { id: 'ch1', accountId: a.id, byId: '', at: '', changes: { name: 'Dr New Name', phone: '0803 000 0000' }, note: 'Spelling', status: 'Approved' } }, 'usr_rep1');
  assert.equal(s.accountChanges![0].status, 'Pending');
  assert.equal(s.accountChanges![0].byId, 'usr_rep1');
  assert.throws(() => run(s, { type: 'account.review', id: 'ch1', approve: true }, 'usr_rep1'), /manager or an administrator/);
  assert.throws(() => run(s, { type: 'account.review', id: 'ch1', approve: true }, 'usr_flm2'), /manager or an administrator/);
  assert.throws(() => run(s, { type: 'account.review', id: 'ch1', approve: false }, 'usr_flm1'), /why/);

  const alerts = computeAlerts({ calls: [], plans: [], userId: 'usr_flm1', accountChanges: s.accountChanges, accounts: s.accounts, canReviewAccount: () => true }, now);
  assert.ok(alerts.items.some((i) => i.kind === 'account-review'));

  s = run(s, { type: 'account.review', id: 'ch1', approve: true }, 'usr_flm1');
  assert.equal(s.accounts.find((x) => x.id === a.id)!.name, 'Dr New Name');
  assert.equal(s.accountChanges![0].status, 'Approved');

  s = { ...s, settings: { ...s.settings, reviewNewAccounts: true } };
  const fresh: Account = { ...a, id: 'acc_new', name: 'Dr Fresh', createdAt: '' };
  s = run(s, { type: 'account.upsert', account: fresh }, 'usr_rep1');
  assert.equal(s.accounts.find((x) => x.id === 'acc_new')!.pendingReview, true);
  s = run(s, { type: 'account.upsert', account: { ...fresh, id: 'acc_new2', name: 'Dr Admin', createdAt: '' } }, 'usr_flm1');
  assert.equal(s.accounts.find((x) => x.id === 'acc_new2')!.pendingReview, undefined, 'managers’ accounts need no review');
  assert.throws(() => run(s, { type: 'account.verify', ids: ['acc_new'], approve: true }, 'usr_rep1'), /manager or an administrator/);
  s = run(s, { type: 'account.verify', ids: ['acc_new'], approve: false }, 'usr_flm1');
  assert.ok(s.accounts.find((x) => x.id === 'acc_new')!.deletedAt, 'turned down means deleted');
});

test('workplaces and merging duplicates', () => {
  let s = seed();
  const doc = repAccount(s);
  const org = repAccount(s, 'usr_rep1', 'HCO');
  const org2 = s.accounts.find((x) => x.type === 'HCO' && x.id !== org.id)!;
  s = run(s, { type: 'account.upsert', account: { ...doc, workplaces: [org.id, org.id, org2.id] } }, 'usr_flm1');
  assert.deepEqual(s.accounts.find((x) => x.id === doc.id)!.workplaces, [org.id, org2.id]);
  assert.throws(() => run(s, { type: 'account.upsert', account: { ...doc, workplaces: [doc.id === repAccount(s).id ? s.accounts.find((x) => x.type === 'HCP' && x.id !== doc.id)!.id : ''] } }, 'usr_flm1'), /not an organization/);
  s = run(s, { type: 'account.upsert', account: { ...s.accounts.find((x) => x.id === doc.id)!, workplaces: undefined, name: doc.name } }, 'usr_flm1');
  assert.equal(s.accounts.find((x) => x.id === doc.id)!.workplaces?.length, 2, 'leaving workplaces out keeps them');

  // A duplicate of the doctor, with a call, a plan target and an event place.
  const dup: Account = { ...doc, id: 'acc_dup', name: `Dr. ${doc.name.toUpperCase()}`, workplaces: undefined, createdAt: '' };
  s = run(s, { type: 'account.upsert', account: dup }, 'usr_flm1');
  assert.ok(possibleDuplicates({ name: doc.name, type: 'HCP', city: doc.city }, s.accounts).some((x) => x.account.id === 'acc_dup'));
  const groups = findDuplicates(s.accounts, (id) => s.calls.filter((c) => c.accountId === id).length);
  const g = groups.find((x) => x.accounts.some((a) => a.id === 'acc_dup'))!;
  assert.ok(g && g.accounts[0].id === doc.id, 'the one with history comes first');
  s = run(s, { type: 'call.save', call: baseCall(s, { id: 'cd', accountId: 'acc_dup' }) }, 'usr_rep1');
  assert.throws(() => run(s, { type: 'account.merge', keepId: doc.id, ids: ['acc_dup'] }, 'usr_flm1'), /administrator/);
  assert.throws(() => run(s, { type: 'account.merge', keepId: doc.id, ids: [org.id] }, 'usr_admin'), /same kind/);
  s = run(s, { type: 'account.merge', keepId: doc.id, ids: ['acc_dup'] }, 'usr_admin');
  assert.equal(s.calls.find((c) => c.id === 'cd')!.accountId, doc.id);
  const merged = s.accounts.find((x) => x.id === 'acc_dup')!;
  assert.ok(merged.deletedAt);
  assert.equal(merged.mergedInto, doc.id);

  assert.equal(normalName('Dr. Amara  OKAFOR'), 'amara okafor');
  assert.ok(nameSimilarity('Amara Okafor', 'Amara Okafour') > 0.85);
});

test('weekly coaching summary flags what needs a word', () => {
  const s = buildSeed(now);
  const cycle = currentCycle(s.cycles, now)!;
  const d = weeklyDigest(s, user(s, 'usr_flm2'), cycle, now);
  assert.equal(d.reps.length, 2);
  const emeka = d.reps.find((r) => r.rep.id === 'usr_rep4')!;
  assert.ok(emeka.risks.length > 0, 'the slow rep in the demo is flagged');
  assert.ok(d.reps[0].risks.length >= d.reps[1].risks.length, 'most flags first');
  const text = digestForAi(d);
  assert.ok(!text.includes('@'), 'no email addresses go to AI');
  assert.deepEqual(parseTips('- **Emeka Obi**: Ride along on Tuesday.\nKemi Lawal: Keep it up', ['Emeka Obi', 'Kemi Lawal']), { 'Emeka Obi': 'Ride along on Tuesday.', 'Kemi Lawal': 'Keep it up' });
});

test('visit next: open objectives and colleagues where a visit is booked', () => {
  let s = seed();
  const cycle = currentCycle(s.cycles, now);
  const org = repAccount(s, 'usr_rep1', 'HCO');
  const doc = s.accounts.find((a) => a.ownerId === 'usr_rep1' && a.type === 'HCP' && a.tier === 'T3')!;
  s = { ...s, accounts: s.accounts.map((a) => (a.id === doc.id ? { ...a, workplaces: [org.id] } : a)) };
  s = run(s, { type: 'call.save', call: baseCall(s, { id: 'pv', accountId: org.id, status: 'Planned', datetime: '2026-10-06T09:00:00.000Z', channel: 'In person', products: [] }) }, 'usr_rep1');
  s = run(s, { type: 'call.save', call: baseCall(s, { id: 'obj', accountId: doc.id, datetime: '2026-10-02T15:00:00.000Z', objectives: [{ text: 'Agree a trial', achieved: false }] }) }, 'usr_rep1');
  const list = nextVisits(s, 'usr_rep1', cycle, now, 50);
  const hit = list.find((v) => v.account.id === doc.id)!;
  assert.ok(hit, 'the doctor is suggested');
  assert.ok(hit.reasons.some((r) => r.startsWith('Objective to pick up')));
  assert.ok(hit.reasons.some((r) => r.startsWith(`Works at ${org.name}`)));
});
