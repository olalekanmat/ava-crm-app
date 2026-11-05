import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canMoveCall, cycleOn, droppedCall, movedDatetime, planDoctors, snapHour } from '../src/data/calendarPlan';
import { toDateKey } from '../src/data/dates';
import { applyMutation } from '../src/data/mutations';
import { buildSeed } from '../src/data/seed';

// 2.15: cycle-plan doctors beside the calendar, drag a doctor onto a day, drag a visit to another day.

const now = new Date('2026-11-05T12:00:00');

test('moving a call keeps its time, or takes the hour it was dropped on (to the quarter hour)', () => {
  const iso = new Date(2026, 10, 10, 14, 30).toISOString();
  const kept = new Date(movedDatetime(iso, '2026-11-12'));
  assert.equal(toDateKey(kept), '2026-11-12');
  assert.equal(kept.getHours(), 14);
  assert.equal(kept.getMinutes(), 30);
  const at = new Date(movedDatetime(iso, '2026-11-13', 10.6));
  assert.equal(at.getHours(), 10);
  assert.equal(at.getMinutes(), 30);
  assert.equal(snapHour(-2), 0);
  assert.equal(snapHour(30), 23.75);
});

test('only your own unsubmitted calls can be dragged', () => {
  assert.equal(canMoveCall({ ownerId: 'a', status: 'Planned' }, 'a'), true);
  assert.equal(canMoveCall({ ownerId: 'a', status: 'Saved' }, 'a'), true);
  assert.equal(canMoveCall({ ownerId: 'a', status: 'Submitted' }, 'a'), false);
  assert.equal(canMoveCall({ ownerId: 'b', status: 'Planned' }, 'a'), false);
});

test('plan doctors count what is done, booked and left; a dropped doctor becomes a planned visit', () => {
  let s = buildSeed(now);
  const day = toDateKey(now);
  const cycle = cycleOn(s, day);
  assert.ok(cycle, 'the seed has a cycle for today');
  const rep = s.plans.find((p) => p.cycleId === cycle!.id && p.targets.length)?.ownerId;
  assert.ok(rep, 'the seed has a plan this cycle');
  const before = planDoctors(s, rep!, day);
  assert.ok(before.plan && before.doctors.length);
  for (const d of before.doctors) assert.equal(d.left, Math.max(0, d.planned - d.done - d.scheduled));
  // Most visits left come first.
  for (let i = 1; i < before.doctors.length; i++) assert.ok(before.doctors[i - 1].left >= before.doctors[i].left);

  const target = before.doctors[0];
  const user = s.users.find((u) => u.id === rep)!;
  const call = droppedCall('call_drop', target.account.id, rep!, '2026-11-20', 11);
  s = applyMutation(s, { type: 'call.save', call }, user, now);
  const after = planDoctors(s, rep!, day).doctors.find((d) => d.account.id === target.account.id)!;
  assert.equal(after.scheduled, target.scheduled + 1);
  assert.equal(after.left, Math.max(0, target.left - 1));
  assert.equal(new Date(s.calls.find((c) => c.id === 'call_drop')!.datetime).getHours(), 11);

  // Dragged to another day.
  const moved = { ...s.calls.find((c) => c.id === 'call_drop')!, datetime: movedDatetime(call.datetime, '2026-11-24') };
  s = applyMutation(s, { type: 'call.save', call: moved }, user, now);
  assert.equal(toDateKey(new Date(s.calls.find((c) => c.id === 'call_drop')!.datetime)), '2026-11-24');

  // "All accounts" adds the rep's other accounts after the plan.
  const all = planDoctors(s, rep!, day, true).doctors;
  assert.ok(all.length >= before.doctors.length);
  assert.ok(all.slice(before.doctors.length).every((d) => !d.inPlan && d.account.ownerId === rep));
});
