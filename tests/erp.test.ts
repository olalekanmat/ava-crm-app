import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeSnapshot } from '../src/data/access';
import { customerBalances, invoiceTotals, lineTotals, payState, salesSummary, shortages, stockAt, todayIso } from '../src/data/erp';
import { applyMutation, type Mutation } from '../src/data/mutations';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import { WAREHOUSE, type Snapshot } from '../src/data/types';

// 2.11: Ava ERP rules — invoices, payments, cancelling, stock and who sees what.

const now = new Date('2026-10-16T12:00:00');
const today = todayIso(now);
const seed = (): Snapshot => buildSeed(now);
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const run = (s: Snapshot, m: Mutation, as: string, at = now) => applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify(m)), at), user(s, as), at);
const customerOf = (s: Snapshot, owner: string) => s.accounts.find((a) => a.ownerId === owner && !a.deletedAt)!;

const sale = (s: Snapshot, id: string, owner: string, extra: Partial<Record<string, unknown>> = {}): Mutation => ({
  type: 'invoice.create',
  invoice: {
    id, number: '', accountId: customerOf(s, owner).id, ownerId: owner, date: today, dueDate: today, stockFrom: owner, status: 'Issued', payments: [], createdAt: '',
    lines: [{ product: 'Cardiovex', qty: 10, unitPrice: 8500, vatPercent: 7.5, discountPercent: 10 }],
    ...extra,
  } as never,
});

test('line and invoice totals: discount before VAT, rounded per line', () => {
  assert.deepEqual(lineTotals({ product: 'X', qty: 3, unitPrice: 33.33, vatPercent: 7.5, discountPercent: 10 }), { gross: 99.99, discount: 10, net: 89.99, vat: 6.75, total: 96.74 });
  const t = invoiceTotals({ status: 'Issued', lines: [{ product: 'A', qty: 2, unitPrice: 100, vatPercent: 0 }, { product: 'B', qty: 1, unitPrice: 50, vatPercent: 10 }], payments: [{ id: 'p', amount: 100, method: 'Cash', date: today, receiptNo: '', byId: '', at: '' }] });
  assert.equal(t.total, 255);
  assert.equal(t.balance, 155);
});

test('invoices: numbered per seller in order, priced lines kept, stock goes down', () => {
  let s = seed();
  const before = stockAt(s, 'usr_rep1').get('Cardiovex') ?? 0;
  const mine = (s.invoices ?? []).filter((i) => i.ownerId === 'usr_rep1').length;
  s = run(s, sale(s, 'inv_a', 'usr_rep1'), 'usr_rep1');
  s = run(s, sale(s, 'inv_b', 'usr_rep1'), 'usr_rep1');
  const a = s.invoices!.find((i) => i.id === 'inv_a')!;
  const b = s.invoices!.find((i) => i.id === 'inv_b')!;
  assert.match(a.number, new RegExp(`-${String(mine + 1).padStart(4, '0')}$`));
  assert.match(b.number, new RegExp(`-${String(mine + 2).padStart(4, '0')}$`));
  assert.equal(invoiceTotals(a).total, 82237.5);
  assert.equal(stockAt(s, 'usr_rep1').get('Cardiovex'), before - 20);
  // Replaying the same create does nothing.
  assert.equal(run(s, sale(s, 'inv_a', 'usr_rep1'), 'usr_rep1'), s);
});

test('invoices: who may sell what, from where', () => {
  const s = seed();
  assert.throws(() => run(s, sale(s, 'x1', 'usr_rep2'), 'usr_rep1'), /yourself or your team/);
  assert.throws(() => run(s, sale(s, 'x2', 'usr_rep1', { stockFrom: WAREHOUSE }), 'usr_rep1'), /own stock or the warehouse/);
  assert.throws(() => run(s, sale(s, 'x3', 'usr_rep1', { stockFrom: 'usr_rep2' }), 'usr_flm1'), /own stock or the warehouse/);
  assert.throws(() => run(s, sale(s, 'x4', 'usr_rep1', { lines: [{ product: 'Nope', qty: 1, unitPrice: 1, vatPercent: 0 }] }), 'usr_rep1'), /not a product/);
  assert.throws(() => run(s, sale(s, 'x5', 'usr_rep1', { lines: [{ product: 'Cardiovex', qty: 1.5, unitPrice: 1, vatPercent: 0 }] }), 'usr_rep1'), /whole number/);
  assert.throws(() => run(s, sale(s, 'x6', 'usr_rep1', { dueDate: '2026-01-01' }), 'usr_rep1'), /due date/);
  // A manager sells for a rep from the warehouse.
  const t = run(s, sale(s, 'x7', 'usr_rep1', { stockFrom: WAREHOUSE }), 'usr_flm1');
  assert.equal(t.invoices!.at(-1)!.ownerId, 'usr_rep1');
});

