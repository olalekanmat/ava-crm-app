import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeSnapshot } from '../src/data/access';
import { openTodos } from '../src/data/alerts';
import { exportAccounts, importAccounts, importProducts } from '../src/data/csv';
import { approvedLeave, currentCycle, cycleElapsed } from '../src/data/metrics';
import { applyMutation, type Mutation } from '../src/data/mutations';
import { nextVisits } from '../src/data/nextBest';
import { profileBoost } from '../src/data/profile';
import { bestRoute, directionsUrl } from '../src/data/route';
import { sampleStock } from '../src/data/samples';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import type { Call, Cycle, Snapshot } from '../src/data/types';

const now = new Date('2026-10-03T12:00:00');
// The demo's own field work is left out so each test starts clean.
const seed = (): Snapshot => {
  const s = buildSeed(now);
  return { ...s, leaves: [], tasks: [], samples: [], calls: s.calls.map(({ samples: _s, coaching: _c, coachId: _k, ...c }) => c) };
};
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const run = (s: Snapshot, m: Mutation, as: string) => applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify(m)), now), user(s, as), now);

test('leave: rep asks, manager decides, approved days come out of plan pace', () => {
  let s = seed();
  const leave = { id: 'lv1', userId: 'usr_rep1', start: '2026-10-05', end: '2026-10-09', kind: 'Annual' as const, status: 'Approved' as const, createdAt: '' };
  s = run(s, { type: 'leave.request', leave }, 'usr_rep1');
  assert.equal(s.leaves![0].status, 'Pending', 'a request always starts pending');
  assert.throws(() => run(s, { type: 'leave.request', leave: { ...leave, id: 'lv2', userId: 'usr_rep2' } }, 'usr_rep1'), /your own leave/);
  assert.throws(() => run(s, { type: 'leave.review', id: 'lv1', approve: true }, 'usr_rep1'), /manager/);
  assert.throws(() => run(s, { type: 'leave.review', id: 'lv1', approve: true }, 'usr_flm2'), /manager/, 'another team’s manager cannot decide');
  assert.throws(() => run(s, { type: 'leave.review', id: 'lv1', approve: false }, 'usr_flm1'), /why/);
  s = run(s, { type: 'leave.review', id: 'lv1', approve: true }, 'usr_flm1');
  assert.equal(s.leaves![0].status, 'Approved');
  assert.equal(s.leaves![0].reviewerId, 'usr_flm1');

  // A whole quarter, half of which is leave: halfway through the working days is further along.
  const q: Cycle = { id: 'c', name: 'Q', start: '2026-10-01', end: '2026-12-31' };
  const mid = new Date('2026-11-15T12:00:00');
  const plain = cycleElapsed(q, mid);
  const away = cycleElapsed(q, mid, [{ start: '2026-12-01', end: '2026-12-31' }]);
  assert.ok(away > plain, 'leave still to come leaves fewer working days, so pace expects more by now');
  const past = cycleElapsed(q, mid, [{ start: '2026-10-01', end: '2026-10-31' }]);
  assert.ok(past < plain, 'days already away do not count as falling behind');
  assert.equal(approvedLeave(s, 'usr_rep1').length, 1);

  s = run(s, { type: 'leave.cancel', id: 'lv1' }, 'usr_rep1');
  assert.equal(approvedLeave(s, 'usr_rep1').length, 0);
  assert.ok(!scopeSnapshot(s, user(s, 'usr_rep2')).leaves!.length, 'colleagues do not see each other’s leave');
});

