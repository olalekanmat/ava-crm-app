import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeSnapshot } from '../src/data/access';
import { ageBand, allocate, debtAge, holdsFor, invoiceTotals, owedBy, payState, stockAt, todayIso } from '../src/data/erp';
import { applyMutation, type Mutation } from '../src/data/mutations';
import { can, holdersOf } from '../src/data/roles';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import { ERP_DEFAULTS, ERP_RULES_V2, WAREHOUSE, type Snapshot } from '../src/data/types';

// 2.13: orders, payment confirmation, credit approval, function roles and the HCO-only rule.

const now = new Date('2026-11-05T12:00:00');
const today = todayIso(now);
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const run = (s: Snapshot, m: Mutation, as: string, at = now) => applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify(m)), at), user(s, as), at);

/** The seed on the 2.13 rules, with a Finance person, an invoicing officer and a credit approver. */
function seed(): Snapshot {
  let s = buildSeed(now);
  s = run(s, { type: 'settings.update', settings: { erp: { ...ERP_DEFAULTS, ...s.settings.erp, ...ERP_RULES_V2 } } }, 'usr_admin');
  const add = (id: string, name: string, functions: string[]) =>
    (s = run(s, { type: 'user.upsert', user: { id, name, email: `${id}@ava.demo`, role: 'SLM', active: true, createdAt: '', functions } as never }, 'usr_admin'));
  add('usr_fin', 'Femi Finance', ['finance']);
  add('usr_inv', 'Ifeoma Invoicing', ['invoicing']);
  add('usr_cm', 'Chidi Country', ['creditApprover']);
  add('usr_fin2', 'Funke Finance', ['finance']);
  return s;
}
const hcoOf = (s: Snapshot, owner: string) => s.accounts.find((a) => a.ownerId === owner && a.type === 'HCO' && !a.deletedAt)!;
const hcpOf = (s: Snapshot, owner: string) => s.accounts.find((a) => a.ownerId === owner && a.type === 'HCP' && !a.deletedAt)!;

const order = (s: Snapshot, id: string, owner: string, extra: Record<string, unknown> = {}): Mutation => ({
  type: 'order.create',
  order: { id, number: '', accountId: hcoOf(s, owner).id, ownerId: owner, channel: 'Direct', lines: [{ product: 'Cardiovex', qty: 10, unitPrice: 8500 }], status: 'Submitted', createdAt: '', ...extra } as never,
});

test('function roles: saved on people, kept when an older app leaves them out, admins hold all', () => {
  let s = seed();
  assert.deepEqual(user(s, 'usr_fin').functions, ['finance']);
  // An edit without the field keeps it; unknown names are dropped.
  s = run(s, { type: 'user.upsert', user: { ...user(s, 'usr_fin'), functions: undefined, name: 'Femi F.' } as never }, 'usr_admin');
  assert.deepEqual(user(s, 'usr_fin').functions, ['finance']);
  s = run(s, { type: 'user.upsert', user: { ...user(s, 'usr_fin'), functions: ['finance', 'nope', 'finance', 'marketing'] } as never }, 'usr_admin');
  assert.deepEqual(user(s, 'usr_fin').functions, ['finance', 'marketing']);
  assert.ok(can(user(s, 'usr_admin'), 'creditApprover'));
  assert.ok(!can(user(s, 'usr_rep1'), 'finance'));
  assert.deepEqual(holdersOf(s.users, 'invoicing').map((u) => u.id), ['usr_inv']);
  // Back-office roles see the whole company; reps only their own.
  assert.equal(scopeSnapshot(s, user(s, 'usr_fin')).accounts.length, s.accounts.length);
  assert.ok(scopeSnapshot(s, user(s, 'usr_rep1')).accounts.length < s.accounts.length);
});

