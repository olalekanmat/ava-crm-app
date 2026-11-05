import { isAdmin, manages } from './access';
import { erpSettings, lineTotals, nextOrderNumber, round2 } from './erp';
import { approverOf, checkSignature, DAY_RE, fail, MAX_UNITS, replaceOrAdd } from './mutations';
import { can, holdersOf } from './roles';
import {
  CONTENT_KINDS, EXPENSE_CATEGORIES, RETURN_CONDITIONS, SAFETY_KINDS, WAREHOUSE,
  type Campaign, type ContentDoc, type CreditNote, type Delivery, type Expense, type Order, type PayPromise, type ReturnRequest, type SafetyReport, type SafetyStatus, type SecondarySale, type Snapshot, type StockMove, type Target, type User,
} from './types';

/**
 * 2.14 and 2.15 changes: operations (split orders, returns and credit notes, proof of delivery,
 * promises to pay, price groups) and growth and compliance (targets, distributor sales, campaigns,
 * content approval, safety reports, expenses, key accounts). Same contract as applyMutation.
 */
export type OpsMutation =
  // ----- 2.14 -----
  | { type: 'order.split'; id: string; newId: string; lines: { product: string; qty: number }[]; deliveryDate?: string; distributorId?: string }
  | { type: 'return.request'; request: ReturnRequest }
  | { type: 'return.review'; id: string; approve: boolean; note?: string }
  | { type: 'return.cancel'; id: string }
  | { type: 'invoice.deliver'; invoiceId: string; delivery: Delivery }
  | { type: 'promise.add'; promise: PayPromise }
  | { type: 'promise.cancel'; id: string }
  | { type: 'account.priceGroup'; ids: string[]; group?: string }
  // ----- 2.15 -----
  | { type: 'account.kam'; ids: string[]; kamId?: string }
  | { type: 'target.set'; target: Target }
  | { type: 'target.delete'; id: string }
  | { type: 'secondary.upload'; uploadId: string; distributorId: string; month: string; rows: Omit<SecondarySale, 'id' | 'distributorId' | 'month' | 'uploadId' | 'byId' | 'at'>[] }
  | { type: 'secondary.delete'; uploadId: string }
  | { type: 'campaign.save'; campaign: Campaign }
  | { type: 'campaign.delete'; id: string }
  | { type: 'content.save'; doc: ContentDoc }
  | { type: 'content.review'; id: string; approve: boolean; note?: string }
  | { type: 'content.retire'; id: string }
  | { type: 'safety.report'; report: SafetyReport }
  | { type: 'safety.handle'; id: string; status: SafetyStatus; response?: string }
  | { type: 'expense.submit'; expense: Expense }
  | { type: 'expense.review'; id: string; approve: boolean; note?: string }
  | { type: 'expense.pay'; ids: string[] }
  | { type: 'expense.cancel'; id: string };

export const OPS_TYPES: OpsMutation['type'][] = [
  'order.split', 'return.request', 'return.review', 'return.cancel', 'invoice.deliver', 'promise.add', 'promise.cancel', 'account.priceGroup',
  'account.kam', 'target.set', 'target.delete', 'secondary.upload', 'secondary.delete', 'campaign.save', 'campaign.delete',
  'content.save', 'content.review', 'content.retire', 'safety.report', 'safety.handle', 'expense.submit', 'expense.review', 'expense.pay', 'expense.cancel',
];
/** The ones that need the ERP module. */
export const ERP_OPS_TYPES: OpsMutation['type'][] = ['order.split', 'return.request', 'return.review', 'return.cancel', 'invoice.deliver', 'promise.add', 'promise.cancel', 'account.priceGroup', 'secondary.upload', 'secondary.delete'];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_DOC_PHOTO = 300_000;
const URL_RE = /^https:\/\/[^\s]{3,1000}$/;

/** Units of each product already returned (or waiting) against an invoice. */
function returnedQty(s: Snapshot, invoiceId: string, exceptId?: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of s.returns ?? []) {
    if (r.invoiceId !== invoiceId || r.id === exceptId || (r.status !== 'Pending' && r.status !== 'Approved')) continue;
    for (const l of r.lines) out.set(l.product, (out.get(l.product) ?? 0) + l.qty);
  }
  return out;
}

