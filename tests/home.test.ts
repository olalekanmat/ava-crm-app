import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAlerts, openFollowUps, paceOf, planHealth } from '../src/data/alerts';
import { agenda, hourRange, weekKeys, weekStart } from '../src/data/schedule';
import type { Call, CyclePlan } from '../src/data/types';

const now = new Date('2026-10-08T12:00:00');
const call = (id: string, over: Partial<Call>): Call => ({
  id, accountId: 'a1', ownerId: 'me', datetime: '2026-10-08T09:00:00', channel: 'In person', status: 'Planned', products: [], keyMessages: [], createdAt: '', updatedAt: '', ...over,
});
const plan = (id: string, over: Partial<CyclePlan>): CyclePlan => ({ id, ownerId: 'me', cycleId: 'c', status: 'Draft', targets: [], updatedAt: '2026-10-01T00:00:00', ...over });

test('alerts: overdue plans and late drafts are urgent, returned plans important, fresh drafts normal', () => {
  const r = computeAlerts(
    {
      userId: 'me',
      reviewable: ['rep'],
      calls: [
        call('overdue', { datetime: '2026-10-06T10:00:00' }),
        call('today', { datetime: '2026-10-08T15:00:00' }),
        call('late', { status: 'Saved', datetime: '2026-10-07T08:00:00' }),
        call('fresh', { status: 'Saved', datetime: '2026-10-08T08:00:00' }),
        call('done', { status: 'Submitted', datetime: '2026-10-01T08:00:00' }),
        call('other', { ownerId: 'x', datetime: '2026-10-01T08:00:00' }),
      ],
      plans: [plan('p1', { status: 'Rejected' }), plan('p2', { ownerId: 'rep', status: 'Submitted' }), plan('p3', { ownerId: 'stranger', status: 'Submitted' })],
    },
    now,
  );
  assert.equal(r.urgent, 2);
  assert.equal(r.important, 2);
  assert.equal(r.normal, 1);
  assert.deepEqual(r.items.slice(0, 2).map((i) => i.callId).sort(), ['late', 'overdue']);
  assert.equal(r.items.at(-1)!.callId, 'fresh');
});

test('follow-ups: overdue vs current, done once a later call is submitted', () => {
  const f = openFollowUps(
    [
      call('a', { status: 'Submitted', datetime: '2026-09-20T09:00:00', followUpDate: '2026-10-01' }),
      call('b', { accountId: 'a2', status: 'Submitted', datetime: '2026-10-05T09:00:00', followUpDate: '2026-10-10' }),
      call('c', { accountId: 'a3', status: 'Submitted', datetime: '2026-09-01T09:00:00', followUpDate: '2026-09-10' }),
      call('d', { accountId: 'a3', status: 'Submitted', datetime: '2026-09-12T09:00:00' }),
      call('e', { accountId: 'a4', status: 'Submitted', datetime: '2026-10-05T09:00:00', followUpDate: '2026-12-01' }),
    ],
    'me',
    now,
  );
  assert.deepEqual(f.overdue.map((x) => x.call.id), ['a']);
  assert.deepEqual(f.current.map((x) => x.call.id), ['b']);
});

test('plan health follows pace thresholds', () => {
  assert.equal(paceOf(5, 10, 0.5), 'onTrack');
  assert.equal(paceOf(4, 10, 0.5), 'atRisk');
  assert.equal(paceOf(1, 10, 0.5), 'behind');
  assert.equal(paceOf(2, 2, 0.1), 'onTrack');
  const done: Record<string, number> = { a: 5, b: 4, c: 0 };
  assert.deepEqual(
    planHealth([{ accountId: 'a', planned: 10 }, { accountId: 'b', planned: 10 }, { accountId: 'c', planned: 10 }], (id) => done[id] ?? 0, 0.5),
    { onTrack: 1, atRisk: 1, behind: 1 },
  );
});

test('schedule helpers: Monday-first weeks, agenda grouping, hour range', () => {
  const mon = weekStart(new Date('2026-10-08T12:00:00'));
  assert.deepEqual(weekKeys(mon), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(weekKeys(weekStart(new Date('2026-10-11T23:00:00')))[0], '2026-10-05');
  const cs = [call('x', { datetime: '2026-10-09T07:30:00' }), call('y', { datetime: '2026-10-08T11:00:00' }), call('z', { datetime: '2026-10-09T10:00:00' }), call('old', { datetime: '2026-10-01T10:00:00' })];
  const a = agenda(cs, '2026-10-08');
  assert.deepEqual(a.map((d) => d.key), ['2026-10-08', '2026-10-09']);
  assert.deepEqual(a[1].calls.map((c) => c.id), ['x', 'z']);
  assert.deepEqual(hourRange(cs), [7, 18]);
});
