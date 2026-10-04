import { manages, visibleOwnerIds } from './access';
import { teamOf, tierSchemeProblem } from './tiers';
import type { Account, Call, Company, Cycle, CyclePlan, Product, Role, Settings, Snapshot, TierDef, User } from './types';

/**
 * Every change to the data is one of these. The app applies it locally right away and appends it
 * to the user's journal in the company drive; every device replays all journals through the same
 * rules, so a change that breaks them is dropped everywhere.
 */
export type Mutation =
  | { type: 'account.upsert'; account: Account }
  | { type: 'account.pin'; id: string; lat: number; lng: number }
  | { type: 'call.save'; call: Call }
  | { type: 'call.delete'; id: string }
  | { type: 'plan.save'; plan: CyclePlan }
  | { type: 'plan.submit'; id: string }
  | { type: 'plan.review'; id: string; approve: boolean; note?: string }
  | { type: 'plan.reopen'; id: string }
  | { type: 'user.upsert'; user: User }
  | { type: 'product.upsert'; product: Product }
  | { type: 'cycle.upsert'; cycle: Cycle }
  | { type: 'settings.update'; settings: Partial<Pick<Settings, 'geofenceM' | 'requireCheckIn'>> }
  | { type: 'company.update'; company: Partial<Company> }
  /** Sets the tier names for one team (FLM id), or the company default when teamId is absent. `tiers: null` makes a team use the default again. `renames` maps old to new names on that team's accounts. */
  | { type: 'tiers.update'; teamId?: string; tiers: TierDef[] | null; renames?: Record<string, string> }
  | { type: 'import.accounts'; accounts: Account[] }
  | { type: 'import.users'; users: User[] }
  | { type: 'import.products'; products: Product[] };

export class RuleError extends Error {}

const fail = (msg: string): never => {
  throw new RuleError(msg);
};

const replaceOrAdd = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

const MANAGER_ROLE: Partial<Record<Role, Role>> = { Rep: 'FLM', FLM: 'SLM' };

/** Rules that apply to a call before it is saved with its status. Returns field -> message. */
export function callProblems(call: Pick<Call, 'status' | 'datetime' | 'products' | 'channel' | 'checkIn'>, settings: Settings, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  const when = new Date(call.datetime).getTime();
  if (Number.isNaN(when)) errors.when = 'Enter a valid date and time.';
  if (call.status === 'Submitted') {
    // Five minutes of tolerance for device clocks that run slightly fast.
    if (when > now.getTime() + 5 * 60 * 1000) errors.when = 'A future call cannot be submitted. Save it as planned.';
    if (call.products.length === 0) errors.products = 'Add at least one product discussed before submitting.';
    if (settings.requireCheckIn && call.channel === 'In person' && !call.checkIn) {
      errors.checkIn = 'Check in at the account before submitting an in-person call.';
    }
  }
  if (call.status === 'Planned' && when < now.getTime() - 24 * 3600 * 1000) errors.when = 'Planned calls should be today or later.';
  return errors;
}

