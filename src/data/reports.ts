import { isAdmin, scopeSnapshot } from './access';
import { activeCycleLength, previousCycle } from './cycles';
import { toCsv } from './csv';
import { addDays, toDateKey } from './dates';
import { geoStatus } from './geo';
import { currentCycle } from './metrics';
import { teamOf } from './tiers';
import type { Account, Call, Cycle, ReportDataset, ReportDef, ReportFilters, ReportGroupBy, ReportMetric, Snapshot, User } from './types';

/**
 * The report engine: pure functions from the company data and a report definition to a table.
 * The data is always cut down to what the viewer may see (scopeSnapshot) first, so a report
 * never shows anything outside the viewer's scope, whoever wrote the definition.
 */

export type CellKind = 'text' | 'number' | 'pct' | 'date';
export type Cell = string | number | null;

export interface ColumnDef {
  key: string;
  label: string;
  kind: CellKind;
}

export const DATASET_LABEL: Record<ReportDataset, string> = { calls: 'Calls', accounts: 'Accounts', plans: 'Cycle plans', activity: 'Team activity' };
export const DATASET_HINT: Record<ReportDataset, string> = {
  calls: 'One row per call: who, where, when, products and check-in.',
  accounts: 'One row per account, with its last visit and calls in the period.',
  plans: 'One row per rep and planned account: planned vs done in the cycle.',
  activity: 'One row per rep: calls, accounts reached and check-ins in the period.',
};
export const GROUP_LABEL: Record<ReportGroupBy, string> = { none: 'No grouping', rep: 'Rep', team: 'Team', account: 'Account', tier: 'Tier', product: 'Product', week: 'Week', month: 'Month' };
export const METRIC_LABEL: Record<ReportMetric, string> = { count: 'Count', plannedDone: 'Planned vs done', attainment: 'Attainment %', reach: 'Reach %', geoVerified: 'Geo-verified %' };
export const DATE_LABEL = { thisCycle: 'This cycle', lastCycle: 'Last cycle', thisMonth: 'This month', lastMonth: 'Last month', custom: 'Custom dates', all: 'All time' } as const;

const c = (key: string, label: string, kind: CellKind = 'text'): ColumnDef => ({ key, label, kind });

/** The columns each dataset offers for ungrouped reports. */
export const REPORT_COLUMNS: Record<ReportDataset, ColumnDef[]> = {
  calls: [
    c('date', 'Date', 'date'), c('time', 'Time'), c('rep', 'Rep'), c('repId', 'User ID'), c('team', 'Team'), c('territory', 'Territory'),
    c('account', 'Account'), c('accountType', 'Type'), c('specialty', 'Specialty'), c('city', 'City'), c('tier', 'Tier'), c('channel', 'Channel'),
    c('status', 'Status'), c('products', 'Products'), c('keyMessages', 'Key messages'), c('geo', 'Check-in'), c('distanceM', 'Distance (m)', 'number'),
    c('nextStep', 'Next step'), c('followUp', 'Follow-up', 'date'), c('notes', 'Notes'),
  ],
  accounts: [
    c('account', 'Account'), c('accountType', 'Type'), c('specialty', 'Specialty'), c('city', 'City'), c('tier', 'Tier'), c('rep', 'Rep'), c('team', 'Team'),
    c('lastVisit', 'Last visit', 'date'), c('daysSince', 'Days since visit', 'number'), c('calls', 'Calls in period', 'number'), c('planned', 'Planned calls', 'number'),
    c('scheduled', 'Scheduled', 'number'), c('located', 'Location pinned'),
  ],
  plans: [
    c('cycle', 'Cycle'), c('rep', 'Rep'), c('team', 'Team'), c('status', 'Plan status'), c('account', 'Account'), c('tier', 'Tier'),
    c('planned', 'Planned', 'number'), c('done', 'Done', 'number'), c('attainment', 'Attainment %', 'pct'),
  ],
  activity: [
    c('rep', 'Rep'), c('repId', 'User ID'), c('team', 'Team'), c('territory', 'Territory'), c('calls', 'Calls submitted', 'number'),
    c('accounts', 'Accounts reached', 'number'), c('activeDays', 'Active days', 'number'), c('scheduled', 'Scheduled', 'number'), c('drafts', 'Drafts', 'number'),
    c('inPerson', 'In person', 'number'), c('offSite', 'Off-site', 'number'), c('missingCheckIn', 'No check-in', 'number'), c('geoVerified', 'Geo-verified %', 'pct'),
    c('lastCall', 'Last call', 'date'),
  ],
};

