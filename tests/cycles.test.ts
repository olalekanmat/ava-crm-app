import assert from 'node:assert/strict';
import { test } from 'node:test';
import { genesisSnapshot, replay, type CompanyFile, type JournalFile } from '../src/cloud/journal';
import { exportCyclePlans } from '../src/data/csv';
import {
  activeCycleLength, companyMonthCycles, cyclesInMonth, cyclesOfLength, isMonthId, lengthOfCycle, monthCycle, monthCycles, planningCycles, previousCycle, quarterCycles, scaleFrequency,
} from '../src/data/cycles';
import { parseCsv } from '../src/data/csv';
import { currentCycle, cycleElapsed, daysLeft, repMetrics } from '../src/data/metrics';
import { applyMutation, describeMutation, RuleError, type Mutation } from '../src/data/mutations';
import { sanitizeMutation } from '../src/data/sanitize';
import type { Account, User } from '../src/data/types';

const now = new Date('2026-10-08T12:00:00');

test('monthly cycles: ids, names and dates', () => {
  assert.deepEqual(monthCycle(2026, 10), { id: 'm2026-10', name: 'Oct 2026', start: '2026-10-01', end: '2026-10-31' });
  assert.equal(monthCycle(2028, 2).end, '2028-02-29', 'leap year');
  assert.equal(monthCycle(2026, 2).end, '2026-02-28');
  assert.equal(monthCycles(2026, 2026).length, 12);
  const cs = companyMonthCycles('2026-10-04T10:00:00Z', new Date('2026-10-04T12:00:00Z'));
  assert.equal(cs[0].id, 'm2025-01');
  assert.equal(cs.at(-1)!.id, 'm2027-12');
  assert.ok(isMonthId('m2026-10') && !isMonthId('m2026-13') && !isMonthId('q2026-4'));
  assert.equal(lengthOfCycle({ id: 'm2026-01' }), 'month');
  assert.equal(lengthOfCycle({ id: 'q2026-1' }), 'quarter');
  assert.equal(lengthOfCycle({ id: 'cyc_1' }), 'quarter', 'early custom cycles count as quarterly');
  assert.equal(activeCycleLength(undefined), 'quarter');
  assert.equal(activeCycleLength({ cycleLength: 'month' }), 'month');
});

test('the current cycle follows the active length; quarterly stays the default', () => {
  const cycles = [...quarterCycles(2026, 2027), ...monthCycles(2026, 2027)];
  assert.equal(currentCycle(cycles, now, 'quarter')!.id, 'q2026-4');
  assert.equal(currentCycle(cycles, now, 'month')!.id, 'm2026-10');
  // Without monthly cycles in the data (an old company file), monthly falls back to what exists.
  assert.equal(currentCycle(quarterCycles(2026, 2026), now, 'month')!.id, 'q2026-4');
  assert.deepEqual(planningCycles(cycles, 'month', '2026-10-08').map((c) => c.id), ['m2026-10', 'm2026-11']);
  assert.deepEqual(planningCycles(cycles, 'quarter', '2026-10-08').map((c) => c.id), ['q2026-4', 'q2027-1']);
  assert.equal(previousCycle(cycles, monthCycle(2026, 1)), undefined, 'no month before the data starts');
  assert.equal(previousCycle(cycles, monthCycle(2026, 10))!.id, 'm2026-09');
  assert.equal(cyclesOfLength(cycles, 'month').length, 24);
  assert.deepEqual(cyclesInMonth(cycles, 'quarter', 2026, 9).map((c) => c.id), ['q2026-4']);
  assert.deepEqual(cyclesInMonth(cycles, 'month', 2026, 1).map((c) => c.id), ['m2026-02']);

  // Pace and days left work on a month as on a quarter.
  const oct = monthCycle(2026, 10);
  assert.equal(daysLeft(oct, now), 24);
  const pace = cycleElapsed(oct, now);
  assert.ok(pace > 0.2 && pace < 0.26);
});

test('tier frequencies scale down for monthly plans', () => {
  assert.equal(scaleFrequency(8, 'quarter'), 8);
  assert.equal(scaleFrequency(8, 'month'), 3);
  assert.equal(scaleFrequency(6, 'month'), 2);
  assert.equal(scaleFrequency(2, 'month'), 1);
  assert.equal(scaleFrequency(1, 'month'), 1, 'at least one call');
  assert.equal(scaleFrequency(0, 'month'), 0, 'zero stays zero');
});

