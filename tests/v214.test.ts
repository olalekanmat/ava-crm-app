import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeSnapshot } from '../src/data/access';
import { achieved, expiringLots, invoiceTotals, priceFor, promiseState, stockLots, todayIso } from '../src/data/erp';
import { applyMutation, type Mutation } from '../src/data/mutations';
import { deckAllowed, liveContent, returnValue } from '../src/data/ops';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import { ERP_DEFAULTS, ERP_RULES_V2, WAREHOUSE, type Snapshot } from '../src/data/types';

// 2.14 (operations) and 2.15 (growth and compliance).

const now = new Date('2026-11-05T12:00:00');
const today = todayIso(now);
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const run = (s: Snapshot, m: Mutation, as: string, at = now) => applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify(m)), at), user(s, as), at);
const sig = { name: 'Pharmacist', strokes: [[1, 1, 50, 50, 100, 20]], at: '' };

function seed(): Snapshot {
  let s = buildSeed(now);
  s = run(s, { type: 'settings.update', settings: { erp: { ...ERP_DEFAULTS, ...s.settings.erp, ...ERP_RULES_V2, priceLists: { Hospitals: { Cardiovex: 8000 } } } } }, 'usr_admin');
  s = run(s, { type: 'distributor.save', distributor: { id: 'd1', name: 'MedPlus', active: true, createdAt: '' } }, 'usr_admin');
  const add = (id: string, functions: string[], extra: Record<string, unknown> = {}) =>
    (s = run(s, { type: 'user.upsert', user: { id, name: id, email: `${id}@ava.demo`, role: 'SLM', active: true, createdAt: '', functions, ...extra } as never }, 'usr_admin'));
  add('usr_fin', ['finance', 'invoicing']);
  add('usr_fin2', ['finance']);
  add('usr_med', ['medical']);
  add('usr_mkt', ['marketing']);
  add('usr_wh', ['warehouse']);
  add('usr_kam', ['kam']);
  add('usr_view', ['viewer']);
  add('usr_dist', ['distributor'], { role: 'Rep', distributorId: 'd1' });
  return s;
}
const hcoOf = (s: Snapshot, owner: string) => s.accounts.find((a) => a.ownerId === owner && a.type === 'HCO' && !a.deletedAt)!;
const sell = (s: Snapshot, id: string, qty = 10, at = now): Snapshot =>
  run(s, { type: 'invoice.create', invoice: { id, number: '', accountId: hcoOf(s, 'usr_rep1').id, ownerId: 'usr_rep1', date: todayIso(at), dueDate: todayIso(at), stockFrom: WAREHOUSE, status: 'Issued', payments: [], createdAt: '', lines: [{ product: 'Cardiovex', qty, unitPrice: 1000, vatPercent: 0 }] } }, 'usr_fin', at);

test('price lists: a customer on a list pays its price; others the list price', () => {
  let s = seed();
  const acc = hcoOf(s, 'usr_rep1');
  const p = { name: 'Cardiovex', price: 8500 };
  assert.equal(priceFor(p, acc, s.settings.erp!), 8500);
  assert.throws(() => run(s, { type: 'account.priceGroup', ids: [acc.id], group: 'Hospitals' }, 'usr_rep1'), /Finance/);
  assert.throws(() => run(s, { type: 'account.priceGroup', ids: [acc.id], group: 'Nope' }, 'usr_fin'), /price lists/);
  s = run(s, { type: 'account.priceGroup', ids: [acc.id], group: 'Hospitals' }, 'usr_fin');
  assert.equal(priceFor(p, s.accounts.find((a) => a.id === acc.id), s.settings.erp!), 8000);
});

