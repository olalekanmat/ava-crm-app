import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_ROLES, buildDemo } from '../src/data/demo';
import { findDuplicates } from '../src/data/duplicates';
import { applyMutation } from '../src/data/mutations';
import { alertRoute, notifiableAlerts } from '../src/data/notifyAlerts';
import { sanitizeMutation } from '../src/data/sanitize';

const now = new Date('2026-10-14T10:00:00');

test('demo company: every role exists and shows the 2.7 examples', () => {
  const s = buildDemo(now);
  for (const r of DEMO_ROLES) assert.ok(s.users.some((u) => u.id === r.userId), r.key);
  assert.ok(findDuplicates(s.accounts).some((g) => g.accounts.some((a) => a.id === 'acc_dup1')), 'the typed-twice doctor is found');
  assert.equal(s.events?.length, 1);
  assert.ok(s.accounts.some((a) => a.workplaces?.length));
  assert.ok(s.calls.some((c) => c.objectives?.some((o) => o.achieved === false)));
});

test('demo company: changes check out like real ones', () => {
  const s = buildDemo(now);
  const flm = s.users.find((u) => u.id === 'usr_flm1')!;
  const m = sanitizeMutation(JSON.parse(JSON.stringify({ type: 'account.review', id: 'chg_demo1', approve: true })), now);
  const next = applyMutation(s, m, flm, now);
  assert.equal(next.accountChanges?.[0].status, 'Approved');
});

test('approval notifications: the manager hears about the correction and the new account, the rep does not', () => {
  const s = buildDemo(now);
  const flm = s.users.find((u) => u.id === 'usr_flm1')!;
  const rep = s.users.find((u) => u.id === 'usr_rep1')!;
  const kinds = notifiableAlerts(s, flm, now).map((i) => i.kind);
  assert.ok(kinds.includes('account-review'));
  assert.ok(kinds.includes('account-new'));
  assert.ok(!notifiableAlerts(s, rep, now).some((i) => i.kind === 'account-review'));
  assert.equal(alertRoute({ id: 'x', level: 'normal', kind: 'account-review', title: '', at: '' }), '/approvals');
  assert.equal(alertRoute({ id: 'x', level: 'normal', kind: 'event-soon', title: '', at: '', eventId: 'evt_1' }), '/events/evt_1');
});