test('selling past stock or the credit limit is allowed (offline) but shows as a shortage', () => {
  const s = seed();
  const have = stockAt(s, 'usr_rep1').get('Neurolin') ?? 0;
  assert.deepEqual(shortages(s, 'usr_rep1', [{ product: 'Neurolin', qty: have + 5 }]), [{ product: 'Neurolin', have, want: have + 5 }]);
  const t = run(s, sale(s, 'big', 'usr_rep1', { lines: [{ product: 'Neurolin', qty: have + 5, unitPrice: 15200, vatPercent: 7.5 }] }), 'usr_rep1');
  assert.equal(stockAt(t, 'usr_rep1').get('Neurolin'), -5);
});

test('payments: part, full, receipt numbers, no overpaying; removing one needs a manager', () => {
  let s = seed();
  s = run(s, sale(s, 'inv_p', 'usr_rep1'), 'usr_rep1');
  const pay = (id: string, amount: number): Mutation => ({ type: 'invoice.pay', invoiceId: 'inv_p', payment: { id, amount, method: 'Transfer', date: today, receiptNo: '', byId: '', at: '' } });
  s = run(s, pay('p1', 40000), 'usr_rep1');
  let inv = s.invoices!.find((i) => i.id === 'inv_p')!;
  assert.equal(payState(inv, today), 'Part paid');
  assert.equal(inv.payments[0].receiptNo, `${inv.number}-R1`);
  assert.throws(() => run(s, pay('p2', 50000), 'usr_rep1'), /more than/);
  assert.throws(() => run(s, pay('p2', 100), 'usr_rep3'), /own or your team/);
  s = run(s, pay('p2', 42237.5), 'usr_flm1');
  inv = s.invoices!.find((i) => i.id === 'inv_p')!;
  assert.equal(payState(inv, today), 'Paid');
  const unpay: Mutation = { type: 'invoice.unpay', invoiceId: 'inv_p', paymentId: 'p2', reason: 'Bounced' };
  assert.throws(() => run(s, unpay, 'usr_rep1'), /Ask your manager/);
  s = run(s, unpay, 'usr_flm1');
  assert.equal(invoiceTotals(s.invoices!.find((i) => i.id === 'inv_p')!).balance, 42237.5);
});

test('cancelling: seller on the same day, manager later, never with payments; stock comes back', () => {
  let s = seed();
  const before = stockAt(s, 'usr_rep1').get('Cardiovex') ?? 0;
  s = run(s, sale(s, 'inv_v', 'usr_rep1'), 'usr_rep1');
  const later = new Date(now.getTime() + 2 * 86400000);
  assert.throws(() => run(s, { type: 'invoice.void', id: 'inv_v', reason: 'Wrong customer' }, 'usr_rep1', later), /Ask your manager/);
  assert.throws(() => run(s, { type: 'invoice.void', id: 'inv_v', reason: 'x' }, 'usr_rep3'), /Ask your manager/);
  const paid = run(s, { type: 'invoice.pay', invoiceId: 'inv_v', payment: { id: 'pv', amount: 10, method: 'Cash', date: today, receiptNo: '', byId: '', at: '' } }, 'usr_rep1');
  assert.throws(() => run(paid, { type: 'invoice.void', id: 'inv_v', reason: 'x' }, 'usr_rep1'), /Remove its payments/);
  s = run(s, { type: 'invoice.void', id: 'inv_v', reason: 'Wrong customer' }, 'usr_rep1');
  const inv = s.invoices!.find((i) => i.id === 'inv_v')!;
  assert.equal(payState(inv), 'Void');
  assert.equal(inv.voidedBy, 'usr_rep1');
  assert.equal(stockAt(s, 'usr_rep1').get('Cardiovex'), before);
  // Cancelled invoices keep their number; the next one does not reuse it.
  s = run(s, sale(s, 'inv_w', 'usr_rep1'), 'usr_rep1');
  assert.notEqual(s.invoices!.find((i) => i.id === 'inv_w')!.number, inv.number);
});