test('split orders: part of an order moves to a new one with its own delivery date', () => {
  let s = seed();
  s = run(s, { type: 'order.create', order: { id: 'o1', number: '', accountId: hcoOf(s, 'usr_rep1').id, ownerId: 'usr_rep1', channel: 'Direct', lines: [{ product: 'Cardiovex', qty: 10, unitPrice: 100 }], status: 'Submitted', createdAt: '' } as never }, 'usr_rep1');
  assert.throws(() => run(s, { type: 'order.split', id: 'o1', newId: 'o2', lines: [{ product: 'Cardiovex', qty: 10 }] }, 'usr_fin'), /Leave something/);
  s = run(s, { type: 'order.split', id: 'o1', newId: 'o2', lines: [{ product: 'Cardiovex', qty: 4 }], deliveryDate: '2026-11-20' }, 'usr_fin');
  assert.equal(s.orders!.find((o) => o.id === 'o1')!.lines[0].qty, 6);
  const o2 = s.orders!.find((o) => o.id === 'o2')!;
  assert.equal(o2.lines[0].qty, 4);
  assert.equal(o2.deliveryDate, '2026-11-20');
  assert.match(o2.number, /0002$/);
});

test('returns: Finance approves, a credit note lowers the balance, resaleable stock goes back', () => {
  let s = seed();
  const units = (x: Snapshot) => stockLots(x).get(WAREHOUSE)!.filter((l) => l.product === 'Cardiovex').reduce((n, l) => n + l.qty, 0);
  const start = units(s);
  s = run(s, { type: 'stock.move', move: { id: 'r1', kind: 'receive', product: 'Cardiovex', qty: 100, to: WAREHOUSE, batch: 'B1', expiry: '2027-06-30', byId: '', at: '' } }, 'usr_wh');
  s = sell(s, 'i1');
  assert.equal(invoiceTotals(s.invoices!.find((i) => i.id === 'i1')!).balance, 10000);
  assert.throws(() => run(s, { type: 'return.request', request: { id: 'rt1', invoiceId: 'i1', accountId: '', lines: [{ product: 'Cardiovex', qty: 11 }], condition: 'Resaleable', reason: 'Too many', byId: '', at: '', status: 'Pending' } }, 'usr_rep1'), /Only 10/);
  s = run(s, { type: 'return.request', request: { id: 'rt1', invoiceId: 'i1', accountId: '', lines: [{ product: 'Cardiovex', qty: 3 }], condition: 'Resaleable', reason: 'Ordered too many', byId: '', at: '', status: 'Pending' } }, 'usr_rep1');
  assert.throws(() => run(s, { type: 'return.review', id: 'rt1', approve: true }, 'usr_rep1'), /Finance/);
  s = run(s, { type: 'return.review', id: 'rt1', approve: true }, 'usr_fin');
  const inv = s.invoices!.find((i) => i.id === 'i1')!;
  assert.equal(inv.credits?.[0].amount, 3000);
  assert.match(inv.credits![0].number, /-C1$/);
  assert.equal(invoiceTotals(inv).balance, 7000);
  assert.equal(returnValue(inv, [{ product: 'Cardiovex', qty: 1 }]), 1000);
  // 100 in, 10 out, 3 back.
  assert.equal(units(s) - start, 93);
});

test('batches: first expiry goes out first, near-expiry is flagged', () => {
  let s = seed();
  s = run(s, { type: 'stock.move', move: { id: 'r1', kind: 'receive', product: 'Cardiovex', qty: 20, to: WAREHOUSE, batch: 'LATE', expiry: '2028-01-31', byId: '', at: '' } }, 'usr_wh', new Date('2026-11-01T09:00:00'));
  s = run(s, { type: 'stock.move', move: { id: 'r2', kind: 'receive', product: 'Cardiovex', qty: 20, to: WAREHOUSE, batch: 'SOON', expiry: '2026-12-15', byId: '', at: '' } }, 'usr_wh', new Date('2026-11-02T09:00:00'));
  s = sell(s, 'i1', 25);
  const lots = stockLots(s).get(WAREHOUSE)!.filter((l) => l.batch === 'LATE' || l.batch === 'SOON');
  assert.deepEqual(lots.map((l) => [l.batch, l.qty]), [['LATE', 15]]);
  s = run(s, { type: 'stock.move', move: { id: 'r3', kind: 'receive', product: 'Cardiovex', qty: 5, to: WAREHOUSE, batch: 'X', expiry: '2026-12-01', byId: '', at: '' } }, 'usr_wh', new Date('2026-11-06T09:00:00'));
  const { soon } = expiringLots(stockLots(s).get(WAREHOUSE)!, today, 90);
  assert.deepEqual(soon.map((l) => l.batch), ['X']);
});

