import { ERP_DEFAULTS, WAREHOUSE, type Account, type ErpSettings, type Invoice, type InvoiceLine, type Product, type Settings, type Snapshot, type StockPlace, type User } from './types';

/**
 * Ava ERP (2.11): money and stock worked out from invoices and stock moves. Amounts are kept in
 * the currency's main unit (naira) and rounded to 2 decimals at each line, the way invoices print.
 */

/** The module's id in the licence. */
export const ERP_MODULE = 'erp';
export const ERP_NAME = 'Ava ERP';

export const erpSettings = (s: Pick<Settings, 'erp'>): ErpSettings => ({ ...ERP_DEFAULTS, ...s.erp });

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineTotals {
  gross: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
}

export function lineTotals(l: InvoiceLine): LineTotals {
  const gross = round2(l.qty * l.unitPrice);
  const discount = round2((gross * (l.discountPercent ?? 0)) / 100);
  const net = round2(gross - discount);
  const vat = round2((net * l.vatPercent) / 100);
  return { gross, discount, net, vat, total: round2(net + vat) };
}

export interface InvoiceTotals extends LineTotals {
  paid: number;
  balance: number;
}

export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'payments' | 'status'>): InvoiceTotals {
  const t = inv.lines.map(lineTotals).reduce((a, b) => ({ gross: a.gross + b.gross, discount: a.discount + b.discount, net: a.net + b.net, vat: a.vat + b.vat, total: a.total + b.total }), { gross: 0, discount: 0, net: 0, vat: 0, total: 0 });
  const paid = round2(inv.payments.reduce((n, p) => n + p.amount, 0));
  const total = round2(t.total);
  return { gross: round2(t.gross), discount: round2(t.discount), net: round2(t.net), vat: round2(t.vat), total, paid, balance: inv.status === 'Void' ? 0 : round2(total - paid) };
}

export type PayState = 'Paid' | 'Part paid' | 'Unpaid' | 'Overdue' | 'Void';

export function payState(inv: Invoice, today = todayIso()): PayState {
  if (inv.status === 'Void') return 'Void';
  const t = invoiceTotals(inv);
  if (t.balance <= 0.004) return 'Paid';
  if (inv.dueDate < today) return 'Overdue';
  return t.paid > 0 ? 'Part paid' : 'Unpaid';
}

export const todayIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