test('tasks: own or team only, follow-up tasks replace the follow-up item', () => {
  let s = seed();
  const acc = s.accounts.find((a) => a.ownerId === 'usr_rep1')!;
  const task = { id: 'tsk1', ownerId: 'usr_rep1', title: ' Send the reprint ', due: '2026-10-02', remindAt: '09:00', accountId: acc.id, createdAt: '' };
  s = run(s, { type: 'task.save', task }, 'usr_rep1');
  assert.equal(s.tasks![0].title, 'Send the reprint');
  assert.throws(() => run(s, { type: 'task.save', task: { ...task, id: 'tsk2', remindAt: '9am' } }, 'usr_rep1'), /reminder time|HH:MM/i);
  assert.throws(() => run(s, { type: 'task.save', task: { ...task, id: 'tsk3', ownerId: 'usr_rep2' } }, 'usr_rep1'), /yourself or your team/);
  s = run(s, { type: 'task.save', task: { ...task, id: 'tsk4', ownerId: 'usr_rep2' } }, 'usr_flm1');
  assert.equal(s.tasks!.find((t) => t.id === 'tsk4')!.assignedBy, 'usr_flm1');
  assert.throws(() => run(s, { type: 'task.done', id: 'tsk4', done: true }, 'usr_rep1'), /cannot change/);

  const todos = openTodos(s.tasks!, s.calls, 'usr_rep1', now, 7);
  assert.ok(todos.overdue.some((t) => t.id === 'tsk1'));
  s = run(s, { type: 'task.done', id: 'tsk1', done: true }, 'usr_rep1');
  assert.ok(!openTodos(s.tasks!, s.calls, 'usr_rep1', now, 7).overdue.some((t) => t.id === 'tsk1'));

  // A call follow-up with its own task shows once, as the task.
  const call: Call = { id: 'call_f', accountId: acc.id, ownerId: 'usr_rep1', datetime: new Date(now.getTime() - 3600e3).toISOString(), channel: 'Phone', status: 'Submitted', products: [{ product: 'Cardiovex', priority: 1 }], keyMessages: [], followUpDate: '2026-10-04', nextStep: 'Bring samples', createdAt: '', updatedAt: '' };
  s = run(s, { type: 'call.save', call }, 'usr_rep1');
  assert.ok(openTodos(s.tasks!, s.calls, 'usr_rep1', now, 7).current.some((t) => t.id === 'f:call_f'));
  s = run(s, { type: 'task.save', task: { ...task, id: 'tsk5', title: 'Bring samples', due: '2026-10-04', callId: 'call_f' } }, 'usr_rep1');
  const current = openTodos(s.tasks!, s.calls, 'usr_rep1', now, 7).current;
  assert.ok(current.some((t) => t.id === 'tsk5') && !current.some((t) => t.id === 'f:call_f'));
});

test('samples: managers issue, calls hand out, stock is the difference', () => {
  let s = seed();
  const issue = { id: 'smp1', repId: 'usr_rep1', product: 'Cardiovex', qty: 20, byId: '', at: '' };
  assert.throws(() => run(s, { type: 'sample.issue', issue }, 'usr_rep1'), /manager records/);
  assert.throws(() => run(s, { type: 'sample.issue', issue }, 'usr_flm2'), /own team/);
  assert.throws(() => run(s, { type: 'sample.issue', issue: { ...issue, product: 'Nope' } }, 'usr_flm1'), /not a product/);
  s = run(s, { type: 'sample.issue', issue }, 'usr_flm1');
  s = run(s, { type: 'sample.issue', issue: { ...issue, id: 'smp2', qty: -5 } }, 'usr_flm1');
  const acc = s.accounts.find((a) => a.ownerId === 'usr_rep1')!;
  const call: Call = { id: 'call_s', accountId: acc.id, ownerId: 'usr_rep1', datetime: new Date(now.getTime() - 3600e3).toISOString(), channel: 'In person', status: 'Saved', products: [{ product: 'Cardiovex', priority: 1 }], keyMessages: [], samples: [{ product: 'Cardiovex', qty: 4 }], createdAt: '', updatedAt: '' };
  assert.throws(() => run(s, { type: 'call.save', call: { ...call, samples: [{ product: 'Cardiovex', qty: 0 }] } }, 'usr_rep1'), /whole number/);
  s = run(s, { type: 'call.save', call }, 'usr_rep1');
  const stock = sampleStock(s, 'usr_rep1').find((x) => x.product === 'Cardiovex')!;
  assert.deepEqual([stock.received, stock.given, stock.balance], [15, 4, 11]);
  assert.equal(sampleStock(s, 'usr_rep1', 'call_s').find((x) => x.product === 'Cardiovex')!.balance, 15, 'editing a call leaves its own samples out');
});