test('proof of delivery: signature or photo, once', () => {
  let s = seed();
  s = sell(s, 'i1');
  assert.throws(() => run(s, { type: 'invoice.deliver', invoiceId: 'i1', delivery: { at: '', byId: '', receivedBy: 'Ada' } }, 'usr_rep1'), /signature or a photo/);
  s = run(s, { type: 'invoice.deliver', invoiceId: 'i1', delivery: { at: '', byId: '', receivedBy: 'Ada', signature: sig, lat: 6.5, lng: 3.3 } }, 'usr_rep1');
  assert.equal(s.invoices!.find((i) => i.id === 'i1')!.delivery?.receivedBy, 'Ada');
});

test('collections: promises to pay are kept, broken or open', () => {
  let s = seed();
  s = sell(s, 'i1');
  const acc = hcoOf(s, 'usr_rep1').id;
  s = run(s, { type: 'promise.add', promise: { id: 'p1', accountId: acc, amount: 5000, date: '2026-11-10', byId: '', at: '' } }, 'usr_rep1');
  const p = s.promises![0];
  assert.equal(promiseState(s, p, today), 'Open');
  assert.equal(promiseState(s, p, '2026-11-11'), 'Broken');
  s = run(s, { type: 'invoice.pay', invoiceId: 'i1', payment: { id: 'pay1', amount: 5000, method: 'Transfer', date: '2026-11-08', receiptNo: '', byId: '', at: '' } }, 'usr_fin', new Date('2026-11-08T12:00:00'));
  assert.equal(promiseState(s, p, '2026-11-11'), 'Kept');
  assert.equal(achieved(s, 'usr_rep1', '2026-11').collection, 5000);
});

test('targets: set by the manager or Finance, one per person per month', () => {
  let s = seed();
  assert.throws(() => run(s, { type: 'target.set', target: { id: 't1', userId: 'usr_rep1', month: '2026-11', sales: 100, setBy: '', at: '' } }, 'usr_rep1'), /manager/);
  s = run(s, { type: 'target.set', target: { id: 't1', userId: 'usr_rep1', month: '2026-11', sales: 100, collection: 50, setBy: '', at: '' } }, 'usr_flm1');
  s = run(s, { type: 'target.set', target: { id: 't2', userId: 'usr_rep1', month: '2026-11', sales: 200, setBy: '', at: '' } }, 'usr_fin');
  assert.equal(s.targets!.length, 1);
  assert.equal(s.targets![0].sales, 200);
});

test('content: Marketing sends, Medical approves, expired items disappear, decks need approval', () => {
  let s = seed();
  s = run(s, { type: 'settings.update', settings: { contentApproval: true } }, 'usr_admin');
  const hash = 'a'.repeat(64);
  s = run(s, { type: 'content.save', doc: { id: 'c1', title: 'Cardiovex detail aid', product: 'Cardiovex', kind: 'Detail aid', deckHash: hash, version: 1, status: 'Pending', endDate: '2026-12-31', byId: '', at: '' } }, 'usr_mkt');
  assert.equal(s.content![0].status, 'Pending');
  assert.ok(!deckAllowed(s, hash, today));
  assert.throws(() => run(s, { type: 'content.review', id: 'c1', approve: true }, 'usr_mkt'), /Medical/);
  s = run(s, { type: 'content.review', id: 'c1', approve: true }, 'usr_med');
  assert.ok(deckAllowed(s, hash, today));
  assert.ok(!deckAllowed(s, hash, '2027-01-01'), 'expired');
  assert.equal(liveContent(s, today).length, 1);
  // A change makes a new version that waits again.
  s = run(s, { type: 'content.save', doc: { ...s.content![0], title: 'Cardiovex detail aid v2' } }, 'usr_mkt');
  assert.equal(s.content![0].version, 2);
  assert.equal(s.content![0].status, 'Pending');
});

