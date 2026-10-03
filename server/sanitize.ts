import { RuleError, type Mutation } from '../src/data/mutations';
import { CHANNELS, ROLES, TIERS, type Account, type Call, type Cycle, type CyclePlan, type GeoTag, type Product, type Settings, type User } from '../src/data/types';

/**
 * Rebuilds a mutation from untrusted JSON, keeping only known fields with the right types.
 * The business rules in applyMutation then run on clean data.
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

function account(v: unknown): Account {
  const a = obj(v, 'account');
  return {
    id: str(a.id, 'account id', 80), type: oneOf(a.type, ['HCP', 'HCO'] as const, 'account type'), name: str(a.name, 'name', 200),
    specialty: str(a.specialty, 'specialty', 200), affiliation: optStr(a.affiliation, 'affiliation', 200), tier: oneOf(a.tier, TIERS, 'tier'),
    address: str(a.address ?? '', 'address', 300), city: str(a.city, 'city', 120), phone: optStr(a.phone, 'phone', 60), email: optStr(a.email, 'email', 200),
    notes: optStr(a.notes, 'notes'), ownerId: str(a.ownerId, 'owner', 80), lat: optNum(a.lat, 'latitude'), lng: optNum(a.lng, 'longitude'),
    createdAt: a.createdAt ? iso(a.createdAt, 'date') : new Date().toISOString(),
  };
}

function geo(v: unknown): GeoTag | undefined {
  if (v === undefined || v === null) return undefined;
  const g = obj(v, 'check-in');
  return { lat: numb(g.lat, 'latitude'), lng: numb(g.lng, 'longitude'), accuracy: optNum(g.accuracy, 'accuracy'), at: iso(g.at, 'check-in time'), distanceM: optNum(g.distanceM, 'distance') };
}

function call(v: unknown): Call {
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
    createdAt: c.createdAt ? iso(c.createdAt, 'date') : new Date().toISOString(), updatedAt: new Date().toISOString(),
    // The server stamps the submit time itself.
    submittedAt: undefined,
  };
}

function plan(v: unknown): CyclePlan {
  const p = obj(v, 'plan');
  return {
    id: str(p.id, 'plan id', 80), ownerId: str(p.ownerId, 'owner', 80), cycleId: str(p.cycleId, 'cycle', 80), status: 'Draft',
    targets: arr(p.targets, 'targets', 2000).map((t) => {
      const o = obj(t, 'target');
      return { accountId: str(o.accountId, 'account', 80), planned: numb(o.planned, 'planned calls') };
    }),
    updatedAt: new Date().toISOString(),
  };
}

function user(v: unknown): User {
  const u = obj(v, 'user');
  return {
    id: str(u.id, 'user id', 80), name: str(u.name, 'name', 200), email: str(u.email, 'email', 200), role: oneOf(u.role, ROLES, 'role'),
    managerId: optStr(u.managerId, 'manager', 80), territory: optStr(u.territory, 'territory', 200), active: bool(u.active, 'active flag'),
    createdAt: u.createdAt ? iso(u.createdAt, 'date') : new Date().toISOString(),
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

function settings(v: unknown): Partial<Settings> {
  const s = obj(v, 'settings');
  const out: Partial<Settings> = {};
  if ('companyName' in s) out.companyName = str(s.companyName, 'company name', 200);
  if ('geofenceM' in s) out.geofenceM = numb(s.geofenceM, 'geofence');
  if ('requireCheckIn' in s) out.requireCheckIn = bool(s.requireCheckIn, 'check-in setting');
  if ('tierFrequency' in s) {
    const t = obj(s.tierFrequency, 'tier frequency');
    out.tierFrequency = { A: numb(t.A, 'tier A frequency'), B: numb(t.B, 'tier B frequency'), C: numb(t.C, 'tier C frequency') };
  }
  return out;
}

export function sanitizeMutation(raw: unknown): Mutation {
  const m = obj(raw, 'change');
  switch (m.type) {
    case 'account.upsert':
      return { type: m.type, account: account(m.account) };
    case 'account.pin':
      return { type: m.type, id: str(m.id, 'account id', 80), lat: numb(m.lat, 'latitude'), lng: numb(m.lng, 'longitude') };
    case 'call.save':
      return { type: m.type, call: call(m.call) };
    case 'call.delete':
    case 'plan.submit':
    case 'plan.reopen':
      return { type: m.type, id: str(m.id, 'id', 80) };
    case 'plan.save':
      return { type: m.type, plan: plan(m.plan) };
    case 'plan.review':
      return { type: m.type, id: str(m.id, 'id', 80), approve: bool(m.approve, 'decision'), note: optStr(m.note, 'note', 2000) };
    case 'user.upsert':
      return { type: m.type, user: user(m.user), password: optStr(m.password, 'password', 200) };
    case 'product.upsert':
      return { type: m.type, product: product(m.product) };
    case 'cycle.upsert':
      return { type: m.type, cycle: cycle(m.cycle) };
    case 'settings.update':
      return { type: m.type, settings: settings(m.settings) };
    case 'import.accounts':
      return { type: m.type, accounts: arr(m.accounts, 'accounts', 20000).map(account) };
    case 'import.users':
      return { type: m.type, users: arr(m.users, 'users', 5000).map(user) };
    case 'import.products':
      return { type: m.type, products: arr(m.products, 'products', 1000).map(product) };
    default:
      return bad('change type');
  }
}
