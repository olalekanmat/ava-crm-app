import { RuleError, type Mutation } from './mutations';
import { REPORT_COLUMNS } from './reports';
import { CHANNELS, REPORT_DATASETS, REPORT_DATE_PRESETS, REPORT_GROUPS, REPORT_METRICS, ROLES, type Account, type ReportDef, type ReportFilters, type Call, type Company, type Cycle, type CyclePlan, type GeoTag, type Product, type Settings, type TierDef, type User } from './types';

/**
 * Rebuilds a mutation from untrusted JSON (a journal file in the company drive), keeping only
 * known fields with the right types. The business rules in applyMutation then run on clean data.
 * Timestamps the author cannot be trusted with come from `now`, the journal entry's time, so every
 * device replays the same result.
 */
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
const iso = (v: unknown, what: string): string => {
  const s = str(v, what, 40);
  return Number.isNaN(Date.parse(s)) ? bad(what) : s;
};
const day = (v: unknown, what: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(str(v, what, 10)) ? (v as string) : bad(what));

function account(v: unknown, now: string): Account {
  const a = obj(v, 'account');
  return {
    id: str(a.id, 'account id', 80), type: oneOf(a.type, ['HCP', 'HCO'] as const, 'account type'), name: str(a.name, 'name', 200),
    specialty: str(a.specialty, 'specialty', 200), affiliation: optStr(a.affiliation, 'affiliation', 200), tier: str(a.tier, 'tier', 12),
    address: str(a.address ?? '', 'address', 300), city: str(a.city, 'city', 120), phone: optStr(a.phone, 'phone', 60), email: optStr(a.email, 'email', 200),
    notes: optStr(a.notes, 'notes'), ownerId: str(a.ownerId, 'owner', 80), lat: optNum(a.lat, 'latitude'), lng: optNum(a.lng, 'longitude'),
    createdAt: a.createdAt ? iso(a.createdAt, 'date') : now,
  };
}

function geo(v: unknown): GeoTag | undefined {
  if (v === undefined || v === null) return undefined;
  const g = obj(v, 'check-in');
  return { lat: numb(g.lat, 'latitude'), lng: numb(g.lng, 'longitude'), accuracy: optNum(g.accuracy, 'accuracy'), at: iso(g.at, 'check-in time'), distanceM: optNum(g.distanceM, 'distance') };
}

function call(v: unknown, now: string): Call {
  const c = obj(v, 'call');
  return {
    id: str(c.id, 'call id', 80), accountId: str(c.accountId, 'account', 80), ownerId: str(c.ownerId, 'owner', 80), datetime: iso(c.datetime, 'call time'),
    channel: oneOf(c.channel, CHANNELS, 'channel'), status: oneOf(c.status, ['Planned', 'Saved', 'Submitted'] as const, 'status'),
    products: arr(c.products, 'products', 20).map((p) => {
      const o = obj(p, 'product');
      return { product: str(o.product, 'product', 120), priority: numb(o.priority, 'priority') };
    }),
    keyMessages: arr(c.keyMessages, 'key messages', 50).map((k) => str(k, 'key message', 300)),
    attendees: optStr(c.attendees, 'attendees', 500), notes: optStr(c.notes, 'notes', 5000), nextStep: optStr(c.nextStep, 'next step', 500),
    followUpDate: c.followUpDate ? day(c.followUpDate, 'follow-up date') : undefined, checkIn: geo(c.checkIn),
    createdAt: c.createdAt ? iso(c.createdAt, 'date') : now, updatedAt: now,
    // applyMutation stamps the submit time from the journal entry.
    submittedAt: undefined,
  };
}

function plan(v: unknown, now: string): CyclePlan {
  const p = obj(v, 'plan');
  return {
    id: str(p.id, 'plan id', 80), ownerId: str(p.ownerId, 'owner', 80), cycleId: str(p.cycleId, 'cycle', 80), status: 'Draft',
    targets: arr(p.targets, 'targets', 2000).map((t) => {
      const o = obj(t, 'target');
      return { accountId: str(o.accountId, 'account', 80), planned: numb(o.planned, 'planned calls') };
    }),
    updatedAt: now,
  };
}