test('orders: numbered, HCOs only, reps cannot invoice directly, the office invoices them', () => {
  let s = seed();
  s = run(s, order(s, 'o1', 'usr_rep1'), 'usr_rep1');
  const o = s.orders!.find((x) => x.id === 'o1')!;
  assert.match(o.number, /^ORD-.+-0001$/);
  assert.equal(o.status, 'Submitted');
  assert.ok(o.payFirst, 'cash and carry by default');
  assert.throws(() => run(s, order(s, 'o2', 'usr_rep1', { accountId: hcpOf(s, 'usr_rep1').id }), 'usr_rep1'), /business accounts/);
  // 2.13: a rep's quick sale is now an order.
  const sale: Mutation = { type: 'invoice.create', invoice: { id: 'i1', number: '', accountId: hcoOf(s, 'usr_rep1').id, ownerId: 'usr_rep1', date: today, dueDate: today, stockFrom: 'usr_rep1', status: 'Issued', payments: [], createdAt: '', lines: [{ product: 'Cardiovex', qty: 1, unitPrice: 8500, vatPercent: 7.5 }] } };
  assert.throws(() => run(s, sale, 'usr_rep1'), /Place an order/);
  // Unless the company allows van sales.
  const van = run(s, { type: 'settings.update', settings: { erp: { ...s.settings.erp!, repsInvoice: true } } }, 'usr_admin');
  assert.ok(run(van, sale, 'usr_rep1').invoices!.some((i) => i.id === 'i1'));
  // Only the invoicing officer invoices it; the invoice follows the customer's terms and the order.
  assert.throws(() => run(s, { type: 'order.invoice', id: 'o1', invoiceId: 'i9', date: today, stockFrom: WAREHOUSE }, 'usr_flm1'), /invoicing officer/);
  const before = stockAt(s, WAREHOUSE).get('Cardiovex') ?? 0;
  s = run(s, { type: 'order.invoice', id: 'o1', invoiceId: 'i9', date: today, stockFrom: WAREHOUSE }, 'usr_inv');
  const inv = s.invoices!.find((i) => i.id === 'i9')!;
  assert.equal(inv.ownerId, 'usr_rep1');
  assert.equal(inv.orderId, 'o1');
  assert.equal(inv.dueDate, today);
  assert.equal(inv.lines[0].vatPercent, 7.5);
  assert.equal(s.orders!.find((x) => x.id === 'o1')!.status, 'Invoiced');
  assert.equal(stockAt(s, WAREHOUSE).get('Cardiovex'), before - 10);
  assert.throws(() => run(s, { type: 'order.cancel', id: 'o1' }, 'usr_rep1'), /already invoiced/);
});

test('orders: credit limit, old debt and big discounts put them on hold; the right person releases', () => {
  let s = seed();
  const acc = hcoOf(s, 'usr_rep1');
  // 300 units at 8,500 + VAT is over the ₦2m default limit.
  s = run(s, order(s, 'big', 'usr_rep1', { lines: [{ product: 'Cardiovex', qty: 300, unitPrice: 8500, discountPercent: 15 }] }), 'usr_rep1');
  const o = s.orders!.find((x) => x.id === 'big')!;
  assert.equal(o.status, 'On hold');
  assert.deepEqual(o.holds, ['credit', 'discount']);
  assert.throws(() => run(s, { type: 'order.invoice', id: 'big', invoiceId: 'ib', date: today, stockFrom: WAREHOUSE }, 'usr_inv'), /on hold/);
  assert.throws(() => run(s, { type: 'order.release', id: 'big' }, 'usr_rep1'), /releases/);
  s = run(s, { type: 'order.release', id: 'big', note: 'Paying Friday' }, 'usr_fin');
  assert.deepEqual(s.orders!.find((x) => x.id === 'big')!.holds, ['discount']);
  assert.throws(() => run(s, { type: 'order.release', id: 'big' }, 'usr_fin'), /credit approver/);
  s = run(s, { type: 'order.release', id: 'big' }, 'usr_cm');
  assert.equal(s.orders!.find((x) => x.id === 'big')!.status, 'Submitted');
  // Debt overdue by more than 30 days holds the next order.
  const old = new Date('2026-09-01T12:00:00');
  let t = seed();
  t = run(t, { type: 'invoice.create', invoice: { id: 'old', number: '', accountId: acc.id, ownerId: 'usr_rep1', date: '2026-09-01', dueDate: '2026-09-01', stockFrom: WAREHOUSE, status: 'Issued', payments: [], createdAt: '', lines: [{ product: 'Cardiovex', qty: 1, unitPrice: 1000, vatPercent: 0 }] } }, 'usr_inv', old);
  assert.ok(holdsFor(t, { id: 'n', accountId: acc.id, channel: 'Direct', lines: [{ product: 'Cardiovex', qty: 1, unitPrice: 1 }] }, today).includes('overdue'));
  // A distributor order adds nothing to what is owed to us.
  assert.deepEqual(holdsFor(t, { id: 'n', accountId: acc.id, channel: 'Distributor', lines: [{ product: 'Cardiovex', qty: 999, unitPrice: 99999 }] }, today), []);
});