/** Value incl. VAT of returned units, at the invoice's own prices and discounts. */
export function returnValue(inv: { lines: { product: string; qty: number; unitPrice: number; discountPercent?: number; vatPercent: number }[] }, lines: { product: string; qty: number }[]): number {
  let total = 0;
  for (const l of lines) {
    let left = l.qty;
    for (const il of inv.lines.filter((x) => x.product === l.product)) {
      if (left <= 0) break;
      const n = Math.min(left, il.qty);
      total += (lineTotals(il).total / il.qty) * n;
      left -= n;
    }
  }
  return round2(total);
}

const live = (u: User | undefined) => !!u && u.active && !u.deletedAt;

export function applyOps(s: Snapshot, m: OpsMutation, actor: User, now = new Date()): Snapshot {
  const nowIso = now.toISOString();
  const admin = isAdmin(actor);
  const sees = (accountId: string) => {
    const a = s.accounts.find((x) => x.id === accountId && !x.deletedAt);
    return !!a && (admin || a.ownerId === actor.id || a.kamId === actor.id || manages(s.users, actor, a.ownerId));
  };

  switch (m.type) {
    // ----- 2.14: orders, returns, delivery, collections -----
    case 'order.split': {
      const o = (s.orders ?? []).find((y) => y.id === m.id) ?? fail('Order not found.');
      if ((s.orders ?? []).some((y) => y.id === m.newId)) return s;
      if (!(can(actor, 'invoicing') || o.ownerId === actor.id || manages(s.users, actor, o.ownerId))) fail('Only the invoicing officer, the rep or their manager can split this order.');
      if (o.status !== 'Submitted' && o.status !== 'On hold') fail(`This order is ${o.status.toLowerCase()}.`);
      if (!m.lines.length) fail('Choose what moves to the new order.');
      const left = o.lines.map((l) => ({ ...l }));
      const moved: Order['lines'] = [];
      for (const x of m.lines) {
        if (!Number.isInteger(x.qty) || x.qty < 1) fail('Quantities are whole numbers from 1.');
        const l = left.find((y) => y.product === x.product) ?? fail(`${x.product} is not on this order.`);
        if (x.qty > l.qty) fail(`The order has only ${l.qty} of ${x.product}.`);
        l.qty -= x.qty;
        moved.push({ ...l, qty: x.qty });
      }
      const keep = left.filter((l) => l.qty > 0);
      if (!keep.length) fail('Leave something on the first order.');
      if (m.deliveryDate !== undefined && !DAY_RE.test(m.deliveryDate)) fail('Use YYYY-MM-DD for the delivery date.');
      if (m.distributorId !== undefined && (o.channel !== 'Distributor' || !(s.distributors ?? []).some((d) => d.id === m.distributorId && d.active))) fail('Choose an active distributor for a distributor order.');
      const seller = s.users.find((u) => u.id === o.ownerId) ?? fail('Rep not found.');
      const second: Order = { ...o, id: m.newId, number: nextOrderNumber(s, seller), lines: moved, deliveryDate: m.deliveryDate ?? o.deliveryDate, ...(m.distributorId ? { distributorId: m.distributorId } : {}), notes: [o.notes, `Split from ${o.number}`].filter(Boolean).join(' · '), createdAt: nowIso };
      return { ...s, orders: [...replaceOrAdd(s.orders ?? [], { ...o, lines: keep }), second] };
    }

    case 'return.request': {
      const r = m.request;
      if ((s.returns ?? []).some((x) => x.id === r.id)) return s;
      const inv = (s.invoices ?? []).find((i) => i.id === r.invoiceId) ?? fail('Invoice not found.');
      if (inv.status === 'Void') fail('This invoice was cancelled.');
      if (inv.channel === 'Distributor') fail('Goods bought through a distributor go back to the distributor.');
      if (!(sees(inv.accountId) || can(actor, 'finance') || can(actor, 'warehouse') || can(actor, 'invoicing'))) fail('You cannot return goods for this customer.');
      if (!RETURN_CONDITIONS.includes(r.condition)) fail('Say what condition the goods are in.');
      if (!r.reason.trim() || r.reason.length > 500) fail('Say why the goods come back.');
      if (!r.lines.length || r.lines.length > 50) fail('Choose what comes back.');
      const before = returnedQty(s, inv.id);
      const want = new Map<string, number>();
      for (const l of r.lines) {
        if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_UNITS) fail('Quantities are whole numbers from 1.');
        want.set(l.product, (want.get(l.product) ?? 0) + l.qty);
      }
      for (const [p, n] of want) {
        const sold = inv.lines.filter((l) => l.product === p).reduce((t, l) => t + l.qty, 0);
        if (!sold) fail(`${p} is not on this invoice.`);
        if (n + (before.get(p) ?? 0) > sold) fail(`Only ${sold - (before.get(p) ?? 0)} of ${p} can still come back on this invoice.`);
      }
      const req: ReturnRequest = { id: r.id, invoiceId: inv.id, accountId: inv.accountId, lines: [...want].map(([product, qty]) => ({ product, qty })), condition: r.condition, reason: r.reason.trim(), byId: actor.id, at: nowIso, status: 'Pending' };
      return { ...s, returns: [...(s.returns ?? []), req] };
    }

    case 'return.review': {
      const r = (s.returns ?? []).find((x) => x.id === m.id) ?? fail('Return not found.');
      if (r.status !== 'Pending') return s;
      if (!can(actor, 'finance')) fail('Only Finance approves returns.');
      if (r.byId === actor.id && holdersOf(s.users, 'finance').some((u) => u.id !== actor.id)) fail('Someone else must approve a return you asked for.');
      if (!m.approve) {
        if (!m.note?.trim()) fail('Say why the return is turned down.');
        return { ...s, returns: replaceOrAdd(s.returns ?? [], { ...r, status: 'Rejected', decidedBy: actor.id, decidedAt: nowIso, note: m.note!.trim() }) };
      }
      const inv = (s.invoices ?? []).find((i) => i.id === r.invoiceId) ?? fail('Invoice not found.');
      const amount = returnValue(inv, r.lines);
      const number = `${inv.number}-C${(inv.credits?.length ?? 0) + 1}`;
      const note: CreditNote = { id: `cn-${r.id}`.slice(0, 80), number, amount, reason: `Return: ${r.reason}`, returnId: r.id, byId: actor.id, at: nowIso };
      // Resaleable goods go back on the shelf; expired and damaged ones are written off.
      const restock: StockMove[] = r.condition === 'Resaleable' && inv.stockFrom ? r.lines.map((l, i) => ({ id: `rt-${r.id}-${i}`.slice(0, 80), kind: 'receive', product: l.product, qty: l.qty, to: WAREHOUSE, note: `Returned on ${number}`, byId: actor.id, at: nowIso })) : [];
      return {
        ...s,
        invoices: (s.invoices ?? []).map((i) => (i.id === inv.id ? { ...i, credits: [...(i.credits ?? []), note] } : i)),
        stockMoves: [...(s.stockMoves ?? []), ...restock],
        returns: replaceOrAdd(s.returns ?? [], { ...r, status: 'Approved', decidedBy: actor.id, decidedAt: nowIso, note: m.note?.trim() || undefined, amount, creditNo: number }),
      };
    }

    case 'return.cancel': {
      const r = (s.returns ?? []).find((x) => x.id === m.id) ?? fail('Return not found.');
      if (r.status !== 'Pending') return s;
      if (r.byId !== actor.id && !admin) fail('Only the person who asked can withdraw it.');
      return { ...s, returns: replaceOrAdd(s.returns ?? [], { ...r, status: 'Cancelled', decidedBy: actor.id, decidedAt: nowIso }) };
    }

    case 'invoice.deliver': {
      const inv = (s.invoices ?? []).find((i) => i.id === m.invoiceId) ?? fail('Invoice not found.');
      if (inv.delivery) return s;
      if (inv.status === 'Void') fail('This invoice was cancelled.');
      if (!(inv.ownerId === actor.id || manages(s.users, actor, inv.ownerId) || can(actor, 'warehouse') || can(actor, 'invoicing'))) fail('Only the rep, their manager or the warehouse records delivery.');
      const d = m.delivery;
      if (!d.receivedBy.trim() || d.receivedBy.length > 120) fail('Enter who received the goods.');
      if (!d.signature && !d.photo) fail('Add the customer’s signature or a photo of the signed delivery note.');
      if (d.signature) checkSignature(d.signature);
      if (d.photo && (!PHOTO_RE.test(d.photo) || d.photo.length > MAX_DOC_PHOTO)) fail('The photo is not valid or too large.');
      if ((d.lat !== undefined || d.lng !== undefined) && !(Math.abs(d.lat ?? 999) <= 90 && Math.abs(d.lng ?? 999) <= 180)) fail('Invalid location.');
      const delivery: Delivery = { at: nowIso, byId: actor.id, receivedBy: d.receivedBy.trim(), ...(d.signature ? { signature: d.signature } : {}), ...(d.photo ? { photo: d.photo } : {}), ...(d.lat !== undefined && d.lng !== undefined ? { lat: d.lat, lng: d.lng } : {}), note: d.note?.trim() || undefined };
      return { ...s, invoices: (s.invoices ?? []).map((i) => (i.id === inv.id ? { ...i, delivery } : i)) };
    }

    case 'promise.add': {
      const p = m.promise;
      if ((s.promises ?? []).some((x) => x.id === p.id)) return s;
      if (!(sees(p.accountId) || can(actor, 'finance'))) fail('You cannot log promises for this customer.');
      if (!(p.amount > 0 && p.amount <= 1e12)) fail('Enter the amount promised.');
      if (!DAY_RE.test(p.date) || p.date < nowIso.slice(0, 10)) fail('Choose today or a later date.');
      return { ...s, promises: [...(s.promises ?? []), { id: p.id, accountId: p.accountId, amount: round2(p.amount), date: p.date, note: p.note?.trim() || undefined, byId: actor.id, at: nowIso }] };
    }

    case 'promise.cancel': {
      const p = (s.promises ?? []).find((x) => x.id === m.id) ?? fail('Promise not found.');
      if (p.cancelled) return s;
      if (p.byId !== actor.id && !manages(s.users, actor, p.byId) && !can(actor, 'finance')) fail('You cannot cancel this promise.');
      return { ...s, promises: replaceOrAdd(s.promises ?? [], { ...p, cancelled: true }) };
    }

    case 'account.priceGroup': {
      if (!can(actor, 'finance')) fail('Only Finance or an administrator sets price lists.');
      const lists = erpSettings(s.settings).priceLists ?? {};
      if (m.group !== undefined && !lists[m.group]) fail('Choose one of the company’s price lists.');
      const ids = new Set(m.ids);
      return { ...s, accounts: s.accounts.map((a) => (ids.has(a.id) ? (m.group ? { ...a, priceGroup: m.group } : (({ priceGroup: _p, ...rest }) => rest)(a)) : a)) };
    }

    // ----- 2.15 -----
    case 'account.kam': {
      if (!admin) fail('Only an administrator assigns key account managers.');
      if (m.kamId !== undefined && !s.users.some((u) => u.id === m.kamId && live(u) && u.functions?.includes('kam'))) fail('Choose a person who is a key account manager.');
      const ids = new Set(m.ids);
      return { ...s, accounts: s.accounts.map((a) => (ids.has(a.id) ? (m.kamId ? { ...a, kamId: m.kamId } : (({ kamId: _k, ...rest }) => rest)(a)) : a)) };
    }

    case 'target.set': {
      const t = m.target;
      const who = s.users.find((u) => u.id === t.userId && !u.deletedAt) ?? fail('Person not found.');
      if (!(admin || can(actor, 'finance') || manages(s.users, actor, who.id))) fail('Only their manager, Finance or an administrator sets targets.');
      if (!MONTH_RE.test(t.month)) fail('Use YYYY-MM for the month.');
      for (const [k, v] of [['sales', t.sales], ['collection', t.collection], ['calls', t.calls]] as const) if (v !== undefined && !(v >= 0 && v <= 1e12)) fail(`Enter a ${k} target of zero or more.`);
      if (t.sales === undefined && t.collection === undefined && t.calls === undefined) fail('Enter at least one target.');
      const list = (s.targets ?? []).filter((x) => !(x.userId === who.id && x.month === t.month));
      const out: Target = { id: t.id, userId: who.id, month: t.month, ...(t.sales !== undefined ? { sales: round2(t.sales) } : {}), ...(t.collection !== undefined ? { collection: round2(t.collection) } : {}), ...(t.calls !== undefined ? { calls: Math.round(t.calls) } : {}), setBy: actor.id, at: nowIso };
      return { ...s, targets: [...list, out] };
    }

    case 'target.delete': {
      const t = (s.targets ?? []).find((x) => x.id === m.id);
      if (!t) return s;
      if (!(admin || can(actor, 'finance') || manages(s.users, actor, t.userId))) fail('You cannot remove this target.');
      return { ...s, targets: (s.targets ?? []).filter((x) => x.id !== m.id) };
    }

    case 'secondary.upload': {
      if ((s.secondarySales ?? []).some((x) => x.uploadId === m.uploadId)) return s;
      const own = actor.functions?.includes('distributor') && actor.distributorId === m.distributorId;
      if (!(own || can(actor, 'finance') || can(actor, 'marketing'))) fail('Only Finance, Marketing or the distributor itself uploads distributor sales.');
      if (!(s.distributors ?? []).some((d) => d.id === m.distributorId)) fail('Distributor not found.');
      if (!MONTH_RE.test(m.month)) fail('Use YYYY-MM for the month.');
      if (!m.rows.length || m.rows.length > 5000) fail('Upload 1 to 5,000 rows.');
      const rows: SecondarySale[] = m.rows.map((r, i) => {
        if (!s.products.some((p) => p.name === r.product)) fail(`${r.product} is not a product.`);
        if (!(Number.isInteger(r.qty) && r.qty >= 0 && r.qty <= MAX_UNITS)) fail(`Units of ${r.product} must be a whole number.`);
        if (r.value !== undefined && !(r.value >= 0 && r.value <= 1e12)) fail(`Value of ${r.product} must be zero or more.`);
        if (r.stock !== undefined && !(Number.isInteger(r.stock) && r.stock >= 0 && r.stock <= MAX_UNITS)) fail(`Stock of ${r.product} must be a whole number.`);
        const accountId = r.accountId && s.accounts.some((a) => a.id === r.accountId) ? r.accountId : undefined;
        return { id: `${m.uploadId}-${i}`.slice(0, 80), distributorId: m.distributorId, month: m.month, product: r.product, qty: r.qty, ...(r.value !== undefined ? { value: round2(r.value) } : {}), ...(r.stock !== undefined ? { stock: r.stock } : {}), territory: r.territory?.trim() || undefined, ...(accountId ? { accountId } : {}), uploadId: m.uploadId, byId: actor.id, at: nowIso };
      });
      // A new report for the same distributor and month replaces the old one.
      const kept = (s.secondarySales ?? []).filter((x) => !(x.distributorId === m.distributorId && x.month === m.month));
      return { ...s, secondarySales: [...kept, ...rows] };
    }

    case 'secondary.delete': {
      const rows = (s.secondarySales ?? []).filter((x) => x.uploadId === m.uploadId);
      if (!rows.length) return s;
      const own = actor.functions?.includes('distributor') && actor.distributorId === rows[0].distributorId;
      if (!(own || can(actor, 'finance') || can(actor, 'marketing'))) fail('You cannot remove this report.');
      return { ...s, secondarySales: (s.secondarySales ?? []).filter((x) => x.uploadId !== m.uploadId) };
    }

    case 'campaign.save': {
      if (!can(actor, 'marketing')) fail('Only Marketing runs campaigns.');
      const c = m.campaign;
      const existing = (s.campaigns ?? []).find((x) => x.id === c.id);
      if (!c.name.trim() || c.name.length > 120) fail('Name the campaign.');
      if (c.product && !s.products.some((p) => p.name === c.product)) fail(`${c.product} is not a product.`);
      if (!DAY_RE.test(c.start) || !DAY_RE.test(c.end) || c.end < c.start) fail('Choose a start and an end date.');
      if (c.keyMessages.length > 10 || c.objectives.length > 10) fail('Keep up to 10 key messages and 10 objectives.');
      if (c.targetIds.length > 5000) fail('Keep the target list to 5,000 customers.');
      if (c.frequency !== undefined && !(Number.isInteger(c.frequency) && c.frequency >= 1 && c.frequency <= 50)) fail('Calls per target must be 1 to 50.');
      for (const x of c.samples ?? []) if (!s.products.some((p) => p.name === x.product) || !(Number.isInteger(x.qty) && x.qty >= 1)) fail('Check the sample allocation.');
      if ((s.campaigns ?? []).length >= 200 && !existing) fail('Keep up to 200 campaigns.');
      const targetIds = [...new Set(c.targetIds)].filter((id) => s.accounts.some((a) => a.id === id && !a.deletedAt));
      const out: Campaign = { ...c, name: c.name.trim(), keyMessages: c.keyMessages.map((k) => k.trim()).filter(Boolean), objectives: c.objectives.map((k) => k.trim()).filter(Boolean), targetIds, segment: c.segment?.trim() || undefined, tiers: c.tiers?.length ? c.tiers : undefined, ownerId: existing?.ownerId ?? actor.id, createdAt: existing?.createdAt ?? nowIso, updatedAt: nowIso };
      return { ...s, campaigns: replaceOrAdd(s.campaigns ?? [], out) };
    }

    case 'campaign.delete': {
      if (!can(actor, 'marketing')) fail('Only Marketing runs campaigns.');
      return { ...s, campaigns: (s.campaigns ?? []).filter((c) => c.id !== m.id) };
    }

    case 'content.save': {
      if (!can(actor, 'marketing')) fail('Only Marketing manages content.');
      const d = m.doc;
      const existing = (s.content ?? []).find((x) => x.id === d.id);
      if (!d.title.trim() || d.title.length > 160) fail('Give the material a title.');
      if (!CONTENT_KINDS.includes(d.kind)) fail('Choose what kind of material it is.');
      if (d.product && !s.products.some((p) => p.name === d.product)) fail(`${d.product} is not a product.`);
      if (d.url && !URL_RE.test(d.url)) fail('Links start with https://');
      if (d.deckHash && !/^[0-9a-f]{64}$/.test(d.deckHash)) fail('Invalid presentation.');
      if (!d.url && !d.deckHash) fail('Add a link, or choose the product’s presentation.');
      if (d.endDate && !DAY_RE.test(d.endDate)) fail('Use YYYY-MM-DD for the end date.');
      if ((s.content ?? []).length >= 1000 && !existing) fail('Keep up to 1,000 items.');
      // With approval switched on, a new or changed item waits for Medical; otherwise it is live straight away.
      const approval = !!s.settings.contentApproval;
      const same = !!existing && existing.url === (d.url || undefined) && existing.deckHash === (d.deckHash || undefined) && existing.title === d.title.trim() && existing.endDate === (d.endDate || undefined) && existing.code === (d.code?.trim() || undefined);
      const status: ContentDoc['status'] = !approval ? 'Approved' : existing?.status === 'Approved' && same ? 'Approved' : d.status === 'Draft' ? 'Draft' : 'Pending';
      const out: ContentDoc = {
        id: d.id, title: d.title.trim(), product: d.product || undefined, kind: d.kind, url: d.url || undefined, deckHash: d.deckHash || undefined,
        version: existing ? existing.version + (existing.status === 'Approved' && !same ? 1 : 0) : 1,
        status, endDate: d.endDate || undefined, code: d.code?.trim() || undefined, byId: existing && same ? existing.byId : actor.id, at: nowIso,
        ...(status === 'Approved' ? { reviewedBy: approval ? existing?.reviewedBy : actor.id, reviewedAt: approval ? existing?.reviewedAt : nowIso } : {}),
      };
      return { ...s, content: replaceOrAdd(s.content ?? [], out) };
    }

    case 'content.review': {
      const d = (s.content ?? []).find((x) => x.id === m.id) ?? fail('Material not found.');
      if (d.status !== 'Pending') return s;
      if (!can(actor, 'medical')) fail('Only Medical/Compliance approves content.');
      if (d.byId === actor.id && holdersOf(s.users, 'medical').some((u) => u.id !== actor.id)) fail('Someone else must approve material you sent.');
      if (!m.approve && !m.note?.trim()) fail('Say what needs to change.');
      return { ...s, content: replaceOrAdd(s.content ?? [], { ...d, status: m.approve ? 'Approved' : 'Rejected', reviewedBy: actor.id, reviewedAt: nowIso, reviewNote: m.note?.trim() || undefined }) };
    }

    case 'content.retire': {
      const d = (s.content ?? []).find((x) => x.id === m.id) ?? fail('Material not found.');
      if (d.status === 'Retired') return s;
      if (!can(actor, 'marketing') && !can(actor, 'medical')) fail('Only Marketing or Medical retires content.');
      return { ...s, content: replaceOrAdd(s.content ?? [], { ...d, status: 'Retired', reviewedBy: actor.id, reviewedAt: nowIso }) };
    }

    case 'safety.report': {
      const r = m.report;
      if ((s.safetyReports ?? []).some((x) => x.id === r.id)) return s;
      if (!SAFETY_KINDS.includes(r.kind)) fail('Choose what you are reporting.');
      if (!s.products.some((p) => p.name === r.product)) fail('Choose the product.');
      if (!r.description.trim() || r.description.length > 4000) fail('Describe what happened.');
      if (r.accountId && !s.accounts.some((a) => a.id === r.accountId)) fail('Customer not found.');
      const out: SafetyReport = {
        id: r.id, kind: r.kind, product: r.product, accountId: r.accountId || undefined, callId: r.callId && s.calls.some((c) => c.id === r.callId) ? r.callId : undefined,
        description: r.description.trim(), patientAge: r.patientAge?.trim() || undefined, patientSex: r.patientSex, onset: r.onset && DAY_RE.test(r.onset) ? r.onset : undefined,
        serious: r.kind === 'Adverse event' ? !!r.serious : undefined, batch: r.batch?.trim() || undefined, byId: actor.id, at: nowIso, status: 'New',
      };
      return { ...s, safetyReports: [...(s.safetyReports ?? []), out] };
    }

    case 'safety.handle': {
      const r = (s.safetyReports ?? []).find((x) => x.id === m.id) ?? fail('Report not found.');
      if (!can(actor, 'medical')) fail('Only Medical/Compliance handles these reports.');
      if (r.status === 'Closed') return s;
      if (m.status !== 'Acknowledged' && m.status !== 'Closed') fail('Acknowledge or close the report.');
      if (m.status === 'Closed' && !m.response?.trim() && !r.response) fail('Say how it was handled before closing it.');
      return { ...s, safetyReports: replaceOrAdd(s.safetyReports ?? [], { ...r, status: m.status, handledBy: actor.id, handledAt: nowIso, response: m.response?.trim() || r.response }) };
    }

    case 'expense.submit': {
      const e = m.expense;
      if ((s.expenses ?? []).some((x) => x.id === e.id)) return s;
      if (e.userId !== actor.id) fail('Claim your own expenses.');
      if (!EXPENSE_CATEGORIES.includes(e.category)) fail('Choose a category.');
      if (!(e.amount > 0 && e.amount <= 1e9)) fail('Enter the amount spent.');
      if (!DAY_RE.test(e.date) || e.date > nowIso.slice(0, 10)) fail('Choose the day you spent it (not in the future).');
      if (e.photo && (!PHOTO_RE.test(e.photo) || e.photo.length > MAX_DOC_PHOTO)) fail('The receipt photo is not valid or too large.');
      if ((e.note?.length ?? 0) > 500) fail('Keep the note to 500 characters.');
      return { ...s, expenses: [...(s.expenses ?? []), { id: e.id, userId: actor.id, date: e.date, category: e.category, amount: round2(e.amount), note: e.note?.trim() || undefined, ...(e.photo ? { photo: e.photo } : {}), status: 'Pending', at: nowIso }] };
    }

    case 'expense.review': {
      const e = (s.expenses ?? []).find((x) => x.id === m.id) ?? fail('Expense not found.');
      if (e.status !== 'Pending') return s;
      const approver = approverOf(s.users, e.userId);
      if (e.userId === actor.id) fail('Someone else must approve your own expense.');
      if (!(admin || approver?.id === actor.id || manages(s.users, actor, e.userId))) fail('Only the person’s manager approves their expenses.');
      if (!m.approve && !m.note?.trim()) fail('Say why the expense is turned down.');
      return { ...s, expenses: replaceOrAdd(s.expenses ?? [], { ...e, status: m.approve ? 'Approved' : 'Rejected', decidedBy: actor.id, decidedAt: nowIso, decisionNote: m.note?.trim() || undefined }) };
    }

    case 'expense.pay': {
      if (!can(actor, 'finance')) fail('Only Finance marks expenses paid.');
      const ids = new Set(m.ids);
      if (!ids.size || ids.size > 1000) fail('Choose expenses to mark paid.');
      for (const e of s.expenses ?? []) if (ids.has(e.id) && e.status !== 'Approved' && e.status !== 'Paid') fail('Only approved expenses can be paid.');
      return { ...s, expenses: (s.expenses ?? []).map((e) => (ids.has(e.id) && e.status === 'Approved' ? { ...e, status: 'Paid' as const, paidBy: actor.id, paidAt: nowIso } : e)) };
    }

    case 'expense.cancel': {
      const e = (s.expenses ?? []).find((x) => x.id === m.id) ?? fail('Expense not found.');
      if (e.status !== 'Pending') return s;
      if (e.userId !== actor.id) fail('Only the person who claimed it can withdraw it.');
      return { ...s, expenses: replaceOrAdd(s.expenses ?? [], { ...e, status: 'Cancelled', decidedBy: actor.id, decidedAt: nowIso }) };
    }

    default:
      return fail('Unknown change.');
  }
}

