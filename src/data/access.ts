import { ROLE_LABEL, type Snapshot, type User } from './types';

/** True for administrators, including a Rep, FLM or SLM who is also an administrator. */
export const isAdmin = (u?: User | null): boolean => !!u && (u.role === 'Admin' || u.admin === true);

/** "First-line manager" or, for a dual role, "First-line manager · Administrator". */
export const roleLabel = (u: User): string => (u.role !== 'Admin' && u.admin ? `${ROLE_LABEL[u.role]} · Administrator` : ROLE_LABEL[u.role]);

/** Leaves out deleted people and accounts (they stay in the data only for call history). */
export function withoutDeleted(s: Snapshot): Snapshot {
  if (!s.users.some((u) => u.deletedAt) && !s.accounts.some((a) => a.deletedAt)) return s;
  return { ...s, users: s.users.filter((u) => !u.deletedAt), accounts: s.accounts.filter((a) => !a.deletedAt) };
}

/** Direct reports of a manager. */
export function reportsOf(users: User[], managerId: string): User[] {
  return users.filter((u) => u.managerId === managerId && u.active);
}

/** Reps under a user: themselves (Rep), their team (FLM), their FLMs' teams (SLM), everyone (Admin). */
export function repsUnder(users: User[], user: User): User[] {
  if (user.role === 'Rep') return [user];
  if (user.role === 'Admin') return users.filter((u) => u.role === 'Rep' && u.active);
  const out: User[] = [];
  const walk = (id: string, depth: number) => {
    for (const r of reportsOf(users, id)) {
      if (r.role === 'Rep') out.push(r);
      else if (depth < 4) walk(r.id, depth + 1);
    }
  };
  walk(user.id, 0);
  return out;
}

/** Everyone below a user in the reporting line (FLMs and reps for an SLM). */
export function subtree(users: User[], user: User): User[] {
  const out: User[] = [];
  const walk = (id: string, depth: number) => {
    for (const r of users.filter((u) => u.managerId === id)) {
      out.push(r);
      if (depth < 4) walk(r.id, depth + 1);
    }
  };
  walk(user.id, 0);
  return out;
}

/** User ids whose accounts, calls and plans this user may see: themselves and everyone below them. */
export function visibleOwnerIds(users: User[], user: User): Set<string> {
  if (isAdmin(user)) return new Set(users.map((u) => u.id));
  return new Set([user.id, ...subtree(users, user).map((u) => u.id)]);
}

/** True when `manager` is above `userId` in the reporting line (or is an admin). */
export function manages(users: User[], manager: User, userId: string): boolean {
  if (isAdmin(manager)) return true;
  let cur = users.find((u) => u.id === userId);
  for (let i = 0; cur?.managerId && i < 5; i++) {
    if (cur.managerId === manager.id) return true;
    cur = users.find((u) => u.id === cur!.managerId);
  }
  return false;
}

/** The part of the data a user is allowed to see. The server sends only this. */
export function scopeSnapshot(s: Snapshot, user: User): Snapshot {
  if (isAdmin(user)) return s;
  const owners = visibleOwnerIds(s.users, user);
  // Names of people in view plus the user's own reporting line.
  const people = new Set(owners);
  let cur: User | undefined = user;
  for (let i = 0; cur?.managerId && i < 5; i++) {
    people.add(cur.managerId);
    cur = s.users.find((u) => u.id === cur!.managerId);
  }
  return {
    ...s,
    users: s.users.filter((u) => people.has(u.id)),
    accounts: s.accounts.filter((a) => owners.has(a.ownerId)),
    calls: s.calls.filter((c) => owners.has(c.ownerId)),
    plans: s.plans.filter((p) => owners.has(p.ownerId)),
  };
}