/** Columns shown when a definition picks none. */
export const DEFAULT_COLUMNS: Record<ReportDataset, string[]> = {
  calls: ['date', 'rep', 'account', 'tier', 'channel', 'status', 'products', 'geo'],
  accounts: ['account', 'tier', 'rep', 'lastVisit', 'daysSince', 'calls'],
  plans: ['cycle', 'rep', 'status', 'account', 'tier', 'planned', 'done', 'attainment'],
  activity: ['rep', 'team', 'calls', 'accounts', 'activeDays', 'geoVerified'],
};

/** Which filters apply to each dataset (the builder shows only these). */
export const DATASET_FILTERS: Record<ReportDataset, (keyof ReportFilters)[]> = {
  calls: ['date', 'teamId', 'repId', 'product', 'status', 'tier', 'channel', 'geo'],
  accounts: ['date', 'teamId', 'repId', 'tier', 'notVisitedDays'],
  plans: ['date', 'teamId', 'repId', 'status', 'tier'],
  activity: ['date', 'teamId', 'repId'],
};

export const STATUS_OPTIONS: Partial<Record<ReportDataset, string[]>> = {
  calls: ['Planned', 'Saved', 'Submitted'],
  plans: ['Draft', 'Submitted', 'Approved', 'Rejected'],
};

/** Words for the count column, per dataset. */
const COUNT_LABEL: Record<ReportDataset, string> = { calls: 'Calls', accounts: 'Accounts', plans: 'Targets', activity: 'Reps' };
const PLANNED_LABEL: Record<ReportDataset, [string, string]> = {
  calls: ['Calls', 'Submitted'],
  accounts: ['Planned', 'Calls'],
  plans: ['Planned', 'Done'],
  activity: ['Calls', 'Submitted'],
};

export const MAX_REPORTS = 50;
/** Largest saved definition, as JSON characters. */
export const MAX_REPORT_CHARS = 4000;
/** Rows a table shows at most; exports include every row. */
export const MAX_ROWS_SHOWN = 500;

// ---------- dates ----------

export interface ReportContext {
  now: Date;
}

export interface DateRange {
  from?: string;
  to?: string;
  label: string;
  /** Set for this cycle / last cycle: plans then match that cycle exactly. */
  cycle?: Cycle;
}

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 12);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);

/** The dates a definition covers, resolved against today and the company's cycles. */
export function resolveRange(s: Pick<Snapshot, 'cycles' | 'settings'>, f: ReportFilters, now: Date): DateRange {
  const preset = f.date ?? 'thisCycle';
  const length = activeCycleLength(s.settings);
  switch (preset) {
    case 'thisCycle':
    case 'lastCycle': {
      const cur = currentCycle(s.cycles, now, length);
      const cycle = cur && preset === 'lastCycle' ? previousCycle(s.cycles, cur, length) : cur;
      return cycle ? { from: cycle.start, to: cycle.end, label: cycle.name, cycle } : { label: 'No cycle' };
    }
    case 'thisMonth':
      return { from: toDateKey(monthStart(now)), to: toDateKey(monthEnd(now)), label: monthStart(now).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) };
    case 'lastMonth': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
      return { from: toDateKey(monthStart(prev)), to: toDateKey(monthEnd(prev)), label: prev.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) };
    }
    case 'custom':
      return { from: f.from, to: f.to, label: `${f.from ?? '…'} to ${f.to ?? '…'}` };
    default:
      return { label: 'All time' };
  }
}