export function describeOps(m: OpsMutation): string | undefined {
  switch (m.type) {
    case 'order.split':
      return 'Split an order';
    case 'return.request':
      return `Asked to return ${m.request.lines.reduce((n, l) => n + l.qty, 0)} units`;
    case 'return.review':
      return m.approve ? 'Approved a return (credit note)' : 'Turned down a return';
    case 'invoice.deliver':
      return `Recorded delivery, received by ${m.delivery.receivedBy}`;
    case 'promise.add':
      return `Logged a promise to pay ${m.promise.amount} by ${m.promise.date}`;
    case 'account.priceGroup':
      return m.group ? `Put ${m.ids.length} customer(s) on the ${m.group} price list` : 'Took customers off a price list';
    case 'account.kam':
      return m.kamId ? `Assigned ${m.ids.length} key account(s)` : 'Removed a key account manager';
    case 'target.set':
      return `Set targets for ${m.target.month}`;
    case 'secondary.upload':
      return `Uploaded ${m.rows.length} distributor sales rows for ${m.month}`;
    case 'campaign.save':
      return `Saved campaign ${m.campaign.name}`;
    case 'content.save':
      return `Saved content ${m.doc.title}`;
    case 'content.review':
      return m.approve ? 'Approved content' : 'Sent content back';
    case 'safety.report':
      return `Reported: ${m.report.kind}`;
    case 'safety.handle':
      return `${m.status} a safety report`;
    case 'expense.submit':
      return `Claimed an expense of ${m.expense.amount}`;
    case 'expense.review':
      return m.approve ? 'Approved an expense' : 'Turned down an expense';
    case 'expense.pay':
      return `Paid ${m.ids.length} expense(s)`;
    default:
      return undefined;
  }
}

/** Presentation hashes reps may show: with content approval on, only approved, unexpired detail aids. */
export function deckAllowed(s: Pick<Snapshot, 'content' | 'settings'>, hash: string | undefined, today: string): boolean {
  if (!s.settings.contentApproval || !hash) return true;
  return (s.content ?? []).some((d) => d.deckHash === hash && d.status === 'Approved' && (!d.endDate || d.endDate >= today));
}

/** Material reps can use today. */
export function liveContent(s: Pick<Snapshot, 'content'>, today: string) {
  return (s.content ?? []).filter((d) => d.status === 'Approved' && (!d.endDate || d.endDate >= today));
}