const genesis: CompanyFile = {
  format: 'ava-crm/1', companyId: 'cmp_cycles', createdAt: '2026-10-01T08:00:00.000Z', createdBy: 'boss@acme.com', provider: 'onedrive', company: { name: 'Acme' },
  admin: { id: 'usr_admin', name: 'Boss', email: 'boss@acme.com', role: 'Admin', active: true, createdAt: '2026-10-01T08:00:00.000Z' },
};
const flm: User = { id: 'usr_flm', name: 'Femi', email: 'femi@acme.com', role: 'FLM', active: true, createdAt: genesis.createdAt };
const rep: User = { id: 'usr_rep', name: 'Rita', email: 'rita@acme.com', role: 'Rep', managerId: 'usr_flm', active: true, createdAt: genesis.createdAt };
const account: Account = { id: 'acc_1', type: 'HCP', name: 'Dr. One', specialty: 'GP', tier: 'T1', address: '', city: 'Ikeja', ownerId: 'usr_rep', createdAt: genesis.createdAt };
const at = (min: number) => new Date(Date.parse('2026-10-02T08:00:00Z') + min * 60000).toISOString();
const journal = (u: User, entries: [string, Mutation][]): JournalFile => ({
  format: 'ava-journal/1', companyId: genesis.companyId, userId: u.id, email: u.email, deviceId: 'd1', entries: entries.map(([when, m], i) => ({ seq: i + 1, at: when, m })),
});

test('administrators switch to monthly cycles; plans keep their original cycle', () => {
  const g = genesisSnapshot(genesis, now);
  assert.ok(g.cycles.some((c) => c.id === 'm2026-10') && g.cycles.some((c) => c.id === 'q2026-4'), 'both lengths exist from the start');

  // Only administrators may change it, and only to a known length.
  const clean = sanitizeMutation({ type: 'settings.update', settings: { cycleLength: 'month' } }, now);
  assert.deepEqual(clean, { type: 'settings.update', settings: { cycleLength: 'month' } });
  assert.equal(describeMutation(clean), 'Set planning cycles to monthly');
  assert.throws(() => sanitizeMutation({ type: 'settings.update', settings: { cycleLength: 'week' } }, now), RuleError);

  const adminJ = journal(genesis.admin, [
    [at(1), { type: 'import.users', users: [flm, rep] }],
    [at(2), { type: 'import.accounts', accounts: [account] }],
    [at(10), { type: 'settings.update', settings: { cycleLength: 'month' } }],
    [at(30), { type: 'settings.update', settings: { cycleLength: 'quarter' } }],
  ]);
  const repJ = journal(rep, [
    // A quarterly plan made before the switch.
    [at(5), { type: 'plan.save', plan: { id: 'pln_q', ownerId: rep.id, cycleId: 'q2026-4', status: 'Draft', targets: [{ accountId: 'acc_1', planned: 6 }], updatedAt: at(5) } }],
    [at(11), { type: 'settings.update', settings: { cycleLength: 'quarter' } }],
    // A monthly plan made after it.
    [at(20), { type: 'plan.save', plan: { id: 'pln_m', ownerId: rep.id, cycleId: 'm2026-10', status: 'Draft', targets: [{ accountId: 'acc_1', planned: 2 }], updatedAt: at(20) } }],
  ]);
  const midway = replay(genesis, [{ journal: adminJ }, { journal: { ...repJ, entries: repJ.entries.slice(0, 3) } }], new Date(Date.parse(at(25))));
  assert.match(midway.log.find((l) => l.userId === rep.id && l.seq === 2)!.error!, /administrator/, 'a rep cannot change the cycle length');

  const r = replay(genesis, [{ journal: { ...adminJ, entries: adminJ.entries.slice(0, 3) } }, { journal: repJ }], now);
  assert.equal(r.snapshot.settings.cycleLength, 'month');
  assert.deepEqual(r.snapshot.plans.map((p) => p.cycleId).sort(), ['m2026-10', 'q2026-4']);
  assert.equal(currentCycle(r.snapshot.cycles, now, activeCycleLength(r.snapshot.settings))!.id, 'm2026-10');

  // Switching back: the monthly plan stays (with its month) and quarterly planning resumes.
  const back = replay(genesis, [{ journal: adminJ }, { journal: repJ }], now);
  assert.equal(back.snapshot.settings.cycleLength, 'quarter');
  assert.equal(back.snapshot.plans.length, 2);
  assert.equal(currentCycle(back.snapshot.cycles, now, activeCycleLength(back.snapshot.settings))!.id, 'q2026-4');

  // Metrics and the plan export work on the monthly plan.
  const oct = r.snapshot.cycles.find((c) => c.id === 'm2026-10')!;
  assert.equal(repMetrics(r.snapshot, r.snapshot.users.find((u) => u.id === rep.id)!, oct).planned, 2);
  const csv = parseCsv(exportCyclePlans(r.snapshot, oct));
  assert.deepEqual(csv[0].slice(-4), ['cycle_id', 'cycle_length', 'cycle_start', 'cycle_end']);
  assert.deepEqual(csv[1].slice(-4), ['m2026-10', 'monthly', '2026-10-01', '2026-10-31']);
  assert.equal(csv[1][0], 'Oct 2026');

  // An older app (2.2) ignores the unknown field: settings.update without it changes nothing.
  const old = applyMutation(r.snapshot, { type: 'settings.update', settings: {} }, r.snapshot.users[0], now);
  assert.equal(old.settings.cycleLength, 'month');
  // Replays are deterministic.
  assert.deepEqual(replay(genesis, [{ journal: adminJ }, { journal: repJ }], now).snapshot, back.snapshot);
});