test('coaching: the rep marks a coached visit, only a manager scores it, a rep save keeps the score', () => {
  let s = seed();
  const acc = s.accounts.find((a) => a.ownerId === 'usr_rep1')!;
  const call: Call = { id: 'call_c', accountId: acc.id, ownerId: 'usr_rep1', datetime: new Date(now.getTime() - 3600e3).toISOString(), channel: 'In person', status: 'Saved', products: [{ product: 'Cardiovex', priority: 1 }], keyMessages: [], coachId: 'usr_flm1', createdAt: '', updatedAt: '' };
  assert.throws(() => run(s, { type: 'call.save', call: { ...call, coachId: 'usr_flm2' } }, 'usr_rep1'), /one of your managers/);
  s = run(s, { type: 'call.save', call }, 'usr_rep1');
  const coaching = { by: '', at: '', scores: { Opening: 4, Closing: 2 }, strengths: 'Good opening', improve: 'Ask for the business' };
  assert.throws(() => run(s, { type: 'call.coach', id: 'call_c', coaching }, 'usr_rep1'), /manager/);
  assert.throws(() => run(s, { type: 'call.coach', id: 'call_c', coaching }, 'usr_flm2'), /manager/);
  assert.throws(() => run(s, { type: 'call.coach', id: 'call_c', coaching: { ...coaching, scores: { Opening: 6 } } }, 'usr_flm1'), /1 to 5/);
  s = run(s, { type: 'call.coach', id: 'call_c', coaching }, 'usr_flm1');
  assert.equal(s.calls.find((c) => c.id === 'call_c')!.coaching!.by, 'usr_flm1');
  s = run(s, { type: 'call.save', call: { ...call, status: 'Submitted', notes: 'done' } }, 'usr_rep1');
  assert.deepEqual(s.calls.find((c) => c.id === 'call_c')!.coaching!.scores, { Opening: 4, Closing: 2 });
  // The SLM above can also coach, even after submission.
  s = run(s, { type: 'call.coach', id: 'call_c', coaching: { ...coaching, scores: { Compliance: 5 } } }, 'usr_slm');
  assert.equal(s.calls.find((c) => c.id === 'call_c')!.coaching!.by, 'usr_slm');
});

test('doctor profile: kept when a change leaves it out, cleared when empty, more visits for KOLs', () => {
  let s = seed();
  const acc = s.accounts.find((a) => a.ownerId === 'usr_rep1' && a.type === 'HCP')!;
  s = run(s, { type: 'account.upsert', account: { ...acc, kol: true, potential: 'High', segment: ' Early adopter ' } }, 'usr_rep1');
  let a = s.accounts.find((x) => x.id === acc.id)!;
  assert.deepEqual([a.kol, a.potential, a.segment], [true, 'High', 'Early adopter']);
  // An older app sends the account without the profile fields: they stay.
  s = run(s, { type: 'account.upsert', account: { ...acc, name: 'Renamed' } }, 'usr_rep1');
  a = s.accounts.find((x) => x.id === acc.id)!;
  assert.deepEqual([a.name, a.kol, a.potential], ['Renamed', true, 'High']);
  s = run(s, { type: 'account.upsert', account: { ...a, kol: false, potential: '' as never, segment: '' } }, 'usr_rep1');
  a = s.accounts.find((x) => x.id === acc.id)!;
  assert.deepEqual([a.kol, a.potential, a.segment], [undefined, undefined, undefined]);
  assert.throws(() => run(s, { type: 'account.upsert', account: { ...a, potential: 'Huge' as never } }, 'usr_rep1'), /potential/i);

  assert.equal(profileBoost({ kol: true, potential: 'High' }), 3);
  assert.equal(profileBoost({ kol: true }, 'month'), 1);
  assert.equal(profileBoost({}), 0);
});