test('stock: managers receive and hand out, reps only send their own back, adjustments need a reason', () => {
  let s = seed();
  const move = (id: string, kind: string, from?: string, to?: string, note?: string): Mutation => ({ type: 'stock.move', move: { id, kind, product: 'Glucara XR', qty: 10, from, to, note, byId: '', at: '' } as never });
  const wh = stockAt(s, WAREHOUSE).get('Glucara XR') ?? 0;
  assert.throws(() => run(s, move('m1', 'receive', undefined, WAREHOUSE), 'usr_rep1'), /managers and administrators receive/);
  s = run(s, move('m1', 'receive', undefined, WAREHOUSE), 'usr_flm1');
  assert.equal(stockAt(s, WAREHOUSE).get('Glucara XR'), wh + 10);
  assert.throws(() => run(s, move('m2', 'transfer', WAREHOUSE, 'usr_rep1'), 'usr_rep1'), /Only a manager/);
  assert.throws(() => run(s, move('m2', 'transfer', WAREHOUSE, 'usr_rep3'), 'usr_flm1'), /Only a manager/);
  s = run(s, move('m2', 'transfer', WAREHOUSE, 'usr_rep1'), 'usr_flm1');
  s = run(s, move('m3', 'transfer', 'usr_rep1', WAREHOUSE), 'usr_rep1');
  assert.throws(() => run(s, move('m4', 'transfer', 'usr_rep1', 'usr_rep2'), 'usr_rep1'), /Only a manager/);
  assert.throws(() => run(s, move('m5', 'adjust', 'usr_rep1', undefined, 'Damaged'), 'usr_rep1'), /adjust stock/);
  assert.throws(() => run(s, move('m5', 'adjust', 'usr_rep1', undefined), 'usr_flm1'), /why/);
  s = run(s, move('m5', 'adjust', 'usr_rep1', undefined, 'Damaged'), 'usr_flm1');
  assert.equal(s.stockMoves!.at(-1)!.note, 'Damaged');
});

test('credit limits: managers and administrators only; reps keep it on account saves', () => {
  let s = seed();
  const acc = customerOf(s, 'usr_rep1');
  assert.throws(() => run(s, { type: 'account.credit', id: acc.id, limit: 100000 }, 'usr_rep1'), /credit limits/);
  s = run(s, { type: 'account.credit', id: acc.id, limit: 100000 }, 'usr_flm1');
  assert.equal(s.accounts.find((a) => a.id === acc.id)!.creditLimit, 100000);
  const saved = s.accounts.find((a) => a.id === acc.id)!;
  s = run(s, { type: 'account.upsert', account: { ...saved, creditLimit: 9e9 } } as Mutation, 'usr_rep1');
  assert.equal(s.accounts.find((a) => a.id === acc.id)!.creditLimit, 100000);
  s = run(s, { type: 'account.credit', id: acc.id }, 'usr_admin');
  assert.equal(s.accounts.find((a) => a.id === acc.id)!.creditLimit, undefined);
});

test('scope: reps see their own invoices and stock, managers their team, balances add up', () => {
  const s = seed();
  const rep = scopeSnapshot(s, user(s, 'usr_rep1'));
  assert.ok(rep.invoices!.length > 0);
  assert.ok(rep.invoices!.every((i) => i.ownerId === 'usr_rep1'));
  assert.ok(rep.stockMoves!.every((m) => m.from === 'usr_rep1' || m.to === 'usr_rep1' || m.from === WAREHOUSE || m.to === WAREHOUSE || (!m.from && !m.to)));
  const flm = scopeSnapshot(s, user(s, 'usr_flm2'));
  assert.ok(flm.invoices!.every((i) => ['usr_rep3', 'usr_rep4', 'usr_flm2'].includes(i.ownerId)));
  const sum = salesSummary(s.invoices!, '2000-01-01', today, today);
  const owed = customerBalances(s, today).reduce((n, c) => n + c.owed, 0);
  assert.equal(Math.round(sum.owed), Math.round(owed));
  assert.ok(sum.overdue > 0, 'the demo has overdue money');
});

test('sanitize: unknown invoice fields are dropped and the number is always set on apply', () => {
  const s = seed();
  const m = sale(s, 'inv_s', 'usr_rep1', { number: 'HACKED-1', status: 'Void', payments: [{ id: 'p', amount: 1e9 }], evil: true });
  const clean = sanitizeMutation(JSON.parse(JSON.stringify(m)), now) as Extract<Mutation, { type: 'invoice.create' }>;
  assert.equal(clean.invoice.number, '');
  assert.equal(clean.invoice.status, 'Issued');
  assert.deepEqual(clean.invoice.payments, []);
  assert.equal((clean.invoice as unknown as Record<string, unknown>).evil, undefined);
  const t = applyMutation(s, clean, user(s, 'usr_rep1'), now);
  assert.notEqual(t.invoices!.at(-1)!.number, 'HACKED-1');
});
