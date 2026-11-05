import { COMPANY_WIDE_FUNCTIONS, FUNCTION_LABEL, ROLE_LABEL, WAREHOUSE, type Snapshot, type User } from './types';

/** True for administrators, including a Rep, FLM or SLM who is also an administrator. */
export const isAdmin = (u?: User | null): boolean => !!u && (u.role === 'Admin' || u.admin === true);

/** "First-line manager" or, for a dual role, "First-line manager · Administrator". */
export const roleLabel = (u: User): string =>
  [u.role !== 'Admin' && u.admin ? `${ROLE_LABEL[u.role]} · Administrator` : ROLE_LABEL[u.role], ...(u.functions ?? []).map((f) => FUNCTION_LABEL[f]).filter(Boolean)].join(' · ');

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
  // Administrators and the back-office roles (Finance, invoicing, credit approval, marketing) see everything.
  if (isAdmin(user) || user.functions?.some((f) => COMPANY_WIDE_FUNCTIONS.includes(f))) return s;
  // 2.15: a distributor's sign-in sees the products, its own orders and its own sales reports.
  if (user.functions?.includes('distributor') && user.distributorId) {
    const d = user.distributorId;
    const orders = (s.orders ?? []).filter((o) => o.distributorId === d && o.status === 'Forwarded');
    const accountIds = new Set(orders.map((o) => o.accountId));
    return {
      ...s, users: s.users.filter((u) => u.id === user.id), accounts: s.accounts.filter((a) => accountIds.has(a.id)), calls: [], plans: [], leaves: [], tasks: [], samples: [], events: [], accountChanges: [], sampleCounts: [], sampleRequests: [],
      invoices: [], stockMoves: [], distributors: (s.distributors ?? []).filter((x) => x.id === d), orders, paymentClaims: [], creditRequests: [], returns: [], promises: [], targets: [],
      secondarySales: (s.secondarySales ?? []).filter((x) => x.distributorId === d), campaigns: [], content: [], safetyReports: [], expenses: [],
    };
  }
  const owners = visibleOwnerIds(s.users, user);
  // 2.15: a key account manager also sees the key accounts they look after, wherever they sit.
  const keyAccounts = new Set(s.accounts.filter((a) => a.kamId === user.id).map((a) => a.id));
  const accountSeen = (id: string) => keyAccounts.has(id) || s.accounts.some((a) => a.id === id && owners.has(a.ownerId));
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
    accounts: s.accounts.filter((a) => owners.has(a.ownerId) || keyAccounts.has(a.id)),
    calls: s.calls.filter((c) => owners.has(c.ownerId) || keyAccounts.has(c.accountId)),
    plans: s.plans.filter((p) => owners.has(p.ownerId)),
    leaves: s.leaves?.filter((l) => owners.has(l.userId)),
    tasks: s.tasks?.filter((t) => owners.has(t.ownerId)),
    samples: s.samples?.filter((x) => owners.has(x.repId)),
    events: s.events?.filter((e) => owners.has(e.ownerId)),
    accountChanges: s.accountChanges?.filter((x) => owners.has(x.byId) || s.accounts.some((a) => a.id === x.accountId && owners.has(a.ownerId))),
    sampleCounts: s.sampleCounts?.filter((x) => owners.has(x.repId)),
    sampleRequests: s.sampleRequests?.filter((x) => owners.has(x.repId)),
    // 2.11: sales of the people in view; stock of their places, and the warehouse for managers.
    invoices: s.invoices?.filter((x) => owners.has(x.ownerId) || keyAccounts.has(x.accountId)),
    // 2.13: orders and reported payments of the people in view; credit changes are Finance's.
    orders: s.orders?.filter((x) => owners.has(x.ownerId) || keyAccounts.has(x.accountId)),
    paymentClaims: s.paymentClaims?.filter((x) => owners.has(x.byId) || s.accounts.some((a) => a.id === x.accountId && owners.has(a.ownerId))),
    creditRequests: [],
    // 2.14 and 2.15: the people in view, their customers' returns and promises.
    returns: s.returns?.filter((x) => owners.has(x.byId) || accountSeen(x.accountId)),
    promises: s.promises?.filter((x) => owners.has(x.byId) || accountSeen(x.accountId)),
    targets: s.targets?.filter((x) => owners.has(x.userId)),
    secondarySales: s.secondarySales,
    campaigns: s.campaigns,
    content: s.content,
    safetyReports: s.safetyReports?.filter((x) => owners.has(x.byId)),
    expenses: s.expenses?.filter((x) => owners.has(x.userId)),
    stockMoves: s.stockMoves?.filter((x) => [x.from, x.to].some((p) => p !== undefined && (owners.has(p) || (p === WAREHOUSE && user.role !== 'Rep')))),
  };
}

/** People who take up a licence: active and not deleted (the same count the server checks). */
export function activeUserCount(users: User[]): number {
  return users.filter((u) => u.active && !u.deletedAt).length;
}