export function formatMoney(n: number, currency = 'NGN'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Short form for tiles: ₦1.2m, ₦45k. */
export function formatMoneyShort(n: number, currency = 'NGN'): string {
  const abs = Math.abs(n);
  if (abs < 10000) return formatMoney(n, currency).replace(/\.00$/, '');
  const sym = formatMoney(0, currency).replace(/[\d.,\s]/g, '');
  const v = abs >= 1e9 ? `${(abs / 1e9).toFixed(1)}bn` : abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}m` : `${Math.round(abs / 1000)}k`;
  return `${n < 0 ? '-' : ''}${sym}${v.replace('.0', '')}`;
}

// ----- invoice numbers -----

/** A short code for the seller in invoice numbers: their user ID if set, else from their user id. */
export function sellerCode(u: Pick<User, 'id' | 'employeeId'> | undefined): string {
  const raw = (u?.employeeId || u?.id.replace(/^[a-z]+_?/i, '') || 'X').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.slice(-6) || 'X';
}

/**
 * Invoice numbers are given when the invoice is applied, counting that seller's invoices, so every
 * device that replays the journals gives the same number: INV-0042-0007.
 */
export function nextInvoiceNumber(s: Snapshot, seller: User): string {
  const prefix = erpSettings(s.settings).prefix;
  const mine = (s.invoices ?? []).filter((i) => i.ownerId === seller.id).length;
  return `${prefix}-${sellerCode(seller)}-${String(mine + 1).padStart(4, '0')}`;
}

// ----- stock -----

export interface StockLevel {
  product: string;
  qty: number;
}

/** Units of each product at a place: moves in and out, minus what was sold from there. */
export function stockAt(s: Pick<Snapshot, 'stockMoves' | 'invoices'>, place: StockPlace): Map<string, number> {
  const out = new Map<string, number>();
  const add = (p: string, n: number) => out.set(p, round2((out.get(p) ?? 0) + n));
  for (const m of s.stockMoves ?? []) {
    if (m.to === place) add(m.product, m.qty);
    if (m.from === place) add(m.product, -m.qty);
  }
  for (const inv of s.invoices ?? []) {
    if (inv.status === 'Void' || inv.stockFrom !== place) continue;
    for (const l of inv.lines) add(l.product, -l.qty);
  }
  return out;
}

/** True once any stock was recorded for the product anywhere: products never stocked are not counted. */
export function trackedProducts(s: Pick<Snapshot, 'stockMoves'>): Set<string> {
  return new Set((s.stockMoves ?? []).map((m) => m.product));
}

export function stockLevels(s: Pick<Snapshot, 'stockMoves' | 'invoices'>, place: StockPlace, products: Product[]): StockLevel[] {
  const at = stockAt(s, place);
  const names = new Set([...products.filter((p) => p.active).map((p) => p.name), ...at.keys()]);
  return [...names].map((product) => ({ product, qty: at.get(product) ?? 0 })).sort((a, b) => a.product.localeCompare(b.product));
}

/** Lines that would take a tracked product below zero at the place. */
export function shortages(s: Pick<Snapshot, 'stockMoves' | 'invoices'>, place: StockPlace, lines: Pick<InvoiceLine, 'product' | 'qty'>[]): { product: string; have: number; want: number }[] {
  const at = stockAt(s, place);
  const tracked = trackedProducts(s);
  const want = new Map<string, number>();
  for (const l of lines) want.set(l.product, (want.get(l.product) ?? 0) + l.qty);
  return [...want].filter(([p, n]) => tracked.has(p) && (at.get(p) ?? 0) < n).map(([product, n]) => ({ product, have: at.get(product) ?? 0, want: n }));
}

export const placeName = (place: StockPlace, getUser: (id?: string) => User | undefined) => (place === WAREHOUSE ? 'Warehouse' : (getUser(place)?.name ?? 'Another team'));

// ----- customers -----

export interface CustomerBalance {
  account: Account;
  owed: number;
  overdue: number;
  invoices: number;
  lastSale?: string;
  /** Oldest unpaid due date. */
  oldestDue?: string;
}

export function customerBalances(s: Pick<Snapshot, 'invoices' | 'accounts'>, today = todayIso()): CustomerBalance[] {
  const by = new Map<string, CustomerBalance>();
  for (const inv of s.invoices ?? []) {
    if (inv.status === 'Void') continue;
    const account = s.accounts.find((a) => a.id === inv.accountId);
    if (!account) continue;
    const row = by.get(account.id) ?? { account, owed: 0, overdue: 0, invoices: 0 };
    const t = invoiceTotals(inv);
    row.invoices++;
    row.owed = round2(row.owed + t.balance);
    if (t.balance > 0 && inv.dueDate < today) row.overdue = round2(row.overdue + t.balance);
    if (t.balance > 0 && (!row.oldestDue || inv.dueDate < row.oldestDue)) row.oldestDue = inv.dueDate;
    if (!row.lastSale || inv.date > row.lastSale) row.lastSale = inv.date;
    by.set(account.id, row);
  }
  return [...by.values()].sort((a, b) => b.owed - a.owed || a.account.name.localeCompare(b.account.name));
}

export function owedBy(s: Pick<Snapshot, 'invoices'>, accountId: string): number {
  return round2((s.invoices ?? []).filter((i) => i.accountId === accountId && i.status !== 'Void').reduce((n, i) => n + invoiceTotals(i).balance, 0));
}

// ----- dashboard -----

export interface SalesSummary {
  sales: number;
  invoices: number;
  collected: number;
  owed: number;
  overdue: number;
  /** Units and value by product, biggest value first. */
  byProduct: { product: string; qty: number; value: number }[];
  /** Value by seller, biggest first. */
  bySeller: { userId: string; value: number; invoices: number; collected: number }[];
  /** Sales value per day, for the trend. */
  byDay: { day: string; value: number }[];
}

/** Sales between two days (inclusive) and money still owed now, for the invoices given. */
export function salesSummary(invoices: Invoice[], from: string, to: string, today = todayIso()): SalesSummary {
  const live = invoices.filter((i) => i.status !== 'Void');
  const inRange = live.filter((i) => i.date >= from && i.date <= to);
  const prod = new Map<string, { qty: number; value: number }>();
  const seller = new Map<string, { value: number; invoices: number; collected: number }>();
  const day = new Map<string, number>();
  let sales = 0;
  for (const inv of inRange) {
    const t = invoiceTotals(inv);
    sales += t.total;
    for (const l of inv.lines) {
      const p = prod.get(l.product) ?? { qty: 0, value: 0 };
      p.qty += l.qty;
      p.value += lineTotals(l).total;
      prod.set(l.product, p);
    }
    const r = seller.get(inv.ownerId) ?? { value: 0, invoices: 0, collected: 0 };
    r.value += t.total;
    r.invoices++;
    seller.set(inv.ownerId, r);
    day.set(inv.date, (day.get(inv.date) ?? 0) + t.total);
  }
  let collected = 0;
  for (const inv of live) {
    for (const p of inv.payments) {
      if (p.date < from || p.date > to) continue;
      collected += p.amount;
      const r = seller.get(inv.ownerId) ?? { value: 0, invoices: 0, collected: 0 };
      r.collected += p.amount;
      seller.set(inv.ownerId, r);
    }
  }
  let owed = 0;
  let overdue = 0;
  for (const inv of live) {
    const b = invoiceTotals(inv).balance;
    owed += b;
    if (b > 0 && inv.dueDate < today) overdue += b;
  }
  return {
    sales: round2(sales),
    invoices: inRange.length,
    collected: round2(collected),
    owed: round2(owed),
    overdue: round2(overdue),
    byProduct: [...prod].map(([product, v]) => ({ product, qty: v.qty, value: round2(v.value) })).sort((a, b) => b.value - a.value),
    bySeller: [...seller].map(([userId, v]) => ({ userId, value: round2(v.value), invoices: v.invoices, collected: round2(v.collected) })).sort((a, b) => b.value - a.value),
    byDay: [...day].map(([d, value]) => ({ day: d, value: round2(value) })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** The price list a seller sees: active products with a price, or every active product when none have one yet. */
export function priceList(products: Product[]): Product[] {
  const active = products.filter((p) => p.active);
  return active.some((p) => p.price !== undefined) ? active.filter((p) => p.price !== undefined) : active;
}
