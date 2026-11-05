import { RuleError } from './mutations';
import type { OpsMutation } from './ops';
import { CONTENT_KINDS, EXPENSE_CATEGORIES, RETURN_CONDITIONS, SAFETY_KINDS, type Campaign, type ContentDoc, type Delivery, type Expense, type PayPromise, type ReturnRequest, type SafetyReport, type Signature, type Target } from './types';

/** Rebuilds the 2.14 and 2.15 changes from untrusted JSON (see sanitize.ts). Returns undefined for other types. */
const bad = (what: string): never => {
  throw new RuleError(`Invalid ${what}.`);
};
const str = (v: unknown, what: string, max = 2000): string => (typeof v === 'string' && v.length <= max ? v : bad(what));
const optStr = (v: unknown, what: string, max = 2000): string | undefined => (v === undefined || v === null || v === '' ? undefined : str(v, what, max));
const numb = (v: unknown, what: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : bad(what));
const optNum = (v: unknown, what: string): number | undefined => (v === undefined || v === null ? undefined : numb(v, what));
const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : bad(what));
const oneOf = <T extends string>(v: unknown, list: readonly T[], what: string): T => (list.includes(v as T) ? (v as T) : bad(what));
const arr = (v: unknown, what: string, max = 5000): unknown[] => (Array.isArray(v) && v.length <= max ? v : bad(what));
const obj = (v: unknown, what: string): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : bad(what));
const day = (v: unknown, what: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(str(v, what, 10)) ? (v as string) : bad(what));
const optDay = (v: unknown, what: string) => (v === undefined || v === null || v === '' ? undefined : day(v, what));
const ids = (v: unknown, what: string, max: number): string[] => arr(v, what, max).map((x) => str(x, what, 80));
const units = (v: unknown, what: string, max = 50) => arr(v, what, max).map((x) => {
  const o = obj(x, what);
  return { product: str(o.product, 'product', 120), qty: numb(o.qty, 'quantity') };
});
const id = (v: unknown) => str(v, 'id', 80);

function signature(v: unknown, now: string): Signature | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, 'signature');
  return { name: str(o.name, 'signer name', 120), strokes: arr(o.strokes, 'signature', 60).map((st) => arr(st, 'signature', 8000).map((n) => numb(n, 'signature'))), at: now };
}