const inRange = (day: string | undefined, r: DateRange) => !!day && (!r.from || day >= r.from) && (!r.to || day <= r.to);
const dayOf = (iso: string) => toDateKey(new Date(iso));

/** Monday of the week a day falls in, as YYYY-MM-DD. */
export function weekOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return toDateKey(addDays(dt, -((dt.getDay() + 6) % 7)));
}

// ---------- base rows ----------

interface Measures {
  count: number;
  planned: number;
  done: number;
  onPlan: number;
  targets: number;
  reached: number;
  inPerson: number;
  verified: number;
}

interface BaseRow {
  values: Record<string, Cell>;
  m: Measures;
  ownerId?: string;
  account?: string;
  tier?: string;
  products?: string[];
  /** The day used for week and month grouping. */
  day?: string;
}

const zero = (): Measures => ({ count: 0, planned: 0, done: 0, onPlan: 0, targets: 0, reached: 0, inPerson: 0, verified: 0 });

interface Lookup {
  s: Snapshot;
  users: Map<string, User>;
  accounts: Map<string, Account>;
  teamName(ownerId: string): string;
  teamId(ownerId: string): string | undefined;
}

function lookup(s: Snapshot): Lookup {
  const users = new Map(s.users.map((u) => [u.id, u]));
  return {
    s,
    users,
    accounts: new Map(s.accounts.map((a) => [a.id, a])),
    teamId: (ownerId) => teamOf(s.users, ownerId),
    teamName(ownerId) {
      const t = teamOf(s.users, ownerId);
      const flm = t ? users.get(t) : undefined;
      return flm ? flm.territory || flm.name : 'No team';
    },
  };
}

/** The people filter: team (FLM id) and rep. */
function personOk(L: Lookup, f: ReportFilters, ownerId: string): boolean {
  if (f.repId && ownerId !== f.repId) return false;
  if (f.teamId && L.teamId(ownerId) !== f.teamId) return false;
  return true;
}

function callRows(L: Lookup, f: ReportFilters, r: DateRange): BaseRow[] {
  const { s } = L;
  const out: BaseRow[] = [];
  for (const call of s.calls) {
    const day = dayOf(call.datetime);
    if (!inRange(day, r) || !personOk(L, f, call.ownerId)) continue;
    const a = L.accounts.get(call.accountId);
    const products = call.products.map((p) => p.product);
    const geo = geoStatus(call, s.settings.geofenceM);
    if (f.product && !products.some((p) => p.toLowerCase() === f.product!.toLowerCase())) continue;
    if (f.status && call.status !== f.status) continue;
    if (f.tier && a?.tier !== f.tier) continue;
    if (f.channel && call.channel !== f.channel) continue;
    if (f.geo && geo !== f.geo) continue;
    const rep = L.users.get(call.ownerId);
    const submitted = call.status === 'Submitted';
    const checked = submitted && geo !== 'Remote';
    const d = new Date(call.datetime);
    out.push({
      values: {
        date: day, time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, rep: rep?.name ?? '', repId: rep?.employeeId ?? '',
        team: L.teamName(call.ownerId), territory: rep?.territory ?? '', account: a?.name ?? '', accountType: a?.type ?? '', specialty: a?.specialty ?? '', city: a?.city ?? '',
        tier: a?.tier ?? '', channel: call.channel, status: call.status, products: products.join(' | '), keyMessages: call.keyMessages.join(' | '),
        geo: geo === 'Remote' ? 'Not needed' : geo, distanceM: call.checkIn?.distanceM ?? null, nextStep: call.nextStep ?? '', followUp: call.followUpDate ?? null, notes: call.notes ?? '',
      },
      m: { ...zero(), count: 1, planned: 1, done: submitted ? 1 : 0, onPlan: submitted ? 1 : 0, inPerson: checked ? 1 : 0, verified: checked && geo === 'Verified' ? 1 : 0 },
      ownerId: call.ownerId,
      account: a?.name,
      tier: a?.tier,
      products,
      day,
    });
  }
  return out;
}

