import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAskContext, MAX_CONTEXT } from '../src/ai/context';
import {
  accountsForTranscript,
  buildBriefInput,
  buildPlanInput,
  checkVisits,
  coerceResult,
  filterAskActions,
  filterPlanTargets,
  mergeCallNote,
  toPlanTargets,
  visitsToCalls,
  workingDays,
} from '../src/ai/logic';
import { scopeSnapshot, withoutDeleted } from '../src/data/access';
import { toDateKey } from '../src/data/dates';
import { applyMutation } from '../src/data/mutations';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import type { Account, Call, Snapshot } from '../src/data/types';

const now = new Date('2026-10-03T12:00:00');
const seed = () => buildSeed(now);
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const scoped = (s: Snapshot, id: string) => withoutDeleted(scopeSnapshot(s, user(s, id)));

test('ask context: rep sees only their own accounts, valid JSON under the limit', () => {
  const s = seed();
  const data = scoped(s, 'usr_rep1');
  const json = buildAskContext(data, user(s, 'usr_rep1'), now);
  assert.ok(json.length <= MAX_CONTEXT);
  const ctx = JSON.parse(json);
  assert.equal(ctx.me.name, 'Tunde Okoro');
  assert.equal(ctx.today, '2026-10-03');
  assert.ok(ctx.cycle && typeof ctx.cycle.attainmentPct === 'number');
  assert.ok(Array.isArray(ctx.topAccounts) && ctx.topAccounts.length > 0);
  const own = new Set(s.accounts.filter((a) => a.ownerId === 'usr_rep1').map((a) => a.id));
  for (const a of ctx.topAccounts) assert.ok(own.has(a.accountId), 'only own accounts');
  assert.equal(ctx.reps, undefined, 'no team rollup for a rep');
  // Other reps' names never appear.
  assert.ok(!json.includes('Chioma Eze') && !json.includes('Kemi Lawal'));
});

test('ask context: managers get team rollups; SLM gets teams', () => {
  const s = seed();
  const flm = JSON.parse(buildAskContext(scoped(s, 'usr_flm1'), user(s, 'usr_flm1'), now));
  assert.deepEqual(flm.reps.map((r: { repId: string }) => r.repId).sort(), ['usr_rep1', 'usr_rep2']);
  const slm = JSON.parse(buildAskContext(scoped(s, 'usr_slm'), user(s, 'usr_slm'), now));
  assert.equal(slm.teams.length, 2);
  assert.equal(slm.reps.length, 4);
});

test('ask context: stays under the size limit for a big company', () => {
  const s = seed();
  const rep = user(s, 'usr_rep1');
  const accounts: Account[] = [];
  const calls: Call[] = [];
  for (let i = 0; i < 3000; i++) {
    accounts.push({ id: `big_${i}`, type: 'HCP', name: `Dr Very Long Account Name Number ${i}`, specialty: 'Cardiology', tier: ['ST', 'T1', 'T2', 'T3'][i % 4], address: '1 Road', city: 'Lagos', ownerId: rep.id, createdAt: now.toISOString() });
    for (let k = 0; k < 3; k++) {
      const d = new Date(now.getTime() + (k - 1) * 5 * 86400000 + i * 60000).toISOString();
      calls.push({ id: `bc_${i}_${k}`, accountId: `big_${i}`, ownerId: rep.id, datetime: d, channel: 'In person', status: k === 2 ? 'Planned' : 'Submitted', products: [{ product: 'Cardiovex', priority: 1 }], keyMessages: [], notes: 'x'.repeat(200), followUpDate: toDateKey(now), createdAt: d, updatedAt: d });
    }
  }
  const big = { ...s, accounts: [...s.accounts, ...accounts], calls: [...s.calls, ...calls] };
  const json = buildAskContext(scoped(big, 'usr_admin'), user(big, 'usr_admin'), now);
  assert.ok(json.length <= MAX_CONTEXT, `got ${json.length}`);
  const ctx = JSON.parse(json);
  assert.ok(ctx.counts.accounts > 3000);
  assert.ok(ctx.topAccounts.length > 0);
  // A tiny limit still gives valid JSON with the headline numbers.
  const tiny = JSON.parse(buildAskContext(scoped(big, 'usr_admin'), user(big, 'usr_admin'), now, 2000));
  assert.ok(tiny.counts);
});