export function sanitizeOps(m: Record<string, any>, now: string): OpsMutation | undefined {
  switch (m.type) {
    case 'order.split':
      return { type: m.type, id: id(m.id), newId: id(m.newId), lines: units(m.lines, 'lines'), deliveryDate: optDay(m.deliveryDate, 'delivery date'), distributorId: optStr(m.distributorId, 'distributor', 80) };
    case 'return.request': {
      const r = obj(m.request, 'return');
      const request: ReturnRequest = { id: id(r.id), invoiceId: id(r.invoiceId), accountId: '', lines: units(r.lines, 'returned goods'), condition: oneOf(r.condition, RETURN_CONDITIONS, 'condition'), reason: str(r.reason, 'reason', 500), byId: '', at: now, status: 'Pending' };
      return { type: m.type, request };
    }
    case 'return.review':
    case 'content.review':
    case 'expense.review':
      return { type: m.type, id: id(m.id), approve: bool(m.approve, 'decision'), note: optStr(m.note, 'note', 1000) };
    case 'return.cancel':
    case 'promise.cancel':
    case 'target.delete':
    case 'campaign.delete':
    case 'content.retire':
    case 'expense.cancel':
      return { type: m.type, id: id(m.id) };
    case 'invoice.deliver': {
      const d = obj(m.delivery, 'delivery');
      const delivery: Delivery = { at: now, byId: '', receivedBy: str(d.receivedBy, 'received by', 120), signature: signature(d.signature, now), photo: optStr(d.photo, 'photo', 310_000), lat: optNum(d.lat, 'latitude'), lng: optNum(d.lng, 'longitude'), note: optStr(d.note, 'note', 500) };
      return { type: m.type, invoiceId: id(m.invoiceId), delivery };
    }
    case 'promise.add': {
      const p = obj(m.promise, 'promise');
      const promise: PayPromise = { id: id(p.id), accountId: id(p.accountId), amount: numb(p.amount, 'amount'), date: day(p.date, 'date'), note: optStr(p.note, 'note', 500), byId: '', at: now };
      return { type: m.type, promise };
    }
    case 'account.priceGroup':
      return { type: m.type, ids: ids(m.ids, 'customers', 5000), group: optStr(m.group, 'price list', 40) };
    case 'account.kam':
      return { type: m.type, ids: ids(m.ids, 'customers', 5000), kamId: optStr(m.kamId, 'key account manager', 80) };
    case 'target.set': {
      const t = obj(m.target, 'target');
      const target: Target = { id: id(t.id), userId: id(t.userId), month: str(t.month, 'month', 7), sales: optNum(t.sales, 'sales target'), collection: optNum(t.collection, 'collection target'), calls: optNum(t.calls, 'calls target'), setBy: '', at: now };
      return { type: m.type, target };
    }
    case 'secondary.upload':
      return {
        type: m.type, uploadId: id(m.uploadId), distributorId: id(m.distributorId), month: str(m.month, 'month', 7),
        rows: arr(m.rows, 'rows', 5000).map((x) => {
          const o = obj(x, 'row');
          return { product: str(o.product, 'product', 120), qty: numb(o.qty, 'units'), value: optNum(o.value, 'value'), stock: optNum(o.stock, 'stock'), territory: optStr(o.territory, 'territory', 120), accountId: optStr(o.accountId, 'customer', 80) };
        }),
      };
    case 'secondary.delete':
      return { type: m.type, uploadId: id(m.uploadId) };
    case 'campaign.save': {
      const c = obj(m.campaign, 'campaign');
      const campaign: Campaign = {
        id: id(c.id), name: str(c.name, 'name', 120), product: optStr(c.product, 'product', 120),
        keyMessages: arr(c.keyMessages ?? [], 'key messages', 10).map((k) => str(k, 'key message', 300)), objectives: arr(c.objectives ?? [], 'objectives', 10).map((k) => str(k, 'objective', 200)),
        targetIds: ids(c.targetIds ?? [], 'targets', 5000), segment: optStr(c.segment, 'segment', 40), tiers: c.tiers ? arr(c.tiers, 'tiers', 20).map((t) => str(t, 'tier', 12)) : undefined,
        frequency: optNum(c.frequency, 'frequency'), samples: c.samples ? units(c.samples, 'samples', 20) : undefined,
        start: day(c.start, 'start date'), end: day(c.end, 'end date'), status: oneOf(c.status, ['Draft', 'Live', 'Ended'] as const, 'status'), ownerId: '', createdAt: now, updatedAt: now,
      };
      return { type: m.type, campaign };
    }
    case 'content.save': {
      const d = obj(m.doc, 'content');
      const doc: ContentDoc = {
        id: id(d.id), title: str(d.title, 'title', 160), product: optStr(d.product, 'product', 120), kind: oneOf(d.kind, CONTENT_KINDS, 'kind'), url: optStr(d.url, 'link', 1000), deckHash: optStr(d.deckHash, 'presentation', 64),
        version: 1, status: d.status === 'Draft' ? 'Draft' : 'Pending', endDate: optDay(d.endDate, 'end date'), code: optStr(d.code, 'approval code', 60), byId: '', at: now,
      };
      return { type: m.type, doc };
    }
    case 'safety.report': {
      const r = obj(m.report, 'report');
      const report: SafetyReport = {
        id: id(r.id), kind: oneOf(r.kind, SAFETY_KINDS, 'report kind'), product: str(r.product, 'product', 120), accountId: optStr(r.accountId, 'customer', 80), callId: optStr(r.callId, 'call', 80),
        description: str(r.description, 'description', 4000), patientAge: optStr(r.patientAge, 'patient age', 20), patientSex: r.patientSex === undefined || r.patientSex === null ? undefined : oneOf(r.patientSex, ['Female', 'Male', 'Unknown'] as const, 'patient sex'),
        onset: optDay(r.onset, 'onset date'), serious: r.serious === undefined || r.serious === null ? undefined : bool(r.serious, 'serious flag'), batch: optStr(r.batch, 'batch', 60), byId: '', at: now, status: 'New',
      };
      return { type: m.type, report };
    }
    case 'safety.handle':
      return { type: m.type, id: id(m.id), status: oneOf(m.status, ['Acknowledged', 'Closed'] as const, 'status'), response: optStr(m.response, 'response', 2000) };
    case 'expense.submit': {
      const e = obj(m.expense, 'expense');
      const expense: Expense = { id: id(e.id), userId: id(e.userId), date: day(e.date, 'date'), category: oneOf(e.category, EXPENSE_CATEGORIES, 'category'), amount: numb(e.amount, 'amount'), note: optStr(e.note, 'note', 500), photo: optStr(e.photo, 'receipt photo', 310_000), status: 'Pending', at: now };
      return { type: m.type, expense };
    }
    case 'expense.pay':
      return { type: m.type, ids: ids(m.ids, 'expenses', 1000) };
    default:
      return undefined;
  }
}