/** Plans that fall in the range: exactly the cycle for this/last cycle, else any overlapping cycle. */
function plansIn(s: Snapshot, r: DateRange) {
  const cycles = new Map(s.cycles.map((c) => [c.id, c]));
  return s.plans
    .map((p) => ({ p, cycle: cycles.get(p.cycleId) }))
    .filter((x): x is { p: (typeof s.plans)[number]; cycle: Cycle } => {
      if (!x.cycle) return false;
      if (r.cycle) return x.cycle.id === r.cycle.id;
      return (!r.to || x.cycle.start <= r.to) && (!r.from || x.cycle.end >= r.from);
    });
}

/** Submitted calls per owner and account between two days. */
function doneCounter(calls: Call[]) {
  const byOwner = new Map<string, Call[]>();
  for (const c of calls) if (c.status === 'Submitted') byOwner.set(c.ownerId, [...(byOwner.get(c.ownerId) ?? []), c]);
  return (ownerId: string, accountId: string, from: string, to: string) =>
    (byOwner.get(ownerId) ?? []).filter((c) => {
      if (c.accountId !== accountId) return false;
      const d = dayOf(c.datetime);
      return d >= from && d <= to;
    }).length;
}

function planRows(L: Lookup, f: ReportFilters, r: DateRange): BaseRow[] {
  const { s } = L;
  const done = doneCounter(s.calls);
  const out: BaseRow[] = [];
  for (const { p, cycle } of plansIn(s, r)) {
    if (!personOk(L, f, p.ownerId)) continue;
    if (f.status && p.status !== f.status) continue;
    const rep = L.users.get(p.ownerId);
    for (const t of p.targets) {
      const a = L.accounts.get(t.accountId);
      if (f.tier && a?.tier !== f.tier) continue;
      const n = done(p.ownerId, t.accountId, cycle.start, cycle.end);
      const onPlan = Math.min(n, t.planned);
      out.push({
        values: {
          cycle: cycle.name, rep: rep?.name ?? '', team: L.teamName(p.ownerId), status: p.status, account: a?.name ?? '', tier: a?.tier ?? '',
          planned: t.planned, done: n, attainment: t.planned ? onPlan / t.planned : null,
        },
        m: { ...zero(), count: 1, planned: t.planned, done: n, onPlan, targets: 1, reached: n > 0 ? 1 : 0 },
        ownerId: p.ownerId,
        account: a?.name,
        tier: a?.tier,
        day: cycle.start,
      });
    }
  }
  return out;
}

