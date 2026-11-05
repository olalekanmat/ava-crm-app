import { parseCsv, toCsv } from './csv';
import { invoiceTotals, round2 } from './erp';
import type { Account, Campaign, Product, SecondarySale, Snapshot } from './types';

// 2.15 helpers: accounting export, distributor (secondary) sales, campaign reach.

/** One row per invoice, receipt and credit note between two days (inclusive), for QuickBooks, Sage or Excel. */
export function accountingCsv(s: Pick<Snapshot, 'invoices' | 'accounts'>, from: string, to: string): string {
  const name = (id: string) => s.accounts.find((a) => a.id === id)?.name ?? '';
  const rows: unknown[][] = [];
  const inRange = (d: string) => d >= from && d <= to;
  for (const inv of s.invoices ?? []) {
    const t = invoiceTotals({ ...inv, payments: [], credits: [] });
    if (inRange(inv.date)) rows.push([inv.date, 'Invoice', inv.number, name(inv.accountId), inv.status === 'Void' ? 0 : round2(t.net), inv.status === 'Void' ? 0 : round2(t.vat), inv.status === 'Void' ? 0 : round2(t.total), '', '', inv.status === 'Void' ? `Cancelled: ${inv.voidReason ?? ''}` : '']);
    for (const p of inv.payments) if (inRange(p.date)) rows.push([p.date, 'Receipt', p.receiptNo, name(inv.accountId), '', '', round2(p.amount), p.method, p.reference ?? '', inv.number]);
    for (const c of inv.credits ?? []) {
      const day = c.at.slice(0, 10);
      if (inRange(day)) rows.push([day, 'Credit note', c.number, name(inv.accountId), '', '', -round2(c.amount), '', '', `${inv.number}: ${c.reason}`]);
    }
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])));
  return toCsv(['date', 'type', 'number', 'customer', 'net', 'vat', 'total', 'method', 'reference', 'note'], rows);
}

export const SECONDARY_COLUMNS = ['product', 'qty', 'value', 'stock', 'territory', 'customer'];

/** Reads a distributor's monthly sales file (columns as SECONDARY_COLUMNS; product and qty needed). */
export function parseSecondaryCsv(text: string, products: Pick<Product, 'name'>[], accounts: Pick<Account, 'id' | 'name'>[]): { rows: Omit<SecondarySale, 'id' | 'distributorId' | 'month' | 'uploadId' | 'byId' | 'at'>[]; errors: string[] } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  const errors: string[] = [];
  if (!grid.length) return { rows: [], errors: ['The file is empty.'] };
  const head = grid[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  if (col('product') < 0 || col('qty') < 0) return { rows: [], errors: ['The first row must name the columns, with at least product and qty.'] };
  const num = (v?: string) => (v === undefined || v.trim() === '' ? undefined : Number(v.replace(/,/g, '')));
  const rows: Omit<SecondarySale, 'id' | 'distributorId' | 'month' | 'uploadId' | 'byId' | 'at'>[] = [];
  grid.slice(1).forEach((r, i) => {
    const line = i + 2;
    const pn = (r[col('product')] ?? '').trim();
    const product = products.find((p) => p.name.toLowerCase() === pn.toLowerCase())?.name;
    if (!product) return void errors.push(`Line ${line}: unknown product "${pn}".`);
    const qty = num(r[col('qty')]);
    if (qty === undefined || !Number.isFinite(qty) || qty < 0) return void errors.push(`Line ${line}: qty must be a number.`);
    const value = col('value') >= 0 ? num(r[col('value')]) : undefined;
    const stock = col('stock') >= 0 ? num(r[col('stock')]) : undefined;
    if ((value !== undefined && !(value >= 0)) || (stock !== undefined && !(stock >= 0))) return void errors.push(`Line ${line}: value and stock must be numbers.`);
    const cn = col('customer') >= 0 ? (r[col('customer')] ?? '').trim() : '';
    const accountId = cn ? accounts.find((a) => a.name.toLowerCase() === cn.toLowerCase())?.id : undefined;
    const territory = col('territory') >= 0 ? (r[col('territory')] ?? '').trim() || undefined : undefined;
    rows.push({ product, qty: Math.floor(qty), ...(value !== undefined ? { value } : {}), ...(stock !== undefined ? { stock: Math.floor(stock) } : {}), ...(territory ? { territory } : {}), ...(accountId ? { accountId } : {}) });
  });
  return { rows, errors };
}

export interface SellRow {
  product: string;
  /** Units the company invoiced to customers buying through this distributor (or to the distributor) in the month. */
  sellIn: number;
  /** Units the distributor reports selling on. */
  sellOut: number;
  /** Units the distributor reports holding at month end. */
  stock?: number;
}

/** Sell-in against sell-out for a distributor and month (YYYY-MM). */
export function sellInOut(s: Pick<Snapshot, 'invoices' | 'secondarySales'>, distributorId: string, month: string): SellRow[] {
  const by = new Map<string, SellRow>();
  const row = (p: string) => by.get(p) ?? by.set(p, { product: p, sellIn: 0, sellOut: 0 }).get(p)!;
  for (const inv of s.invoices ?? []) {
    if (inv.status === 'Void' || inv.distributorId !== distributorId || !inv.date.startsWith(month)) continue;
    for (const l of inv.lines) row(l.product).sellIn += l.qty;
  }
  for (const x of s.secondarySales ?? []) {
    if (x.distributorId !== distributorId || x.month !== month) continue;
    const r = row(x.product);
    r.sellOut += x.qty;
    if (x.stock !== undefined) r.stock = (r.stock ?? 0) + x.stock;
  }
  return [...by.values()].sort((a, b) => a.product.localeCompare(b.product));
}

/** How far a campaign got: target accounts reached at least once in its dates, and calls against the frequency goal. */
export function campaignReach(s: Pick<Snapshot, 'calls'>, c: Pick<Campaign, 'targetIds' | 'start' | 'end' | 'frequency' | 'product'>): { targets: number; reached: number; calls: number; goal: number } {
  const targets = new Set(c.targetIds);
  const seen = new Set<string>();
  let calls = 0;
  for (const call of s.calls) {
    if (call.status !== 'Submitted' || !targets.has(call.accountId)) continue;
    const day = call.datetime.slice(0, 10);
    if (day < c.start || day > c.end) continue;
    if (c.product && !call.products.some((p) => p.product === c.product)) continue;
    calls++;
    seen.add(call.accountId);
  }
  return { targets: targets.size, reached: seen.size, calls, goal: targets.size * (c.frequency ?? 1) };
}