test('campaigns, safety reports and expenses follow their owners', () => {
  let s = seed();
  assert.throws(() => run(s, { type: 'campaign.save', campaign: { id: 'k1', name: 'Launch', keyMessages: [], objectives: [], targetIds: [], start: today, end: '2026-12-31', status: 'Live', ownerId: '', createdAt: '', updatedAt: '' } }, 'usr_rep1'), /Marketing/);
  s = run(s, { type: 'campaign.save', campaign: { id: 'k1', name: 'Launch', product: 'Cardiovex', keyMessages: ['Once daily'], objectives: [], targetIds: [hcoOf(s, 'usr_rep1').id], start: today, end: '2026-12-31', status: 'Live', ownerId: '', createdAt: '', updatedAt: '' } }, 'usr_mkt');
  assert.equal(s.campaigns!.length, 1);
  s = run(s, { type: 'safety.report', report: { id: 'ae1', kind: 'Adverse event', product: 'Cardiovex', description: 'Rash after 2 days', serious: false, byId: '', at: '', status: 'New' } }, 'usr_rep1');
  assert.throws(() => run(s, { type: 'safety.handle', id: 'ae1', status: 'Closed' }, 'usr_med'), /how it was handled/);
  s = run(s, { type: 'safety.handle', id: 'ae1', status: 'Acknowledged' }, 'usr_med');
  assert.equal(s.safetyReports![0].status, 'Acknowledged');
  s = run(s, { type: 'expense.submit', expense: { id: 'e1', userId: 'usr_rep1', date: today, category: 'Fuel', amount: 12000, status: 'Pending', at: '' } }, 'usr_rep1');
  assert.throws(() => run(s, { type: 'expense.pay', ids: ['e1'] }, 'usr_fin'), /approved/);
  s = run(s, { type: 'expense.review', id: 'e1', approve: true }, 'usr_flm1');
  s = run(s, { type: 'expense.pay', ids: ['e1'] }, 'usr_fin');
  assert.equal(s.expenses![0].status, 'Paid');
});

test('roles: viewers change nothing, KAMs see their key accounts, distributors see only theirs', () => {
  let s = seed();
  assert.throws(() => run(s, { type: 'task.save', task: { id: 't', ownerId: 'usr_view', title: 'x', due: today, createdAt: '' } }, 'usr_view'), /read-only/);
  assert.equal(scopeSnapshot(s, user(s, 'usr_view')).accounts.length, s.accounts.length);
  const acc = hcoOf(s, 'usr_rep1');
  assert.throws(() => run(s, { type: 'account.kam', ids: [acc.id], kamId: 'usr_rep1' }, 'usr_admin'), /key account manager/);
  s = run(s, { type: 'account.kam', ids: [acc.id], kamId: 'usr_kam' }, 'usr_admin');
  assert.deepEqual(scopeSnapshot(s, user(s, 'usr_kam')).accounts.map((a) => a.id), [acc.id]);
  // Distributor sign-in: uploads its own report, nothing else.
  s = run(s, { type: 'secondary.upload', uploadId: 'u1', distributorId: 'd1', month: '2026-10', rows: [{ product: 'Cardiovex', qty: 40, value: 320000, stock: 12 }] }, 'usr_dist');
  assert.equal(s.secondarySales!.length, 1);
  s = run(s, { type: 'secondary.upload', uploadId: 'u2', distributorId: 'd1', month: '2026-10', rows: [{ product: 'Cardiovex', qty: 50 }] }, 'usr_fin');
  assert.deepEqual(s.secondarySales!.map((r) => r.qty), [50], 'a new report for the month replaces the old one');
  assert.throws(() => run(s, { type: 'promise.add', promise: { id: 'p', accountId: acc.id, amount: 1, date: today, byId: '', at: '' } }, 'usr_dist'), /Distributor sign-ins/);
  const view = scopeSnapshot(s, user(s, 'usr_dist'));
  assert.equal(view.accounts.length, 0);
  assert.equal(view.secondarySales!.length, 1);
});