test('distributor sales: tagged, forwarded, no stock and nothing owed to us', () => {
  let s = seed();
  s = run(s, { type: 'distributor.save', distributor: { id: 'd1', name: 'Mega Pharma Distributors', active: true, createdAt: '' } }, 'usr_fin');
  assert.throws(() => run(s, { type: 'distributor.save', distributor: { id: 'd2', name: 'X', active: true, createdAt: '' } }, 'usr_rep1'), /manages distributors/);
  assert.throws(() => run(s, order(s, 'od', 'usr_rep1', { channel: 'Distributor' }), 'usr_rep1'), /distributor/);
  s = run(s, order(s, 'od', 'usr_rep1', { channel: 'Distributor', distributorId: 'd1' }), 'usr_rep1');
  assert.throws(() => run(s, { type: 'order.invoice', id: 'od', invoiceId: 'x', date: today, stockFrom: WAREHOUSE }, 'usr_inv'), /Forward/);
  s = run(s, { type: 'order.forward', id: 'od' }, 'usr_inv');
  assert.equal(s.orders!.find((x) => x.id === 'od')!.status, 'Forwarded');
  // An invoice tagged as bought through a distributor: no stock, no debt.
  const acc = hcoOf(s, 'usr_rep1');
  const before = stockAt(s, WAREHOUSE).get('Cardiovex');
  s = run(s, { type: 'invoice.create', invoice: { id: 'vd', number: '', accountId: acc.id, ownerId: 'usr_rep1', date: today, dueDate: today, stockFrom: '', channel: 'Distributor', distributorId: 'd1', status: 'Issued', payments: [], createdAt: '', lines: [{ product: 'Cardiovex', qty: 5, unitPrice: 8500, vatPercent: 7.5 }] } as never }, 'usr_inv');
  const vd = s.invoices!.find((i) => i.id === 'vd')!;
  assert.equal(vd.channel, 'Distributor');
  assert.equal(invoiceTotals(vd).balance, 0);
  assert.equal(payState(vd, today), 'Via distributor');
  assert.equal(stockAt(s, WAREHOUSE).get('Cardiovex'), before);
  // Customers' usual channel.
  s = run(s, { type: 'account.channel', ids: [acc.id], channel: 'Distributor', distributorId: 'd1' }, 'usr_rep1');
  assert.equal(s.accounts.find((a) => a.id === acc.id)!.distributorId, 'd1');
});

test('payments: reps report, Finance confirms (not their own), oldest invoices paid first', () => {
  let s = seed();
  const acc = hcoOf(s, 'usr_rep1');
  const inv = (id: string, date: string, total: number) =>
    (s = run(s, { type: 'invoice.create', invoice: { id, number: '', accountId: acc.id, ownerId: 'usr_rep1', date, dueDate: date, stockFrom: WAREHOUSE, status: 'Issued', payments: [], createdAt: '', lines: [{ product: 'Cardiovex', qty: 1, unitPrice: total, vatPercent: 0 }] } }, 'usr_inv', new Date(`${date}T12:00:00`)));
  inv('a', '2026-11-01', 1000);
  inv('b', '2026-11-03', 500);
  const owed = owedBy(s, acc.id);
  // Reps no longer record payments directly.
  assert.throws(() => run(s, { type: 'invoice.pay', invoiceId: 'a', payment: { id: 'p', amount: 10, method: 'Cash', date: today, receiptNo: '', byId: '', at: '' } }, 'usr_rep1'), /Report the payment/);
  assert.throws(() => run(s, { type: 'payment.submit', claim: { id: 'c0', accountId: acc.id, amount: owed + 1, method: 'Transfer', date: today, byId: '', at: '', status: 'Pending' } }, 'usr_rep1'), /more than/);
  s = run(s, { type: 'payment.submit', claim: { id: 'c1', accountId: acc.id, amount: 1200, method: 'Transfer', date: today, reference: 'TRF-1', byId: '', at: '', status: 'Pending' } }, 'usr_rep1');
  assert.equal(owedBy(s, acc.id), owed, 'nothing counts until Finance confirms');
  const plan = allocate(s, { accountId: acc.id, amount: 1200 });
  assert.equal(Math.round(plan.parts.reduce((n, p) => n + p.amount, 0)), 1200);
  assert.equal(plan.left, 0);
  assert.throws(() => run(s, { type: 'payment.review', id: 'c1', approve: true }, 'usr_rep1'), /Only Finance/);
  assert.throws(() => run(s, { type: 'payment.review', id: 'c1', approve: false }, 'usr_fin'), /Say why/);
  s = run(s, { type: 'payment.review', id: 'c1', approve: true }, 'usr_fin');
  const c = s.paymentClaims!.find((x) => x.id === 'c1')!;
  assert.equal(c.status, 'Confirmed');
  assert.ok(c.receipts!.length >= 1);
  assert.equal(owedBy(s, acc.id), Math.round((owed - 1200) * 100) / 100);
  const pay = s.invoices!.flatMap((i) => i.payments).find((p) => p.claimId === 'c1')!;
  assert.equal(pay.byId, 'usr_rep1');
  assert.equal(pay.confirmedBy, 'usr_fin');
  // Finance cannot confirm a payment they reported themselves while another Finance person can.
  s = run(s, { type: 'payment.submit', claim: { id: 'c2', accountId: acc.id, amount: 10, method: 'Cash', date: today, byId: '', at: '', status: 'Pending' } }, 'usr_fin');
  assert.throws(() => run(s, { type: 'payment.review', id: 'c2', approve: true }, 'usr_fin'), /Someone else/);
  assert.equal(run(s, { type: 'payment.review', id: 'c2', approve: true }, 'usr_fin2').paymentClaims!.find((x) => x.id === 'c2')!.status, 'Confirmed');
});