test('csv: profile and brochure columns are optional', () => {
  const s = seed();
  const acc = s.accounts.find((a) => a.ownerId === 'usr_rep1' && a.type === 'HCP')!;
  const withCols = `id,type,name,specialty,tier,city,owner_email,kol,potential,segment\n${acc.id},HCP,${acc.name},${acc.specialty},${acc.tier},${acc.city},tunde@ava.demo,yes,high,Loyalist`;
  const r = importAccounts(withCols, s);
  assert.ok(r.rows.every((x) => !x.errors.length), JSON.stringify(r.rows));
  assert.deepEqual([r.valid[0].kol, r.valid[0].potential, r.valid[0].segment], [true, 'High', 'Loyalist']);
  const without = importAccounts(`id,type,name,specialty,tier,city,owner_email\n${acc.id},HCP,${acc.name},${acc.specialty},${acc.tier},${acc.city},tunde@ava.demo`, s);
  assert.ok(!('kol' in without.valid[0]) && !('potential' in without.valid[0]), 'missing columns keep what the account has');
  assert.match(importAccounts(withCols.replace('high', 'huge'), s).rows[0].errors.join(), /High, Medium or Low/);
  assert.match(exportAccounts(s).split('\r\n')[0], /kol,potential,segment$/);

  const p = importProducts('name,brochure_url\nCardiovex,http://x.test/a.pdf', s);
  assert.match(p.rows[0].errors.join(), /https/);
  const ok = importProducts('name,brochure_url\nCardiovex,https://x.test/a.pdf', s);
  assert.equal(ok.valid[0].brochureUrl, 'https://x.test/a.pdf');
});

test('visit next: behind-plan, overdue follow-ups and KOLs rank first; booked accounts are left out', () => {
  // Three weeks on, after this week's booked visits.
  const later = new Date('2026-10-25T12:00:00');
  const s = seed();
  const cycle = currentCycle(s.cycles, later);
  const list = nextVisits(s, 'usr_rep1', cycle, later, 50);
  assert.ok(list.length > 0);
  assert.ok(list.every((v) => v.account.ownerId === 'usr_rep1' && v.reasons.length));
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
  const top = list[list.length - 1].account;
  const s2 = { ...s, accounts: s.accounts.map((a) => (a.id === top.id ? { ...a, kol: true, potential: 'High' as const } : a)) };
  const after = nextVisits(s2, 'usr_rep1', cycle, later, 50);
  assert.ok(after.findIndex((v) => v.account.id === top.id) < list.findIndex((v) => v.account.id === top.id), 'a KOL moves up');
  assert.ok(after.find((v) => v.account.id === top.id)!.reasons.includes('Key opinion leader'));
  const booked: Call = { id: 'call_b', accountId: top.id, ownerId: 'usr_rep1', datetime: new Date(later.getTime() + 864e5).toISOString(), channel: 'In person', status: 'Planned', products: [], keyMessages: [], createdAt: '', updatedAt: '' };
  assert.ok(!nextVisits({ ...s2, calls: [...s2.calls, booked] }, 'usr_rep1', cycle, later, 50).some((v) => v.account.id === top.id));
});

test('route: shortest order through the stops and a Google Maps link', () => {
  // Four points on a line, given out of order: the route visits them in line order.
  const stops = [
    { id: 'c', lat: 6.5, lng: 3.3 },
    { id: 'a', lat: 6.3, lng: 3.3 },
    { id: 'd', lat: 6.6, lng: 3.3 },
    { id: 'b', lat: 6.4, lng: 3.3 },
  ];
  const r = bestRoute(stops, { lat: 6.2, lng: 3.3 });
  assert.deepEqual(r.order.map((x) => x.id), ['a', 'b', 'c', 'd']);
  assert.ok(Math.abs(r.metres - 44478) < 200);
  const url = directionsUrl(r.order, { lat: 6.2, lng: 3.3 });
  assert.match(url, /origin=6\.200000,3\.300000/);
  assert.match(url, /destination=6\.600000,3\.300000/);
  assert.equal(decodeURIComponent(url.split('waypoints=')[1]).split('|').length, 3);
});