test('coerceResult tolerates junk and rejects no result', () => {
  assert.throws(() => coerceResult('ask', null));
  const r = coerceResult('call_note', { notes: 5, productsDiscussed: 'x', keyMessages: [{ message: 'm' }, 'bad'], followUpDate: '2026-13-40' });
  assert.equal(r.notes, '5');
  assert.deepEqual(r.productsDiscussed, []);
  assert.equal(r.keyMessages.length, 1);
  assert.equal(r.followUpDate, null);
  const a = coerceResult('ask', { answer: 'Hi', actions: [{ type: 'delete_everything' }, { type: 'open_account', accountId: 'acc_1', label: 'Open' }] });
  assert.equal(a.actions.length, 1);
});

test('call note: products and key messages are matched to the company list', () => {
  const s = seed();
  const merged = mergeCallNote(
    { notes: 'raw words', chosen: ['Neurolin'], messages: [], nextStep: '', followUp: '', attendees: 'Nurse Ada' },
    {
      notes: 'Discussed Cardiovex dosing.',
      productsDiscussed: ['cardiovex', 'Made Up Drug'],
      keyMessages: [
        { product: 'Cardiovex', message: 'once-daily dosing' },
        { product: 'Cardiovex', message: 'Invented claim' },
        { product: 'Glucara XR', message: 'Weight-neutral' },
      ],
      nextStep: 'Bring leaflets',
      followUpDate: '2026-09-01',
      attendees: '',
    },
    s.products,
    '2026-10-03',
  );
  assert.deepEqual(merged.chosen, ['Neurolin', 'Cardiovex']);
  assert.deepEqual(merged.messages, ['Once-daily dosing'], 'unknown messages and messages for products not on the call are dropped');
  assert.equal(merged.notes, 'Discussed Cardiovex dosing.');
  assert.equal(merged.nextStep, 'Bring leaflets');
  assert.equal(merged.followUp, '', 'past follow-up ignored');
  assert.equal(merged.attendees, 'Nurse Ada', 'empty AI field keeps what the rep typed');
});

test('voice to plan: only known accounts, valid future times, and the calls pass the rules', () => {
  const s = seed();
  const rep = user(s, 'usr_rep1');
  const mine = s.accounts.filter((a) => a.ownerId === rep.id);
  const other = s.accounts.find((a) => a.ownerId === 'usr_rep2')!;
  const sent = accountsForTranscript(mine, 'visit');
  const visits = checkVisits(
    [
      { accountId: mine[0].id, date: '2026-10-06', time: '10:00', note: 'Bring study' },
      { accountId: mine[0].id, date: '2026-10-06', time: '10:00', note: 'duplicate' },
      { accountId: other.id, date: '2026-10-07', time: '9:00', note: '' },
      { accountId: 'acc_made_up', date: '2026-10-07', time: '9:00', note: '' },
      { accountId: mine[1].id, date: '2026-10-01', time: '09:00', note: '' },
      { accountId: mine[2].id, date: 'Friday', time: '09:00', note: '' },
      { accountId: mine[3].id, date: '2026-10-09', time: 'noon', note: '' },
    ],
    sent,
    now,
  );
  assert.equal(visits.length, 4);
  assert.ok(!visits.some((v) => v.accountId === other.id));
  assert.equal(visits.find((v) => v.accountId === mine[1].id)?.problem, 'This time has passed.');
  assert.equal(visits.find((v) => v.accountId === mine[2].id)?.problem, 'No valid date.');
  assert.equal(visits.find((v) => v.accountId === mine[3].id)?.time, '09:00', 'unreadable time defaults to 9:00');

  let i = 0;
  const calls = visitsToCalls(visits, rep.id, now, () => `call_ai_${i++}`);
  assert.equal(calls.length, 2);
  let next = s;
  for (const call of calls) {
    assert.equal(call.status, 'Planned');
    next = applyMutation(next, sanitizeMutation(JSON.parse(JSON.stringify({ type: 'call.save', call })), now), rep, now);
  }
  assert.equal(next.calls.filter((c) => c.id.startsWith('call_ai_')).length, 2);
  assert.equal(next.calls.find((c) => c.id === 'call_ai_0')?.notes, 'Bring study');
});