function user(v: unknown, now: string): User {
  const u = obj(v, 'user');
  return {
    id: str(u.id, 'user id', 80), name: str(u.name, 'name', 200), email: str(u.email, 'email', 200), role: oneOf(u.role, ROLES, 'role'),
    // A field that is absent keeps the person's current value (older app versions do not send it);
    // false or an empty value clears it.
    admin: !('admin' in u) || u.admin === undefined ? undefined : u.admin === null ? false : bool(u.admin, 'admin flag'),
    employeeId: !('employeeId' in u) || u.employeeId === undefined ? undefined : (optStr(u.employeeId, 'user ID', 60) ?? ''),
    territoryId: !('territoryId' in u) || u.territoryId === undefined ? undefined : (optStr(u.territoryId, 'territory ID', 60) ?? ''),
    managerId: optStr(u.managerId, 'manager', 80), territory: optStr(u.territory, 'territory', 200), active: bool(u.active, 'active flag'),
    createdAt: u.createdAt ? iso(u.createdAt, 'date') : now,
  };
}

function product(v: unknown): Product {
  const p = obj(v, 'product');
  return { id: str(p.id, 'product id', 80), name: str(p.name, 'product name', 120), keyMessages: arr(p.keyMessages, 'key messages', 50).map((k) => str(k, 'key message', 300)), active: bool(p.active, 'active flag') };
}

function cycle(v: unknown): Cycle {
  const c = obj(v, 'cycle');
  return { id: str(c.id, 'cycle id', 80), name: str(c.name, 'cycle name', 120), start: day(c.start, 'start date'), end: day(c.end, 'end date') };
}

function settings(v: unknown): Partial<Pick<Settings, 'geofenceM' | 'requireCheckIn' | 'cycleLength'>> {
  const s = obj(v, 'settings');
  const out: Partial<Pick<Settings, 'geofenceM' | 'requireCheckIn' | 'cycleLength'>> = {};
  if ('geofenceM' in s) out.geofenceM = numb(s.geofenceM, 'geofence');
  if ('requireCheckIn' in s) out.requireCheckIn = bool(s.requireCheckIn, 'check-in setting');
  // 2.3: cycle length. Older versions drop this field and keep planning by quarter.
  if ('cycleLength' in s) out.cycleLength = oneOf(s.cycleLength, ['quarter', 'month'] as const, 'cycle length');
  return out;
}

const COMPANY_FIELDS = ['name', 'address', 'city', 'country', 'phone', 'email', 'website', 'registrationNo'] as const;

function company(v: unknown): Partial<Company> {
  const c = obj(v, 'company');
  const out: Partial<Company> = {};
  for (const k of COMPANY_FIELDS) if (k in c) out[k] = optStr(c[k], k, 300) ?? '';
  if ('logo' in c) out.logo = optStr(c.logo, 'logo', 400_000);
  return out;
}

function tierDefs(v: unknown): TierDef[] | null {
  if (v === null) return null;
  return arr(v, 'tiers', 8).map((t) => {
    const o = obj(t, 'tier');
    return { name: str(o.name, 'tier name', 12), frequency: numb(o.frequency, 'tier frequency') };
  });
}

function renames(v: unknown): Record<string, string> | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, 'tier renames');
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(o).slice(0, 20)) out[str(k, 'tier name', 12)] = str(x, 'tier name', 12);
  return out;
}

// ----- reports (2.3) -----

const REPORT_GEO = ['Verified', 'Off-site', 'Unverified', 'Missing', 'Remote'] as const;
const REPORT_STATUSES = ['Planned', 'Saved', 'Submitted', 'Draft', 'Approved', 'Rejected'] as const;

