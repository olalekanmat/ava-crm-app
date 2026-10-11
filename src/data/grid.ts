import { POTENTIALS, ROLES, type Account, type Role, type Snapshot, type User } from './types';
import { tiersFor } from './tiers';

/**
 * Spreadsheet-style editing for administrators (2.9). A column reads a cell as text and turns
 * edited text back into the record, or says what is wrong. Saving sends the changed rows as one
 * import (the same change a CSV import makes), so every app version applies it.
 */
export interface GridColumn<T> {
  key: string;
  label: string;
  width: number;
  get: (row: T, s: Snapshot) => string;
  /** Returns the updated row, or a message when the text is not valid. */
  set: (row: T, value: string, s: Snapshot) => T | string;
  /** Values to pick from, shown as a hint. */
  choices?: (row: T, s: Snapshot) => string[];
}

const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());
const yesNo = (v: string) => /^(y|yes|true|1|n|no|false|0|)$/i.test(v.trim());
const required = (label: string) => (v: string) => (v.trim() ? undefined : `${label} is required.`);
const text = <T,>(k: keyof T & string, label: string, width: number, opts: { required?: boolean; max?: number } = {}): GridColumn<T> => ({
  key: k,
  label,
  width,
  get: (r) => String((r as Record<string, unknown>)[k] ?? ''),
  set: (r, v) => {
    const t = v.trim();
    const bad = (opts.required && required(label)(t)) || (t.length > (opts.max ?? 200) ? `${label} is too long.` : undefined);
    return bad ?? { ...r, [k]: t || (opts.required ? t : undefined) };
  },
});

const emailOf = (s: Snapshot, id?: string) => s.users.find((u) => u.id === id)?.email ?? '';
const userByEmail = (s: Snapshot, email: string) => s.users.find((u) => !u.deletedAt && u.email.toLowerCase() === email.trim().toLowerCase());

export const ACCOUNT_GRID: GridColumn<Account>[] = [
  text<Account>('name', 'Name', 220, { required: true }),
  { key: 'type', label: 'Kind', width: 70, get: (a) => a.type, set: (a, v) => (/^hc[po]$/i.test(v.trim()) ? { ...a, type: v.trim().toUpperCase() as Account['type'] } : 'Kind is HCP or HCO.'), choices: () => ['HCP', 'HCO'] },
  text<Account>('specialty', 'Specialty', 160, { required: true }),
  {
    key: 'tier',
    label: 'Tier',
    width: 70,
    get: (a) => a.tier,
    set: (a, v, s) => {
      const names = tiersFor(s.settings, s.users, a.ownerId).map((t) => t.name);
      const hit = names.find((n) => n.toLowerCase() === v.trim().toLowerCase());
      return hit ? { ...a, tier: hit } : `Tier must be one of ${names.join(', ')}.`;
    },
    choices: (a, s) => tiersFor(s.settings, s.users, a.ownerId).map((t) => t.name),
  },
  text<Account>('city', 'City', 120, { required: true }),
  text<Account>('address', 'Address', 220, { max: 300 }),
  text<Account>('phone', 'Phone', 130, { max: 60 }),
  text<Account>('email', 'Email', 180),
  {
    key: 'owner',
    label: 'Rep (email)',
    width: 200,
    get: (a, s) => emailOf(s, a.ownerId),
    set: (a, v, s) => {
      const u = userByEmail(s, v);
      return u ? { ...a, ownerId: u.id } : `No one in Users & roles has the email ${v.trim() || '(empty)'}.`;
    },
  },
  { key: 'kol', label: 'KOL', width: 60, get: (a) => (a.kol ? 'Yes' : ''), set: (a, v) => (yesNo(v) ? { ...a, kol: yes(v) } : 'KOL is Yes or empty.'), choices: () => ['Yes', ''] },
  {
    key: 'potential',
    label: 'Potential',
    width: 90,
    get: (a) => a.potential ?? '',
    set: (a, v) => {
      const p = POTENTIALS.find((x) => x.toLowerCase() === v.trim().toLowerCase());
      return p || !v.trim() ? { ...a, potential: p ?? ('' as never) } : 'Potential is High, Medium, Low or empty.';
    },
    choices: () => [...POTENTIALS, ''],
  },
  text<Account>('segment', 'Segment', 120, { max: 40 }),
];

export const USER_GRID: GridColumn<User>[] = [
  text<User>('name', 'Name', 200, { required: true }),
  text<User>('email', 'Email', 220, { required: true }),
  {
    key: 'role',
    label: 'Role',
    width: 80,
    get: (u) => u.role,
    set: (u, v) => {
      const r = ROLES.find((x) => x.toLowerCase() === v.trim().toLowerCase());
      return r ? { ...u, role: r as Role } : 'Role is Rep, FLM, SLM or Admin.';
    },
    choices: () => [...ROLES],
  },
  {
    key: 'manager',
    label: 'Manager (email)',
    width: 200,
    get: (u, s) => emailOf(s, u.managerId),
    set: (u, v, s) => {
      if (!v.trim()) return { ...u, managerId: undefined };
      const m = userByEmail(s, v);
      return m ? { ...u, managerId: m.id } : `No one has the email ${v.trim()}.`;
    },
  },
  text<User>('territory', 'Territory', 150),
  { key: 'territoryId', label: 'Territory ID', width: 120, get: (u) => u.territoryId ?? '', set: (u, v) => (v.trim().length > 60 ? 'Too long.' : { ...u, territoryId: v.trim() }) },
  { key: 'employeeId', label: 'User ID', width: 110, get: (u) => u.employeeId ?? '', set: (u, v) => (v.trim().length > 60 ? 'Too long.' : { ...u, employeeId: v.trim() }) },
  { key: 'active', label: 'Active', width: 70, get: (u) => (u.active ? 'Yes' : 'No'), set: (u, v) => (yesNo(v) && v.trim() ? { ...u, active: yes(v) } : 'Active is Yes or No.'), choices: () => ['Yes', 'No'] },
];

/** One cell change; `before` lets it be undone. */
export interface CellEdit {
  rowId: string;
  key: string;
  before: string;
  after: string;
}

/** Applies the edits (in order) to the rows they touch; returns the changed rows and any problems by cell. */
export function applyEdits<T extends { id: string }>(rows: T[], edits: CellEdit[], columns: GridColumn<T>[], s: Snapshot): { changed: T[]; problems: Map<string, string> } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const touched = new Map<string, T>();
  const problems = new Map<string, string>();
  for (const e of edits) {
    const col = columns.find((c) => c.key === e.key);
    const row = touched.get(e.rowId) ?? byId.get(e.rowId);
    if (!col || !row) continue;
    const next = col.set(row, e.after, s);
    if (typeof next === 'string') problems.set(`${e.rowId}|${e.key}`, next);
    else {
      problems.delete(`${e.rowId}|${e.key}`);
      touched.set(e.rowId, next);
    }
  }
  return { changed: [...touched.values()], problems };
}

/** The value a cell shows: its latest edit, else the saved value. */
export function cellValue<T extends { id: string }>(row: T, col: GridColumn<T>, edits: CellEdit[], s: Snapshot): string {
  for (let i = edits.length - 1; i >= 0; i--) if (edits[i].rowId === row.id && edits[i].key === col.key) return edits[i].after;
  return col.get(row, s);
}