test('credit changes: Finance asks, a credit approver decides, bulk and with a record', () => {
  let s = seed();
  const ids = s.accounts.filter((a) => a.type === 'HCO').slice(0, 3).map((a) => a.id);
  assert.throws(() => run(s, { type: 'credit.request', request: { id: 'r0', accountIds: ids, limit: 5e6, reason: 'Good payers', byId: '', at: '', status: 'Pending' } }, 'usr_rep1'), /Only Finance/);
  s = run(s, { type: 'credit.request', request: { id: 'r1', accountIds: ids, limit: 5e6, days: 30, reason: 'Good payers', byId: '', at: '', status: 'Pending' } }, 'usr_fin');
  assert.equal(s.accounts.find((a) => a.id === ids[0])!.creditDays, undefined, 'nothing changes before approval');
  assert.throws(() => run(s, { type: 'credit.review', id: 'r1', approve: true }, 'usr_fin'), /credit approver/);
  s = run(s, { type: 'credit.review', id: 'r1', approve: true, note: 'OK' }, 'usr_cm');
  for (const id of ids) {
    const a = s.accounts.find((x) => x.id === id)!;
    assert.equal(a.creditLimit, 5e6);
    assert.equal(a.creditDays, 30);
  }
  const r = s.creditRequests!.find((x) => x.id === 'r1')!;
  assert.equal(r.status, 'Approved');
  assert.equal(r.decidedBy, 'usr_cm');
  assert.ok(r.before && ids[0] in r.before);
  // Invoices for them now fall due in 30 days.
  s = run(s, { type: 'invoice.create', invoice: { id: 'i30', number: '', accountId: ids[0], ownerId: s.accounts.find((a) => a.id === ids[0])!.ownerId, date: today, dueDate: today, stockFrom: WAREHOUSE, status: 'Issued', payments: [], createdAt: '', lines: [{ product: 'Cardiovex', qty: 1, unitPrice: 1, vatPercent: 0 }] } }, 'usr_inv');
  assert.equal(s.invoices!.find((i) => i.id === 'i30')!.dueDate, '2026-12-05');
});

test('debt age bands and older companies keep the 2.11 rules', () => {
  assert.equal(ageBand(0), 'Not yet due');
  assert.equal(ageBand(31), '31-60');
  assert.equal(ageBand(400), '120+');
  const s = buildSeed(now);
  const rows = debtAge(s.invoices ?? [], (i) => i.ownerId, today);
  for (const r of rows.values()) assert.ok(r.total >= r.overdue);
  // Without the 2.13 rules, reps still record payments themselves.
  const inv = (s.invoices ?? []).find((i) => i.ownerId === 'usr_rep1' && invoiceTotals(i).balance > 1);
  if (inv) {
    const t = run(s, { type: 'invoice.pay', invoiceId: inv.id, payment: { id: 'old-p', amount: 1, method: 'Cash', date: today, receiptNo: '', byId: '', at: '' } }, 'usr_rep1');
    assert.ok(t.invoices!.find((i) => i.id === inv.id)!.payments.some((p) => p.id === 'old-p'));
  }
});