function checkUser(s: Snapshot, u: User) {
  if (!u.name.trim()) fail('Name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) fail(`"${u.email}" is not a valid email.`);
  const clash = s.users.find((x) => x.email.toLowerCase() === u.email.toLowerCase() && x.id !== u.id);
  if (clash) fail(`${u.email} is already used by ${clash.name}.`);
  const want = MANAGER_ROLE[u.role];
  if (u.managerId) {
    const m = s.users.find((x) => x.id === u.managerId);
    if (!m) fail('Manager not found.');
    if (want && m!.role !== want) fail(`A ${u.role} reports to an ${want}, not an ${m!.role}.`);
  }
}

/** Applies one mutation as `actor`. Throws RuleError when it is not allowed. */
export function applyMutation(s: Snapshot, m: Mutation, actor: User, now = new Date()): Snapshot {
  const nowIso = now.toISOString();
  const isAdmin = actor.role === 'Admin';
  const visible = visibleOwnerIds(s.users, actor);
  const adminOnly = () => {
    if (!isAdmin) fail('Only an administrator can do this.');
  };

  switch (m.type) {
    case 'account.upsert': {
      const a = m.account;
      const existing = s.accounts.find((x) => x.id === a.id);
      if (existing && !visible.has(existing.ownerId)) fail('You cannot edit this account.');
      const owner = s.users.find((u) => u.id === a.ownerId);
      if (!owner) fail('The account owner was not found.');
      if (!isAdmin && a.ownerId !== actor.id && !manages(s.users, actor, a.ownerId)) fail('You can only add accounts to your own territory or team.');
      if (!a.name.trim() || !a.specialty.trim() || !a.city.trim()) fail('Name, specialty and city are required.');
      return { ...s, accounts: replaceOrAdd(s.accounts, { ...a, createdAt: existing?.createdAt ?? a.createdAt ?? nowIso }) };
    }

    case 'account.pin': {
      const a = s.accounts.find((x) => x.id === m.id) ?? fail('Account not found.');
      if (!visible.has(a.ownerId)) fail('You cannot edit this account.');
      if (Math.abs(m.lat) > 90 || Math.abs(m.lng) > 180) fail('Invalid coordinates.');
      return { ...s, accounts: s.accounts.map((x) => (x.id === a.id ? { ...x, lat: m.lat, lng: m.lng } : x)) };
    }

    case 'call.save': {
      const c = m.call;
      const existing = s.calls.find((x) => x.id === c.id);
      if (existing?.status === 'Submitted') fail('Submitted calls are locked and cannot be edited.');
      if (existing && existing.ownerId !== actor.id) fail('Only the rep who owns a call can change it.');
      if (c.ownerId !== actor.id) fail('You can only log your own calls.');
      const account = s.accounts.find((a) => a.id === c.accountId);
      if (!account || !visible.has(account.ownerId)) fail('Choose an account from your territory.');
      const problems = callProblems(c, s.settings, now);
      const first = Object.values(problems)[0];
      if (first) fail(first);
      const call: Call = {
        ...c,
        createdAt: existing?.createdAt ?? c.createdAt ?? nowIso,
        updatedAt: nowIso,
        submittedAt: c.status === 'Submitted' ? c.submittedAt ?? nowIso : undefined,
      };
      return { ...s, calls: replaceOrAdd(s.calls, call) };
    }

    case 'call.delete': {
      const c = s.calls.find((x) => x.id === m.id);
      if (!c) return s;
      if (c.status === 'Submitted') fail('Submitted calls cannot be deleted.');
      if (c.ownerId !== actor.id) fail('Only the rep who owns a call can delete it.');
      return { ...s, calls: s.calls.filter((x) => x.id !== m.id) };
    }

    case 'plan.save': {
      const p = m.plan;
      const existing = s.plans.find((x) => x.id === p.id);
      if (p.ownerId !== actor.id || (existing && existing.ownerId !== actor.id)) fail('You can only edit your own plan.');
      if (existing && (existing.status === 'Submitted' || existing.status === 'Approved')) fail('This plan is with your manager. Withdraw it to make changes.');
      if (!s.cycles.some((c) => c.id === p.cycleId)) fail('Cycle not found.');
      const dupe = s.plans.find((x) => x.ownerId === p.ownerId && x.cycleId === p.cycleId && x.id !== p.id);
      if (dupe) fail('You already have a plan for this cycle.');
      for (const t of p.targets) {
        const a = s.accounts.find((x) => x.id === t.accountId);
        if (!a || !visible.has(a.ownerId)) fail('A plan can only include accounts in your territory.');
        if (!Number.isInteger(t.planned) || t.planned < 1 || t.planned > 50) fail('Planned calls must be between 1 and 50.');
      }
      const plan: CyclePlan = {
        ...p,
        // Review history stays with the plan; only targets change here.
        submittedAt: existing?.submittedAt,
        reviewedAt: existing?.reviewedAt,
        reviewerId: existing?.reviewerId,
        reviewNote: existing?.reviewNote,
        status: existing?.status === 'Rejected' ? 'Rejected' : 'Draft',
        updatedAt: nowIso,
      };
      return { ...s, plans: replaceOrAdd(s.plans, plan) };
    }

    case 'plan.submit': {
      const p = s.plans.find((x) => x.id === m.id) ?? fail('Plan not found.');
      if (p.ownerId !== actor.id) fail('You can only submit your own plan.');
      if (p.status !== 'Draft' && p.status !== 'Rejected') fail('This plan is already submitted.');
      if (p.targets.length === 0) fail('Add at least one account to the plan.');
      const plan: CyclePlan = { ...p, status: 'Submitted', submittedAt: nowIso, updatedAt: nowIso };
      return { ...s, plans: replaceOrAdd(s.plans, plan) };
    }

    case 'plan.review': {
      const p = s.plans.find((x) => x.id === m.id) ?? fail('Plan not found.');
      if (p.ownerId === actor.id || !manages(s.users, actor, p.ownerId)) fail('Only the rep’s manager can review this plan.');
      if (p.status !== 'Submitted') fail('Only submitted plans can be reviewed.');
      if (!m.approve && !m.note?.trim()) fail('Say what needs to change when sending a plan back.');
      const plan: CyclePlan = {
        ...p,
        status: m.approve ? 'Approved' : 'Rejected',
        reviewerId: actor.id,
        reviewedAt: nowIso,
        reviewNote: m.note?.trim() || undefined,
        updatedAt: nowIso,
      };
      return { ...s, plans: replaceOrAdd(s.plans, plan) };
    }

    case 'plan.reopen': {
      const p = s.plans.find((x) => x.id === m.id) ?? fail('Plan not found.');
      if (p.ownerId !== actor.id) fail('You can only change your own plan.');
      if (p.status === 'Draft') return s;
      return { ...s, plans: replaceOrAdd(s.plans, { ...p, status: 'Draft', updatedAt: nowIso }) };
    }

    case 'user.upsert': {
      adminOnly();
      const u = { ...m.user, email: m.user.email.trim().toLowerCase(), name: m.user.name.trim() };
      if (u.id === actor.id && (!u.active || u.role !== 'Admin')) fail('You cannot remove your own admin access.');
      checkUser(s, u);
      const existing = s.users.find((x) => x.id === u.id);
      return { ...s, users: replaceOrAdd(s.users, { ...u, createdAt: existing?.createdAt ?? u.createdAt ?? nowIso }) };
    }

    case 'product.upsert': {
      adminOnly();
      if (!m.product.name.trim()) fail('Product name is required.');
      return { ...s, products: replaceOrAdd(s.products, m.product) };
    }

    case 'cycle.upsert': {
      adminOnly();
      // Cycles are now the calendar quarters, created automatically; older custom cycles are ignored.
      if (s.cycles.some((c) => /^q\d{4}-[1-4]$/.test(c.id))) return s;
      const c = m.cycle;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.start) || !/^\d{4}-\d{2}-\d{2}$/.test(c.end)) fail('Use YYYY-MM-DD dates.');
      if (c.end < c.start) fail('The cycle must end after it starts.');
      if (!c.name.trim()) fail('Cycle name is required.');
      return { ...s, cycles: replaceOrAdd(s.cycles, c) };
    }

    case 'settings.update': {
      adminOnly();
      const next = { ...s.settings, geofenceM: m.settings.geofenceM ?? s.settings.geofenceM, requireCheckIn: m.settings.requireCheckIn ?? s.settings.requireCheckIn };
      if (!(next.geofenceM >= 25 && next.geofenceM <= 5000)) fail('Geofence must be between 25 and 5000 metres.');
      return { ...s, settings: next };
    }

    case 'company.update': {
      adminOnly();
      const c = { ...s.company, ...m.company };
      if (!c.name?.trim()) fail('Company name is required.');
      for (const [k, v] of Object.entries(c)) {
        if (v !== undefined && typeof v !== 'string') fail(`Invalid ${k}.`);
        if (k !== 'logo' && typeof v === 'string' && v.length > 300) fail(`${k} is too long.`);
      }
      if (c.logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.logo) || c.logo.length > 400_000)) fail('The logo must be a PNG, JPEG or WebP image under 300 KB.');
      return { ...s, company: { ...c, name: c.name.trim() } };
    }

    case 'tiers.update': {
      adminOnly();
      const team = m.teamId ? s.users.find((u) => u.id === m.teamId && u.role === 'FLM') ?? fail('Team not found.') : undefined;
      if (!team && !m.tiers) fail('The company needs a default tier scheme.');
      const tiers = m.tiers?.map((t) => ({ name: t.name.trim(), frequency: t.frequency }));
      const problem = tiers && tierSchemeProblem(tiers);
      if (problem) fail(problem);
      const teamTiers = { ...s.settings.teamTiers };
      if (team) {
        if (tiers) teamTiers[team.id] = tiers;
        else delete teamTiers[team.id];
      }
      const settings = { ...s.settings, tiers: team ? s.settings.tiers : tiers!, teamTiers };
      // Accounts affected: the team's own, or those of every team on the default scheme.
      const inScope = (ownerId: string) => {
        const t = teamOf(s.users, ownerId);
        return team ? t === team.id : !t || !s.settings.teamTiers[t];
      };
      const renames = m.renames ?? {};
      const accounts = Object.keys(renames).length
        ? s.accounts.map((a) => (renames[a.tier] && inScope(a.ownerId) ? { ...a, tier: renames[a.tier].trim() } : a))
        : s.accounts;
      return { ...s, settings, accounts };
    }

    case 'import.accounts': {
      adminOnly();
      let accounts = s.accounts;
      for (const a of m.accounts) {
        if (!s.users.some((u) => u.id === a.ownerId)) fail(`Owner not found for ${a.name}.`);
        const existing = accounts.find((x) => x.id === a.id);
        accounts = replaceOrAdd(accounts, { ...existing, ...a, createdAt: existing?.createdAt ?? nowIso });
      }
      return { ...s, accounts };
    }

    case 'import.users': {
      adminOnly();
      let next = s;
      for (const u of m.users) {
        const existing = next.users.find((x) => x.id === u.id);
        const user = { ...u, createdAt: existing?.createdAt ?? nowIso };
        checkUser({ ...next, users: replaceOrAdd(next.users, user) }, user);
        next = { ...next, users: replaceOrAdd(next.users, user) };
      }
      return next;
    }

    case 'import.products': {
      adminOnly();
      let products = s.products;
      for (const p of m.products) products = replaceOrAdd(products, p);
      return { ...s, products };
    }
  }
}

/** Short human description, used for the audit log. */
export function describeMutation(m: Mutation): string {
  switch (m.type) {
    case 'call.save':
      return `${m.call.status} call ${m.call.id}`;
    case 'import.accounts':
      return `Imported ${m.accounts.length} accounts`;
    case 'import.users':
      return `Imported ${m.users.length} users`;
    case 'import.products':
      return `Imported ${m.products.length} products`;
    case 'user.upsert':
      return `Saved user ${m.user.email}`;
    case 'tiers.update':
      return m.teamId ? 'Changed a team’s tier names' : 'Changed the default tier names';
    default:
      return m.type;
  }
}
