import { addDays, sellerCode, todayIso } from './erp';
import { ERP_DEFAULTS, WAREHOUSE, type Invoice, type Snapshot, type StockMove } from './types';

/**
 * Made-up Ava ERP data for the demo company and design previews (2.11): prices, warehouse and rep
 * stock, and a few weeks of invoices, some paid, some part paid and some overdue.
 */
export function withErpDemo(s: Snapshot, now = new Date()): Snapshot {
  const PRICES: Record<string, number> = { Cardiovex: 8500, 'Glucara XR': 12400, 'Respira Inhaler': 6750, Neurolin: 15200 };
  const products = s.products.map((p, i) => (PRICES[p.name] ? { ...p, price: PRICES[p.name], sku: `AVA-${String(101 + i)}`, ...(p.name === 'Respira Inhaler' ? { vatExempt: true } : {}) } : p));
  const today = todayIso(now);
  const day = (n: number) => addDays(today, n);
  const at = (n: number) => `${day(n)}T09:00:00.000Z`;
  const sellers = ['usr_rep1', 'usr_rep2', 'usr_rep3'];
  const stockMoves: StockMove[] = [];
  let m = 0;
  for (const p of products.filter((x) => x.price)) {
    stockMoves.push({ id: `stk_${++m}`, kind: 'receive', product: p.name, qty: 600, to: WAREHOUSE, batch: `B${2600 + m}`, note: 'Delivery from supplier', byId: 'usr_admin', at: at(-40) });
    for (const r of sellers) stockMoves.push({ id: `stk_${++m}`, kind: 'transfer', product: p.name, qty: p.name === 'Neurolin' && r === 'usr_rep1' ? 24 : 60, from: WAREHOUSE, to: r, byId: s.users.find((u) => u.id === r)?.managerId ?? 'usr_admin', at: at(-38) });
  }
  const invoices: Invoice[] = [];
  const counts: Record<string, number> = {};
  const mix = [
    [['Cardiovex', 12], ['Glucara XR', 6]],
    [['Respira Inhaler', 20]],
    [['Neurolin', 8], ['Cardiovex', 4]],
    [['Glucara XR', 10], ['Respira Inhaler', 6]],
    [['Cardiovex', 18]],
  ] as const;
  for (let k = 0; k < 18; k++) {
    const owner = sellers[k % sellers.length];
    const user = s.users.find((u) => u.id === owner);
    const orgs = s.accounts.filter((a) => a.ownerId === owner && a.type === 'HCO');
    const account = orgs[Math.floor(k / sellers.length) % Math.max(1, orgs.length)];
    if (!user || !account) continue;
    const ago = 34 - k * 2;
    const date = day(-ago);
    counts[owner] = (counts[owner] ?? 0) + 1;
    const number = `${ERP_DEFAULTS.prefix}-${sellerCode(user)}-${String(counts[owner]).padStart(4, '0')}`;
    const lines = mix[k % mix.length].map(([product, qty]) => ({ product, qty, unitPrice: PRICES[product], vatPercent: product === 'Respira Inhaler' ? 0 : ERP_DEFAULTS.vatPercent, ...(k % 4 === 0 ? { discountPercent: 5 } : {}) }));
    const total = lines.reduce((n, l) => n + Math.round(l.qty * l.unitPrice * (1 - (l.discountPercent ?? 0) / 100) * (1 + l.vatPercent / 100) * 100) / 100, 0);
    // Older invoices are mostly paid; a few are left overdue or part paid.
    const paid = k % 5 === 2 ? 0 : k % 5 === 4 ? Math.round(total * 0.4) : ago > 8 ? total : 0;
    invoices.push({
      id: `inv_demo${k + 1}`, number, accountId: account.id, ownerId: owner, date, dueDate: addDays(date, k % 2 ? 30 : 14), lines, stockFrom: owner, status: 'Issued', createdAt: at(-ago),
      payments: paid ? [{ id: `pay_demo${k + 1}`, amount: Math.round(paid * 100) / 100, method: k % 3 ? 'Transfer' : 'Cash', date: addDays(date, Math.min(ago, 6)), receiptNo: `${number}-R1`, byId: owner, at: at(-ago + Math.min(ago, 6)) }] : [],
    });
  }
  const credit = new Map([[invoices[2]?.accountId, 250000]]);
  return {
    ...s,
    products,
    accounts: s.accounts.map((a) => (credit.has(a.id) ? { ...a, creditLimit: credit.get(a.id)! } : a)),
    settings: { ...s.settings, erp: { ...ERP_DEFAULTS, paymentDetails: 'Bank: Ava Demo Bank\nAccount number: 0123456789\nAccount name: Ava Demo Pharma Ltd' } },
    invoices,
    stockMoves,
  };
}
