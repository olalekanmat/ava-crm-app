import { lengthOfCycle } from './cycles';
import { geoStatus } from './geo';
import { newId } from './ids';
import { repMetrics, callsByAccount, cycleCalls } from './metrics';
import { tiersFor } from './tiers';
import type { Account, Cycle, Product, Role, Snapshot, User } from './types';
import { ROLES } from './types';

/** RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const cell = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  // Neutralise spreadsheet formula injection for values that start with = + - @.
  // Plain numbers and phone numbers such as +1 555 0100 are left alone.
  const safe = /^[=+\-@]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Rows as objects keyed by normalised header (lowercase, spaces -> underscores). */
function records(text: string): { header: string[]; rows: Record<string, string>[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { header: [], rows: [] };
  const header = head.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return { header, rows: body.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim().replace(/^'(?=[=+\-@])/, '')]))) };
}

export interface ImportRow<T> {
  line: number;
  item?: T;
  /** True when the row updates an existing record. */
  update?: boolean;
  /** Set when the row deletes a record (action column says "delete"). */
  remove?: { id: string; label: string; transferTo?: string };
  errors: string[];
}

export interface ImportResult<T> {
  rows: ImportRow<T>[];
  missingColumns: string[];
  valid: T[];
  /** Records to delete, from rows whose action is "delete". */
  deletes: { id: string; transferTo?: string }[];
}

function finish<T>(rows: ImportRow<T>[], missingColumns: string[]): ImportResult<T> {
  const ok = missingColumns.length ? [] : rows.filter((r) => !r.errors.length);
  return {
    rows,
    missingColumns,
    valid: ok.filter((r) => r.item).map((r) => r.item!),
    deletes: ok.filter((r) => r.remove).map((r) => ({ id: r.remove!.id, transferTo: r.remove!.transferTo })),
  };
}

const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));
const yes = (v?: string) => /^(yes|y|true|1|admin)$/i.test((v ?? '').trim());
const no = (v?: string) => /^(false|no|n|0|inactive)$/i.test((v ?? '').trim());

/** The optional action column: blank, add or update keep the record; delete removes it. */
function actionOf(v?: string): 'upsert' | 'delete' | undefined {
  const a = (v ?? '').trim().toLowerCase();
  if (!a || ['add', 'new', 'update', 'edit', 'upsert', 'keep'].includes(a)) return 'upsert';
  if (['delete', 'remove', 'del'].includes(a)) return 'delete';
  return undefined;
}
const badAction = (v?: string) => `action must be blank, add, update or delete (not "${v ?? ''}")`;
/** The same limits the data rules apply when every device replays the change, so a row that passes here is not dropped later. */
function tooLong(r: Record<string, string | undefined>, limits: Record<string, number>, errors: string[]) {
  for (const [col, max] of Object.entries(limits)) if ((r[col] ?? '').length > max) errors.push(`${col} must be ${max} characters or fewer`);
}

export const ACCOUNT_COLUMNS = ['action', 'id', 'type', 'name', 'specialty', 'affiliation', 'tier', 'address', 'city', 'phone', 'email', 'owner_email', 'territory_id', 'lat', 'lng'];
export const USER_COLUMNS = ['action', 'name', 'email', 'role', 'admin', 'user_id', 'manager_email', 'territory', 'territory_id', 'active', 'transfer_to_email'];
export const PRODUCT_COLUMNS = ['action', 'name', 'key_messages', 'active'];

export function importAccounts(text: string, s: Snapshot): ImportResult<Account> {
  const { header, rows } = records(text);
  const live = s.accounts.filter((a) => !a.deletedAt);
  const people = s.users.filter((u) => !u.deletedAt);
  const byEmail = new Map(people.map((u) => [u.email.toLowerCase(), u]));
  const missing = rows.some((r) => actionOf(r.action) === 'upsert')
    ? [...['type', 'name', 'specialty', 'tier', 'city'].filter((c) => !header.includes(c)), ...(header.includes('owner_email') || header.includes('territory_id') ? [] : ['owner_email (or territory_id)'])]
    : header.includes('id') || (header.includes('name') && header.includes('city'))
      ? []
      : ['id (or name and city)'];
  const seen = new Set<string>();
  const out = rows.map((r, i): ImportRow<Account> => {
    const line = i + 2;
    const action = actionOf(r.action);
    if (!action) return { line, errors: [badAction(r.action)] };
    const sameName = (a: Account) => a.name.toLowerCase() === r.name?.toLowerCase() && a.city.toLowerCase() === r.city?.toLowerCase();
    const existing = r.id ? s.accounts.find((a) => a.id === r.id) : live.find(sameName);
    if (action === 'delete') {
      if (!r.id && live.filter(sameName).length > 1) return { line, errors: [`several accounts are named "${r.name}" in ${r.city}; give the id instead`] };
      if (!existing || existing.deletedAt) return { line, errors: [r.id ? `no account with id ${r.id}` : `no account named "${r.name ?? ''}" in ${r.city ?? ''}`] };
      if (seen.has(existing.id)) return { line, errors: ['duplicate row for the same account'] };
      seen.add(existing.id);
      return { line, errors: [], remove: { id: existing.id, label: existing.name } };
    }
    const errors: string[] = [];
    if (existing?.deletedAt) errors.push(`account ${r.id} was deleted; leave id empty to add it again`);
    tooLong(r, { id: 80, name: 200, specialty: 200, affiliation: 200, address: 300, city: 120, phone: 60, email: 200 }, errors);
    const type = r.type?.toUpperCase();
    if (type !== 'HCP' && type !== 'HCO') errors.push('type must be HCP or HCO');
    if (!r.name) errors.push('name is required');
    if (!r.specialty) errors.push('specialty is required');
    if (!r.city) errors.push('city is required');
    let owner: User | undefined;
    if (r.owner_email) {
      owner = byEmail.get(r.owner_email.toLowerCase());
      if (!owner) errors.push(`no user with email "${r.owner_email}"`);
      else if (r.territory_id && owner.territoryId?.toLowerCase() !== r.territory_id.toLowerCase()) errors.push(`owner_email ${r.owner_email} is not the rep for territory_id "${r.territory_id}"; give one or the other`);
    } else if (r.territory_id) {
      const t = r.territory_id.toLowerCase();
      const found = people.filter((u) => u.role === 'Rep' && u.active && u.territoryId?.toLowerCase() === t);
      if (found.length === 1) owner = found[0];
      else errors.push(found.length ? `territory_id "${r.territory_id}" belongs to ${found.length} reps; give owner_email instead` : `no active rep with territory_id "${r.territory_id}"`);
    } else errors.push('owner_email or territory_id is required');
    if (owner && owner.role !== 'Rep') errors.push(`${owner.email} is not a rep`);
    const scheme = tiersFor(s.settings, s.users, owner?.id);
    const tier = scheme.find((t) => t.name.toLowerCase() === (r.tier ?? '').trim().toLowerCase())?.name;
    if (!tier) errors.push(`tier must be one of ${scheme.map((t) => t.name).join(', ')}`);
    const lat = num(r.lat ?? '');
    const lng = num(r.lng ?? '');
    if ((lat === undefined) !== (lng === undefined)) errors.push('give both lat and lng, or neither');
    if (lat !== undefined && (Number.isNaN(lat) || Math.abs(lat) > 90)) errors.push('lat must be between -90 and 90');
    if (lng !== undefined && (Number.isNaN(lng) || Math.abs(lng) > 180)) errors.push('lng must be between -180 and 180');
    const id = existing?.id ?? (r.id || newId('acc'));
    if (seen.has(id)) errors.push('duplicate row for the same account');
    seen.add(id);
    if (errors.length) return { line, errors };
    return {
      line,
      update: !!existing,
      errors,
      item: {
        id,
        type: type as Account['type'],
        name: r.name,
        specialty: r.specialty,
        affiliation: r.affiliation || undefined,
        tier: tier!,
        address: r.address ?? '',
        city: r.city,
        phone: r.phone || undefined,
        email: r.email || undefined,
        ownerId: owner!.id,
        lat,
        lng,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      },
    };
  });
  return finish(out, missing);
}

export function importUsers(text: string, s: Snapshot, actorId?: string): ImportResult<User> {
  const { header, rows } = records(text);
  const missing = rows.some((r) => actionOf(r.action) === 'upsert') ? ['name', 'email', 'role'].filter((c) => !header.includes(c)) : ['email'].filter((c) => !header.includes(c));
  // Columns left out of the file keep what each person already has (older files have no admin, user_id or territory_id).
  const has = (c: string) => header.includes(c);
  // Managers may be defined earlier in the same file. Deleted people do not count.
  const byEmail = new Map(s.users.filter((u) => !u.deletedAt).map((u) => [u.email.toLowerCase(), u]));
  const userIds = new Map(s.users.filter((u) => !u.deletedAt && u.employeeId).map((u) => [u.employeeId!.toLowerCase(), u.email.toLowerCase()]));
  const out: (ImportRow<User> | undefined)[] = rows.map((r, i): ImportRow<User> | undefined => {
    const line = i + 2;
    const errors: string[] = [];
    const email = (r.email ?? '').toLowerCase();
    const action = actionOf(r.action);
    if (!action) return { line, errors: [badAction(r.action)] };
    if (action === 'delete') return undefined; // second pass, once every add and update is known
    const existing = byEmail.get(email);
    const role = ROLES.find((x) => x.toLowerCase() === (r.role ?? '').toLowerCase()) as Role | undefined;
    if (!r.name) errors.push('name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('valid email is required');
    if (!role) errors.push('role must be Rep, FLM, SLM or Admin');
    tooLong(r, { name: 200, email: 200, territory: 200, user_id: 60, territory_id: 60 }, errors);
    const userId = (r.user_id ?? '').trim();
    if (userId) {
      const owner = userIds.get(userId.toLowerCase());
      if (owner && owner !== email) errors.push(`user_id ${userId} is already used by ${owner}`);
    }
    let managerId: string | undefined;
    if (r.manager_email) {
      const m = byEmail.get(r.manager_email.toLowerCase());
      if (!m) errors.push(`manager ${r.manager_email} not found (list managers above their reports)`);
      else if (role === 'Rep' && m.role !== 'FLM') errors.push('a Rep must report to an FLM');
      else if (role === 'FLM' && m.role !== 'SLM') errors.push('an FLM must report to an SLM');
      else managerId = m.id;
    }
    if (existing && existing.id === actorId && (no(r.active) || (role !== 'Admin' && (has('admin') ? !yes(r.admin) : !existing.admin)))) errors.push('you cannot remove your own admin access');
    if (errors.length) return { line, errors };
    const user: User = {
      id: existing?.id ?? newId('usr'),
      name: r.name,
      email,
      role: role!,
      // false / '' clear the value; undefined keeps what the person has.
      admin: has('admin') ? role !== 'Admin' && yes(r.admin) : undefined,
      employeeId: has('user_id') ? userId : undefined,
      managerId,
      territory: r.territory || undefined,
      territoryId: has('territory_id') ? (r.territory_id ?? '') : undefined,
      active: !no(r.active),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    byEmail.set(email, { ...existing, ...user, admin: user.admin ?? existing?.admin, employeeId: user.employeeId ?? existing?.employeeId, territoryId: user.territoryId ?? existing?.territoryId });
    if (userId) userIds.set(userId.toLowerCase(), email);
    return { line, errors, update: !!existing, item: user };
  });

  // Deletes, checked against the people as they will be after the adds and updates above.
  const deleting = new Set<string>();
  const movedTo = new Map<string, number>();
  rows.forEach((r, i) => {
    if (out[i] || actionOf(r.action) !== 'delete') return;
    const line = i + 2;
    const errors: string[] = [];
    const existing = byEmail.get((r.email ?? '').toLowerCase());
    if (!existing) return void (out[i] = { line, errors: [`no user with email "${r.email ?? ''}"`] });
    if (existing.id === actorId) return void (out[i] = { line, errors: ['you cannot delete yourself'] });
    if (deleting.has(existing.id)) return void (out[i] = { line, errors: ['duplicate row for the same user'] });
    if (out.some((o) => o?.item?.id === existing.id && !o.errors.length)) return void (out[i] = { line, errors: ['the same user is also added or updated in this file'] });
    let transferTo: string | undefined;
    if (r.transfer_to_email) {
      const to = byEmail.get(r.transfer_to_email.toLowerCase());
      if (!to) errors.push(`no user with email "${r.transfer_to_email}" to take over`);
      else if (to.id === existing.id || deleting.has(to.id)) errors.push('transfer_to_email must be someone who stays');
      else if (!to.active) errors.push('transfer_to_email must be an active user');
      else if (to.role !== existing.role) errors.push(`transfer_to_email must be another ${existing.role}`);
      else transferTo = to.id;
    }
    const owned = s.accounts.filter((a) => a.ownerId === existing.id && !a.deletedAt).length + (movedTo.get(existing.id) ?? 0);
    if (owned && !r.transfer_to_email) errors.push(`${existing.email} has ${owned} account${owned > 1 ? 's' : ''}; add transfer_to_email (another ${existing.role}) to move them`);
    if (errors.length) return void (out[i] = { line, errors });
    deleting.add(existing.id);
    if (transferTo) movedTo.set(transferTo, (movedTo.get(transferTo) ?? 0) + owned);
    out[i] = { line, errors, remove: { id: existing.id, label: existing.name, transferTo } };
  });
  return finish(out as ImportRow<User>[], missing);
}

export function importProducts(text: string, s: Snapshot): ImportResult<Product> {
  const { header, rows } = records(text);
  const missing = ['name'].filter((c) => !header.includes(c));
  const removed = new Set<string>();
  const out = rows.map((r, i): ImportRow<Product> => {
    const line = i + 2;
    const action = actionOf(r.action);
    if (!action) return { line, errors: [badAction(r.action)] };
    if (!r.name) return { line, errors: ['name is required'] };
    const keyMessages = (r.key_messages ?? '').split('|').map((x) => x.trim()).filter(Boolean);
    if (action === 'upsert') {
      const errors: string[] = [];
      tooLong(r, { name: 120 }, errors);
      if (keyMessages.length > 50) errors.push('at most 50 key messages');
      if (keyMessages.some((k) => k.length > 300)) errors.push('each key message must be 300 characters or fewer');
      if (errors.length) return { line, errors };
    }
    const existing = s.products.find((p) => p.name.toLowerCase() === r.name.toLowerCase());
    if (action === 'delete') {
      if (!existing) return { line, errors: [`no product named "${r.name}"`] };
      if (removed.has(existing.id)) return { line, errors: ['duplicate row for the same product'] };
      removed.add(existing.id);
      return { line, errors: [], remove: { id: existing.id, label: existing.name } };
    }
    return {
      line,
      errors: [],
      update: !!existing,
      item: {
        id: existing?.id ?? newId('prd'),
        name: r.name,
        keyMessages,
        active: !no(r.active),
      },
    };
  });
  return finish(out, missing);
}

export const TEMPLATES = {
  accounts: toCsv(ACCOUNT_COLUMNS, [
    ['', '', 'HCP', 'Dr. Jane Doe', 'Cardiology', 'City Hospital', 'ST', '1 Main St', 'Lakeview', '+1 555 0100', 'jane@example.com', 'rep@example.com', '', '6.4541', '3.3947'],
    ['', '', 'HCO', 'City Hospital', 'Teaching hospital', '', 'T1', '1 Main St', 'Lakeview', '', '', '', 'LAG-IKJ-01', '', ''],
  ]),
  users: toCsv(USER_COLUMNS, [
    ['', 'Sam Regional', 'sam@example.com', 'SLM', 'yes', 'EMP-001', '', 'West region', 'WEST', 'yes', ''],
    ['', 'Fola Manager', 'fola@example.com', 'FLM', 'no', 'EMP-002', 'sam@example.com', 'Lagos district', 'LAG', 'yes', ''],
    ['', 'Ade Rep', 'ade@example.com', 'Rep', 'no', 'EMP-003', 'fola@example.com', 'Ikeja', 'LAG-IKJ-01', 'yes', ''],
  ]),
  products: toCsv(PRODUCT_COLUMNS, [['', 'Cardiovex', 'Efficacy vs. standard of care|Once-daily dosing', 'yes']]),
};

// ---------- Exports ----------

const userOf = (s: Snapshot, id?: string) => (id ? s.users.find((u) => u.id === id) : undefined);
const userName = (s: Snapshot, id?: string) => userOf(s, id)?.name ?? '';
const userEmail = (s: Snapshot, id?: string) => userOf(s, id)?.email ?? '';

export function exportCalls(s: Snapshot): string {
  const accounts = new Map(s.accounts.map((a) => [a.id, a]));
  return toCsv(
    ['call_id', 'status', 'datetime', 'rep', 'rep_email', 'rep_user_id', 'territory_id', 'account', 'account_type', 'tier', 'city', 'channel', 'products', 'key_messages', 'attendees', 'notes', 'next_step', 'follow_up', 'checkin_lat', 'checkin_lng', 'checkin_accuracy_m', 'checkin_distance_m', 'geo_status', 'submitted_at'],
    [...s.calls]
      .sort((a, b) => a.datetime.localeCompare(b.datetime))
      .map((c) => {
        const a = accounts.get(c.accountId);
        return [
          c.id, c.status, c.datetime, userName(s, c.ownerId), userEmail(s, c.ownerId), userOf(s, c.ownerId)?.employeeId, userOf(s, c.ownerId)?.territoryId, a?.name, a?.type, a?.tier, a?.city, c.channel,
          c.products.map((p) => p.product).join(' | '), c.keyMessages.join(' | '), c.attendees, c.notes, c.nextStep, c.followUpDate,
          c.checkIn?.lat, c.checkIn?.lng, c.checkIn?.accuracy, c.checkIn?.distanceM, geoStatus(c, s.settings.geofenceM), c.submittedAt,
        ];
      }),
  );
}

export function exportAccounts(s: Snapshot): string {
  return toCsv(
    ACCOUNT_COLUMNS,
    s.accounts
      .filter((a) => !a.deletedAt)
      .map((a) => ['', a.id, a.type, a.name, a.specialty, a.affiliation, a.tier, a.address, a.city, a.phone, a.email, userEmail(s, a.ownerId), userOf(s, a.ownerId)?.territoryId, a.lat, a.lng]),
  );
}

export function exportUsers(s: Snapshot): string {
  return toCsv(
    USER_COLUMNS,
    s.users
      .filter((u) => !u.deletedAt)
      .map((u) => ['', u.name, u.email, u.role, u.admin ? 'yes' : '', u.employeeId, userEmail(s, u.managerId), u.territory, u.territoryId, u.active ? 'yes' : 'no', '']),
  );
}

/** Cycle columns added at the end of the plan exports (2.3), so monthly and quarterly cycles are told apart. */
const CYCLE_COLUMNS = ['cycle_id', 'cycle_length', 'cycle_start', 'cycle_end'];
const cycleCells = (cycle: Cycle) => [cycle.id, lengthOfCycle(cycle) === 'month' ? 'monthly' : 'quarterly', cycle.start, cycle.end];

/** One row per rep and planned account: planned vs done in the cycle. */
export function exportCyclePlans(s: Snapshot, cycle: Cycle): string {
  const rows: unknown[][] = [];
  for (const plan of s.plans.filter((p) => p.cycleId === cycle.id)) {
    const done = callsByAccount(cycleCalls(s.calls.filter((c) => c.ownerId === plan.ownerId), cycle));
    for (const t of plan.targets) {
      const a = s.accounts.find((x) => x.id === t.accountId);
      const n = done.get(t.accountId)?.length ?? 0;
      rows.push([cycle.name, userName(s, plan.ownerId), plan.status, a?.name, a?.tier, t.planned, n, Math.min(100, Math.round((n / t.planned) * 100)), ...cycleCells(cycle)]);
    }
  }
  return toCsv(['cycle', 'rep', 'plan_status', 'account', 'tier', 'planned_calls', 'calls_done', 'attainment_pct', ...CYCLE_COLUMNS], rows);
}

/** One row per rep: the KPIs managers look at. */
export function exportTeamSummary(s: Snapshot, cycle: Cycle): string {
  const reps = s.users.filter((u) => u.role === 'Rep' && !u.deletedAt);
  return toCsv(
    ['cycle', 'rep', 'user_id', 'manager', 'territory', 'territory_id', 'plan_status', 'calls_submitted', 'planned_calls', 'on_plan_calls', 'attainment_pct', 'reach_pct', 'geo_verified_pct', 'off_site_calls', 'missing_checkins', 'open_drafts', ...CYCLE_COLUMNS],
    reps.map((r) => {
      const m = repMetrics(s, r, cycle);
      return [cycle.name, r.name, r.employeeId, userName(s, r.managerId), r.territory, r.territoryId, m.plan?.status ?? 'None', m.calls, m.planned, m.onPlan, Math.round(m.attainment * 100), Math.round(m.reach * 100), Math.round(m.geoVerified * 100), m.offSite, m.missingCheckIn, m.drafts, ...cycleCells(cycle)];
    }),
  );
}