test('voice to plan: large territories send the accounts that were mentioned first', () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}`, name: `Account ${i}`, city: 'Ikeja' }));
  many.push({ id: 'lagoon', name: 'Lagoon Hospital', city: 'Lagos' });
  const out = accountsForTranscript(many, 'Visit Dr Ade at Lagoon hospital on Tuesday', 50);
  assert.equal(out.length, 50);
  assert.equal(out[0].id, 'lagoon');
});

test('cycle plan: input from the rep’s territory; output filtered to known accounts', () => {
  const s = seed();
  const data = scoped(s, 'usr_rep1');
  const cycle = s.cycles.find((c) => c.id === 'cyc_next')!;
  const input = buildPlanInput(data, 'usr_rep1', cycle);
  assert.ok(input.accounts.length > 0 && input.accounts.every((a) => s.accounts.find((x) => x.id === a.id)?.ownerId === 'usr_rep1'));
  assert.deepEqual(input.tiers.map((t) => t.name), ['ST', 'T1', 'T2', 'T3']);
  assert.ok(input.capacity > 0);
  assert.ok(input.accounts.some((a) => a.callsLastCycle > 0), 'last cycle calls are counted');
  assert.ok(workingDays('2026-10-05', '2026-10-11') === 5);

  const ids = input.accounts.map((a) => a.id);
  const filtered = filterPlanTargets(
    [
      { accountId: ids[0], planned: 6.4, reason: 'Top tier' },
      { accountId: ids[0], planned: 3, reason: 'dupe' },
      { accountId: ids[1], planned: 0, reason: 'skip' },
      { accountId: ids[2], planned: 99, reason: 'cap' },
      { accountId: 'acc_other', planned: 4, reason: 'not mine' },
      { accountId: ids[3], planned: Number.NaN, reason: 'nan' },
    ],
    ids,
  );
  assert.deepEqual(toPlanTargets(filtered), [
    { accountId: ids[0], planned: 6 },
    { accountId: ids[2], planned: 50 },
  ]);
  // The accepted plan saves through the normal rules.
  const rep = user(s, 'usr_rep1');
  const plan = { id: 'pln_ai', ownerId: rep.id, cycleId: cycle.id, status: 'Draft' as const, targets: toPlanTargets(filtered), updatedAt: now.toISOString() };
  const next = applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify({ type: 'plan.save', plan })), now), rep, now);
  assert.equal(next.plans.find((p) => p.id === 'pln_ai')?.targets.length, 2);
});

test('ask actions point only at accounts the user can see', () => {
  const known = new Set(['acc_1']);
  const out = filterAskActions(
    [
      { type: 'open_account', accountId: 'acc_1', label: '' },
      { type: 'open_account', accountId: 'acc_99', label: 'Hidden' },
      { type: 'open_account', label: 'No id' },
      { type: 'plan_visit', label: 'Plan' },
      { type: 'plan_visit', accountId: 'acc_99', label: 'Plan hidden' },
      { type: 'open_report', label: 'Report' },
    ],
    known,
  );
  assert.deepEqual(out.map((a) => a.label), ['Open account', 'Plan', 'Report']);
});

test('brief input holds the account and its latest calls only', () => {
  const s = seed();
  const a = s.accounts[0];
  const input = buildBriefInput(a, s.calls.filter((c) => c.accountId === a.id), '2026-10-03');
  assert.equal(input.account.name, a.name);
  assert.ok(input.calls.length <= 12);
  assert.ok(!('ownerId' in input.account));
});

test('company AI switch: admin only, survives replay, absent means on', () => {
  const s = seed();
  assert.equal(s.settings.aiEnabled, undefined);
  const admin = user(s, 'usr_admin');
  const off = applyMutation(s, sanitizeMutation({ type: 'settings.update', settings: { aiEnabled: false } }, now), admin, now);
  assert.equal(off.settings.aiEnabled, false);
  assert.equal(off.settings.geofenceM, s.settings.geofenceM);
  // Changing another setting keeps the switch.
  const geo = applyMutation(off, sanitizeMutation({ type: 'settings.update', settings: { geofenceM: 500 } }, now), admin, now);
  assert.equal(geo.settings.aiEnabled, false);
  assert.throws(() => applyMutation(s, { type: 'settings.update', settings: { aiEnabled: false } }, user(s, 'usr_rep1'), now), /administrator/);
  assert.throws(() => sanitizeMutation({ type: 'settings.update', settings: { aiEnabled: 'no' } }, now), /Invalid/);
});