function accountRows(L: Lookup, f: ReportFilters, r: DateRange, now: Date): BaseRow[] {
  const { s } = L;
  const today = toDateKey(now);
  const last = new Map<string, string>();
  const callsIn = new Map<string, number>();
  const scheduled = new Map<string, number>();
  for (const c of s.calls) {
    const d = dayOf(c.datetime);
    if (c.status === 'Submitted') {
      if (d > (last.get(c.accountId) ?? '')) last.set(c.accountId, d);
      if (inRange(d, r)) callsIn.set(c.accountId, (callsIn.get(c.accountId) ?? 0) + 1);
    } else if (c.status === 'Planned' && inRange(d, r)) scheduled.set(c.accountId, (scheduled.get(c.accountId) ?? 0) + 1);
  }
  const planned = new Map<string, number>();
  for (const { p } of plansIn(s, r)) for (const t of p.targets) if (p.ownerId === L.accounts.get(t.accountId)?.ownerId) planned.set(t.accountId, (planned.get(t.accountId) ?? 0) + t.planned);
  const cutoff = f.notVisitedDays ? toDateKey(addDays(new Date(`${today}T12:00:00`), -f.notVisitedDays)) : undefined;
  const out: BaseRow[] = [];
  for (const a of s.accounts) {
    if (a.deletedAt || !personOk(L, f, a.ownerId)) continue;
    if (f.tier && a.tier !== f.tier) continue;
    const lastVisit = last.get(a.id);
    if (cutoff && lastVisit && lastVisit > cutoff) continue;
    const n = callsIn.get(a.id) ?? 0;
    const pl = planned.get(a.id) ?? 0;
    const days = lastVisit ? Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${lastVisit}T12:00:00`)) / 86400000) : null;
    out.push({
      values: {
        account: a.name, accountType: a.type, specialty: a.specialty, city: a.city, tier: a.tier, rep: L.users.get(a.ownerId)?.name ?? '', team: L.teamName(a.ownerId),
        lastVisit: lastVisit ?? null, daysSince: days, calls: n, planned: pl, scheduled: scheduled.get(a.id) ?? 0, located: a.lat !== undefined && a.lng !== undefined ? 'Yes' : 'No',
      },
      m: { ...zero(), count: 1, planned: pl, done: n, onPlan: Math.min(pl, n), targets: 1, reached: n > 0 ? 1 : 0 },
      ownerId: a.ownerId,
      account: a.name,
      tier: a.tier,
      day: lastVisit,
    });
  }
  return out;
}

function activityRows(L: Lookup, f: ReportFilters, r: DateRange): BaseRow[] {
  const { s } = L;
  const reps = s.users.filter((u) => u.role === 'Rep' && u.active && !u.deletedAt && personOk(L, f, u.id));
  const owned = new Map<string, number>();
  for (const a of s.accounts) if (!a.deletedAt) owned.set(a.ownerId, (owned.get(a.ownerId) ?? 0) + 1);
  return reps.map((rep) => {
    const mine = s.calls.filter((c) => c.ownerId === rep.id && inRange(dayOf(c.datetime), r));
    const submitted = mine.filter((c) => c.status === 'Submitted');
    const geo = submitted.map((c) => geoStatus(c, s.settings.geofenceM)).filter((g) => g !== 'Remote');
    const verified = geo.filter((g) => g === 'Verified').length;
    const accounts = new Set(submitted.map((c) => c.accountId)).size;
    const lastCall = submitted.map((c) => dayOf(c.datetime)).sort().at(-1) ?? null;
    return {
      values: {
        rep: rep.name, repId: rep.employeeId ?? '', team: L.teamName(rep.id), territory: rep.territory ?? '', calls: submitted.length, accounts,
        activeDays: new Set(submitted.map((c) => dayOf(c.datetime))).size, scheduled: mine.filter((c) => c.status === 'Planned').length,
        drafts: mine.filter((c) => c.status === 'Saved').length, inPerson: geo.length, offSite: geo.filter((g) => g === 'Off-site').length,
        missingCheckIn: geo.filter((g) => g === 'Missing').length, geoVerified: geo.length ? verified / geo.length : null, lastCall,
      },
      m: { ...zero(), count: 1, planned: mine.length, done: submitted.length, onPlan: submitted.length, targets: owned.get(rep.id) ?? 0, reached: accounts, inPerson: geo.length, verified },
      ownerId: rep.id,
      day: lastCall ?? undefined,
    };
  });
}

// ---------- running a report ----------

export interface ReportResult {
  title: string;
  range: DateRange;
  columns: ColumnDef[];
  rows: Cell[][];
  /** One value per column; null where a total makes no sense. */
  totals: Cell[];
  /** Bars for grouped reports: the group and the first metric. */
  chart?: { label: string; value: number; kind: CellKind }[];
  /** Rows before the on-screen limit. */
  total: number;
  grouped: boolean;
}

const ratio = (a: number, b: number): number | null => (b ? a / b : null);

function metricColumns(def: ReportDef): ColumnDef[] {
  const cols: ColumnDef[] = [];
  const metrics = def.metrics.length ? def.metrics : (['count'] as ReportMetric[]);
  for (const m of metrics) {
    if (m === 'count') cols.push(c('count', COUNT_LABEL[def.dataset], 'number'));
    if (m === 'plannedDone') cols.push(c('planned', PLANNED_LABEL[def.dataset][0], 'number'), c('done', PLANNED_LABEL[def.dataset][1], 'number'));
    if (m === 'attainment') cols.push(c('attainment', def.dataset === 'calls' || def.dataset === 'activity' ? 'Completed %' : 'Attainment %', 'pct'));
    if (m === 'reach') cols.push(c('reach', 'Reach %', 'pct'));
    if (m === 'geoVerified') cols.push(c('geoVerified', 'Geo-verified %', 'pct'));
  }
  return cols;
}

function metricValue(key: string, m: Measures): Cell {
  switch (key) {
    case 'count':
      return m.count;
    case 'planned':
      return m.planned;
    case 'done':
      return m.done;
    case 'attainment':
      return ratio(m.onPlan, m.planned);
    case 'reach':
      return ratio(m.reached, m.targets);
    case 'geoVerified':
      return ratio(m.verified, m.inPerson);
    default:
      return null;
  }
}

const add = (a: Measures, b: Measures): Measures => ({
  count: a.count + b.count, planned: a.planned + b.planned, done: a.done + b.done, onPlan: a.onPlan + b.onPlan,
  targets: a.targets + b.targets, reached: a.reached + b.reached, inPerson: a.inPerson + b.inPerson, verified: a.verified + b.verified,
});

const MONTH_FMT = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1, 12).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

/** The groups a row belongs to (a call with three products is in three product groups). */
function groupKeys(L: Lookup, g: ReportGroupBy, r: BaseRow): { key: string; label: string }[] {
  const none = [{ key: '~', label: '—' }];
  switch (g) {
    case 'rep':
      return r.ownerId ? [{ key: r.ownerId, label: L.users.get(r.ownerId)?.name ?? 'Unknown' }] : none;
    case 'team': {
      if (!r.ownerId) return none;
      return [{ key: L.teamId(r.ownerId) ?? '~', label: L.teamName(r.ownerId) }];
    }
    case 'account':
      return r.account ? [{ key: r.account, label: r.account }] : none;
    case 'tier':
      return r.tier ? [{ key: r.tier, label: r.tier }] : none;
    case 'product':
      return r.products?.length ? r.products.map((p) => ({ key: p.toLowerCase(), label: p })) : none;
    case 'week':
      return r.day ? [{ key: weekOf(r.day), label: `Week of ${weekOf(r.day)}` }] : [{ key: '~', label: 'No date' }];
    case 'month':
      return r.day ? [{ key: r.day.slice(0, 7), label: MONTH_FMT(r.day.slice(0, 7)) }] : [{ key: '~', label: 'No date' }];
    default:
      return none;
  }
}

function compare(a: Cell, b: Cell): number {
  // Empty values sort after everything else in either direction (handled by the caller).
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortRows(rows: Cell[][], index: number, dir: 'asc' | 'desc', tiebreak = 0) {
  const sign = dir === 'asc' ? 1 : -1;
  rows.sort((x, y) => {
    const a = x[index];
    const b = y[index];
    const ea = a === null || a === '';
    const eb = b === null || b === '';
    if (ea || eb) {
      if (ea && eb) return compare(x[tiebreak], y[tiebreak]);
      return ea ? 1 : -1;
    }
    return sign * compare(a, b) || compare(x[tiebreak], y[tiebreak]);
  });
}

/** Runs a report for a viewer. Rows beyond `limit` are counted in `total` but not returned. */
export function runReport(snapshot: Snapshot, def: ReportDef, viewer: User, now: Date, limit = Infinity): ReportResult {
  // Cut the data down to the viewer's scope, whatever the caller passed in. Deleted people and
  // accounts stay in, so submitted calls keep their names; the accounts list leaves them out.
  const s = scopeSnapshot(snapshot, viewer);
  const L = lookup(s);
  const f = def.filters ?? {};
  const range = resolveRange(s, f, now);
  const base =
    def.dataset === 'calls' ? callRows(L, f, range) : def.dataset === 'plans' ? planRows(L, f, range) : def.dataset === 'accounts' ? accountRows(L, f, range, now) : activityRows(L, f, range);

  const grouped = def.groupBy !== 'none';
  let columns: ColumnDef[];
  let rows: Cell[][];
  let totals: Cell[];
  let chart: ReportResult['chart'];

  if (grouped) {
    const metrics = metricColumns(def);
    columns = [c('group', GROUP_LABEL[def.groupBy]), ...metrics];
    const groups = new Map<string, { label: string; m: Measures }>();
    let all = zero();
    for (const r of base) {
      all = add(all, r.m);
      for (const g of groupKeys(L, def.groupBy, r)) {
        const cur = groups.get(g.key) ?? { label: g.label, m: zero() };
        cur.m = add(cur.m, r.m);
        groups.set(g.key, cur);
      }
    }
    const chrono = def.groupBy === 'week' || def.groupBy === 'month';
    const entries = [...groups.entries()];
    rows = entries.map(([, g]) => [g.label, ...metrics.map((m) => metricValue(m.key, g.m))]);
    const keyOf = new Map(rows.map((r, i) => [r, entries[i][0]]));
    totals = ['Total', ...metrics.map((m) => metricValue(m.key, all))];
    const sortIdx = def.sort ? columns.findIndex((col) => col.key === def.sort!.key) : -1;
    if (sortIdx >= 0) sortRows(rows, sortIdx, def.sort!.dir);
    else if (chrono) rows.sort((x, y) => keyOf.get(x)!.localeCompare(keyOf.get(y)!));
    else sortRows(rows, 1, 'desc');
    const first = metrics[0];
    chart = first ? rows.map((r) => ({ label: String(r[0]), value: typeof r[1] === 'number' ? r[1] : 0, kind: first.kind })) : undefined;
  } else {
    const all = REPORT_COLUMNS[def.dataset];
    const keys = def.columns.filter((k) => all.some((x) => x.key === k));
    columns = (keys.length ? keys : DEFAULT_COLUMNS[def.dataset]).map((k) => all.find((x) => x.key === k)!);
    rows = base.map((r) => columns.map((col) => r.values[col.key] ?? null));
    const sum = base.reduce((m, r) => add(m, r.m), zero());
    totals = columns.map((col, i) => {
      if (i === 0) return `${base.length} ${base.length === 1 ? 'row' : 'rows'}`;
      if (col.kind === 'number') return rows.reduce((n, r) => n + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0);
      if (col.kind === 'pct') return col.key === 'geoVerified' ? ratio(sum.verified, sum.inPerson) : ratio(sum.onPlan, sum.planned);
      return null;
    });
    const sortIdx = def.sort ? columns.findIndex((col) => col.key === def.sort!.key) : -1;
    if (sortIdx >= 0) sortRows(rows, sortIdx, def.sort!.dir);
    else {
      const dateIdx = columns.findIndex((col) => col.kind === 'date');
      if (dateIdx >= 0) sortRows(rows, dateIdx, 'desc');
      else sortRows(rows, 0, 'asc');
    }
  }

  return { title: def.name, range, columns, rows: rows.slice(0, limit), totals, chart: chart?.slice(0, 30), total: rows.length, grouped };
}

/** A cell as text for the table and CSV. Percentages are whole numbers. */
export function formatCell(v: Cell, kind: CellKind): string {
  if (v === null || v === undefined || v === '') return kind === 'pct' ? '–' : '';
  if (kind === 'pct' && typeof v === 'number') return `${Math.round(v * 100)}%`;
  return String(v);
}

/** The report as CSV, every row, with a totals line. */
export function reportCsv(result: ReportResult): string {
  const cell = (v: Cell, kind: CellKind) => (kind === 'pct' && typeof v === 'number' ? Math.round(v * 100) : v);
  return toCsv(
    result.columns.map((col) => (col.kind === 'pct' ? col.label.replace(/ ?%$/, ' %') : col.label)),
    [...result.rows.map((r) => r.map((v, i) => cell(v, result.columns[i].kind))), result.totals.map((v, i) => cell(v, result.columns[i].kind))],
  );
}

/** A file name for the export, e.g. "ava-report-calls-by-rep-2026-10-08.csv". */
export function reportFileName(name: string, now: Date): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';
  return `ava-report-${slug}-${toDateKey(now)}.csv`;
}

// ---------- who may do what ----------

/** Administrators build and save reports; managers run them on their own scope. */
export const canBuildReports = (u?: User) => isAdmin(u);
export const canViewReports = (u?: User) => !!u && (isAdmin(u) || u.role === 'FLM' || u.role === 'SLM');

// ---------- built-in templates ----------

const tpl = (id: string, name: string, dataset: ReportDataset, rest: Partial<ReportDef>): ReportDef => ({ id, name, dataset, columns: [], filters: {}, groupBy: 'none', metrics: [], ...rest });

export const REPORT_TEMPLATES: ReportDef[] = [
  tpl('tpl-calls-by-rep', 'Calls by rep this cycle', 'calls', { filters: { date: 'thisCycle', status: 'Submitted' }, groupBy: 'rep', metrics: ['count', 'geoVerified'] }),
  tpl('tpl-coverage-tier', 'Coverage by tier', 'accounts', { filters: { date: 'thisCycle' }, groupBy: 'tier', metrics: ['count', 'reach', 'plannedDone', 'attainment'] }),
  tpl('tpl-attainment-team', 'Plan attainment by team', 'plans', { filters: { date: 'thisCycle' }, groupBy: 'team', metrics: ['plannedDone', 'attainment', 'reach'] }),
  tpl('tpl-offsite', 'Off-site check-ins', 'calls', { filters: { date: 'thisCycle', geo: 'Off-site', status: 'Submitted' }, columns: ['date', 'rep', 'account', 'city', 'distanceM', 'geo'], sort: { key: 'distanceM', dir: 'desc' } }),
  tpl('tpl-products', 'Product mentions', 'calls', { filters: { date: 'thisCycle', status: 'Submitted' }, groupBy: 'product', metrics: ['count'] }),
  tpl('tpl-not-visited', 'Accounts not visited in 60 days', 'accounts', { filters: { date: 'all', notVisitedDays: 60 }, columns: ['account', 'tier', 'city', 'rep', 'team', 'lastVisit', 'daysSince'], sort: { key: 'daysSince', dir: 'desc' } }),
  tpl('tpl-activity-month', 'Team activity this month', 'activity', { filters: { date: 'thisMonth' }, columns: ['rep', 'team', 'calls', 'accounts', 'activeDays', 'scheduled', 'drafts', 'geoVerified', 'lastCall'], sort: { key: 'calls', dir: 'desc' } }),
  tpl('tpl-calls-by-week', 'Calls by week this cycle', 'calls', { filters: { date: 'thisCycle' }, groupBy: 'week', metrics: ['plannedDone', 'attainment'] }),
];

export const isTemplateId = (id: string) => id.startsWith('tpl-');

/** Saved company reports plus the built-in templates, saved ones first. */
export function allReports(saved: ReportDef[] | undefined): ReportDef[] {
  return [...(saved ?? []), ...REPORT_TEMPLATES];
}

/** Checks a definition before it is saved. Returns a message or undefined. */
export function reportProblem(def: ReportDef): string | undefined {
  if (!def.name.trim()) return 'Give the report a name.';
  if (def.name.trim().length > 80) return 'Use a name of 80 characters or fewer.';
  if (def.filters.date === 'custom' && (!def.filters.from || !def.filters.to)) return 'Enter both custom dates (YYYY-MM-DD).';
  if (def.filters.from && def.filters.to && def.filters.from > def.filters.to) return 'The start date must be before the end date.';
  if (JSON.stringify(def).length > MAX_REPORT_CHARS) return 'This report definition is too large.';
  return undefined;
}

/** Product names to offer in the product filter: the catalogue plus anything named on calls. */
export function reportProducts(s: Snapshot): string[] {
  const names = new Set(s.products.map((p) => p.name));
  for (const call of s.calls) for (const p of call.products) names.add(p.product);
  return [...names].sort((a, b) => a.localeCompare(b));
}