function reportFilters(v: unknown): ReportFilters {
  const f = v === undefined || v === null ? {} : obj(v, 'report filters');
  const out: ReportFilters = {};
  if (f.date !== undefined && f.date !== null) out.date = oneOf(f.date, REPORT_DATE_PRESETS, 'report dates');
  if (f.from) out.from = day(f.from, 'report start date');
  if (f.to) out.to = day(f.to, 'report end date');
  out.teamId = optStr(f.teamId, 'report team', 80);
  out.repId = optStr(f.repId, 'report rep', 80);
  out.product = optStr(f.product, 'report product', 120);
  if (f.status) out.status = oneOf(f.status, REPORT_STATUSES, 'report status');
  out.tier = optStr(f.tier, 'report tier', 12);
  if (f.channel) out.channel = oneOf(f.channel, CHANNELS, 'report channel');
  if (f.geo) out.geo = oneOf(f.geo, REPORT_GEO, 'report check-in status');
  if (f.notVisitedDays !== undefined && f.notVisitedDays !== null) {
    const n = numb(f.notVisitedDays, 'report days');
    out.notVisitedDays = Number.isInteger(n) && n >= 1 && n <= 3650 ? n : bad('report days');
  }
  // Leave out empty keys so every device stores the same object.
  for (const k of Object.keys(out) as (keyof ReportFilters)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** A report definition from a journal. Unknown columns and metrics (from a newer version) are dropped. */
function report(v: unknown): ReportDef {
  const r = obj(v, 'report');
  const id = str(r.id, 'report id', 80);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) bad('report id');
  const dataset = oneOf(r.dataset, REPORT_DATASETS, 'report dataset');
  const known = REPORT_COLUMNS[dataset].map((c) => c.key);
  const columns = arr(r.columns ?? [], 'report columns', 40).map((c) => str(c, 'report column', 40)).filter((c, i, all) => known.includes(c) && all.indexOf(c) === i);
  const metrics = arr(r.metrics ?? [], 'report metrics', 10).filter((m, i, all): m is ReportDef['metrics'][number] => REPORT_METRICS.includes(m as never) && all.indexOf(m) === i);
  let sort: ReportDef['sort'];
  if (r.sort !== undefined && r.sort !== null) {
    const o = obj(r.sort, 'report sort');
    sort = { key: str(o.key, 'report sort', 40), dir: oneOf(o.dir, ['asc', 'desc'] as const, 'report sort') };
  }
  const out: ReportDef = {
    id, name: str(r.name, 'report name', 80), dataset, columns, filters: reportFilters(r.filters),
    groupBy: oneOf(r.groupBy ?? 'none', REPORT_GROUPS, 'report grouping'), metrics,
  };
  if (sort) out.sort = sort;
  return out;
}

export function sanitizeMutation(raw: unknown, at: Date): Mutation {
  const now = at.toISOString();
  const m = obj(raw, 'change');
  switch (m.type) {
    case 'account.upsert':
      return { type: m.type, account: account(m.account, now) };
    case 'account.pin':
      return { type: m.type, id: str(m.id, 'account id', 80), lat: numb(m.lat, 'latitude'), lng: numb(m.lng, 'longitude') };
    case 'call.save':
      return { type: m.type, call: call(m.call, now) };
    case 'call.delete':
    case 'plan.submit':
    case 'plan.reopen':
      return { type: m.type, id: str(m.id, 'id', 80) };
    case 'plan.save':
      return { type: m.type, plan: plan(m.plan, now) };
    case 'plan.review':
      return { type: m.type, id: str(m.id, 'id', 80), approve: bool(m.approve, 'decision'), note: optStr(m.note, 'note', 2000) };
    case 'user.upsert':
      return { type: m.type, user: user(m.user, now) };
    case 'user.delete':
      return {
        type: m.type,
        users: arr(m.users, 'users', 5000).map((x) => {
          const o = obj(x, 'user');
          return { id: str(o.id, 'user id', 80), transferTo: optStr(o.transferTo, 'user id', 80) };
        }),
      };
    case 'user.photo':
      return { type: m.type, id: str(m.id, 'user id', 80), photo: optStr(m.photo, 'photo', 200_000) };
    case 'account.delete':
    case 'product.delete':
      return { type: m.type, ids: arr(m.ids, 'ids', 20000).map((x) => str(x, 'id', 80)) };
    case 'product.upsert':
      return { type: m.type, product: product(m.product) };
    case 'cycle.upsert':
      return { type: m.type, cycle: cycle(m.cycle) };
    case 'settings.update':
      return { type: m.type, settings: settings(m.settings) };
    case 'company.update':
      return { type: m.type, company: company(m.company) };
    case 'tiers.update':
      return { type: m.type, teamId: optStr(m.teamId, 'team', 80), tiers: tierDefs(m.tiers), renames: renames(m.renames) };
    case 'import.accounts':
      return { type: m.type, accounts: arr(m.accounts, 'accounts', 20000).map((a) => account(a, now)) };
    case 'import.users':
      return { type: m.type, users: arr(m.users, 'users', 5000).map((u) => user(u, now)) };
    case 'import.products':
      return { type: m.type, products: arr(m.products, 'products', 1000).map(product) };
    // ----- reports (2.3) -----
    case 'report.save':
      return { type: m.type, report: report(m.report) };
    case 'report.delete':
      return { type: m.type, id: str(m.id, 'report id', 80) };
    default:
      return bad('change type');
  }
}
