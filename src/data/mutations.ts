import { isAdmin as hasAdminRights, manages, visibleOwnerIds } from './access';
import { spanDays } from './metrics';
import { MAX_REPORTS, reportProblem } from './reports';
import { teamOf, tierSchemeProblem } from './tiers';
import { ACCOUNT_CHANGE_FIELDS, ATTENDEE_STATUSES, COACHING_SKILLS, EVENT_KINDS, EVENT_STATUSES, LEAVE_KINDS, POTENTIALS, REACTIONS, type Account, type AccountChange, type AccountChanges, type Call, type Coaching, type Company, type Cycle, type CyclePlan, type Leave, type MeetingEvent, type Product, type ReportDef, type Role, type SampleCount, type SampleIssue, type Settings, type Signature, type Snapshot, type Task, type TierDef, type User } from './types';

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
  /** Deletes people. Their accounts and direct reports move to `transferTo` (someone with the same role). */
  | { type: 'user.delete'; users: { id: string; transferTo?: string }[] }
  /** Sets or removes (`photo` absent) a profile picture: the person themselves or an administrator. */
  | { type: 'user.photo'; id: string; photo?: string }
  /** The person deletes their own account (2.4): they become inactive and their photo goes. Older versions skip it. */
  | { type: 'user.leave' }
  | { type: 'account.delete'; ids: string[] }
  | { type: 'product.upsert'; product: Product }
  | { type: 'product.delete'; ids: string[] }
  | { type: 'cycle.upsert'; cycle: Cycle }
  /** `cycleLength` (2.3) switches planning between calendar quarters and months; existing plans keep their cycle. */
  | { type: 'settings.update'; settings: Partial<Pick<Settings, SettingsKey>> }
  | { type: 'company.update'; company: Partial<Company> }
  /** Sets the tier names for one team (FLM id), or the company default when teamId is absent. `tiers: null` makes a team use the default again. `renames` maps old to new names on that team's accounts. */
  | { type: 'tiers.update'; teamId?: string; tiers: TierDef[] | null; renames?: Record<string, string> }
  | { type: 'import.accounts'; accounts: Account[] }
  | { type: 'import.users'; users: User[] }
  | { type: 'import.products'; products: Product[] }
  // ----- reports (2.3): definitions shared with the company in settings.reports -----
  | { type: 'report.save'; report: ReportDef }
  | { type: 'report.delete'; id: string }
  // ----- 2.5: leave, tasks, samples, coaching. Older versions skip these. -----
  | { type: 'leave.request'; leave: Leave }
  | { type: 'leave.review'; id: string; approve: boolean; note?: string }
  | { type: 'leave.cancel'; id: string }
  | { type: 'task.save'; task: Task }
  | { type: 'task.done'; id: string; done: boolean }
  | { type: 'task.delete'; id: string }
  | { type: 'sample.issue'; issue: SampleIssue }
  | { type: 'call.coach'; id: string; coaching: Coaching }
  // ----- 2.7. Older versions skip these. -----
  /** A rep asks to correct an account's details; a manager or administrator reviews it. */
  | { type: 'account.change'; change: AccountChange }
  | { type: 'account.review'; id: string; approve: boolean; note?: string }
  /** Confirms (or turns down, which deletes) accounts a rep added while new accounts need review. */
  | { type: 'account.verify'; ids: string[]; approve: boolean; note?: string }
  /** Merges duplicates into `keepId`: their calls, plans, tasks and events move over and they are deleted. */
  | { type: 'account.merge'; keepId: string; ids: string[] }
  | { type: 'event.save'; event: MeetingEvent }
  | { type: 'event.delete'; id: string }
  | { type: 'sample.count'; count: SampleCount };

export const SETTINGS_KEYS = ['geofenceM', 'requireCheckIn', 'aiEnabled', 'cycleLength', 'objectives', 'reviewNewAccounts', 'sampleSignature'] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export class RuleError extends Error {}

const fail = (msg: string): never => {
  throw new RuleError(msg);
};

const replaceOrAdd = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

const MANAGER_ROLE: Partial<Record<Role, Role>> = { Rep: 'FLM', FLM: 'SLM' };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_LEAVE_DAYS = 90;
export const MAX_SAMPLE_QTY = 10000;


/** The first manager up the line who is still active: who approves a person's leave. */
export function approverOf(users: User[], userId: string): User | undefined {
  let cur = users.find((u) => u.id === userId);
  for (let i = 0; cur?.managerId && i < 5; i++) {
    const m = users.find((u) => u.id === cur!.managerId && !u.deletedAt);
    if (m?.active) return m;
    cur = m;
  }
  return undefined;
}

/** Managers above a rep, nearest first: who can join a call as coach. */
export function managersOf(users: User[], userId: string): User[] {
  const out: User[] = [];
  let cur = users.find((u) => u.id === userId);
  for (let i = 0; cur?.managerId && i < 5; i++) {
    const m = users.find((u) => u.id === cur!.managerId && !u.deletedAt);
    if (!m) break;
    if (m.active) out.push(m);
    cur = m;
  }
  return out;
}

/** Rules that apply to a call before it is saved with its status. Returns field -> message. */
export function callProblems(call: Pick<Call, 'status' | 'datetime' | 'products' | 'channel' | 'checkIn' | 'samples' | 'signature'>, settings: Settings, now = new Date()): Record<string, string> {
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
    if (settings.sampleSignature === 'required' && call.samples?.some((x) => x.qty > 0) && !call.signature) {
      errors.signature = 'Ask the doctor to sign for the samples before submitting.';
    }
  }
  if (call.status === 'Planned' && when < now.getTime() - 24 * 3600 * 1000) errors.when = 'Planned calls should be today or later.';
  return errors;
}

const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_PHOTO_CHARS = 150_000;

/** Tidies a user from a form or CSV: trims text, and the admin flag only applies to a Rep, FLM or SLM. */
/** Fields a change leaves out keep the person's current values (see sanitize.ts). */
function keepMissing(u: User, existing?: User): User {
  return {
    ...u,
    admin: u.admin === undefined ? existing?.admin : u.admin,
    employeeId: u.employeeId === undefined ? existing?.employeeId : u.employeeId,
    territoryId: u.territoryId === undefined ? existing?.territoryId : u.territoryId,
  };
}

function normalUser(u: User): User {
  const trim = (v?: string) => v?.trim() || undefined;
  return {
    ...u,
    name: u.name.trim(),
    email: u.email.trim().toLowerCase(),
    admin: u.role !== 'Admin' && u.admin ? true : undefined,
    employeeId: trim(u.employeeId),
    territory: trim(u.territory),
    territoryId: trim(u.territoryId),
  };
}

function checkUser(s: Snapshot, u: User) {
  if (!u.name.trim()) fail('Name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) fail(`"${u.email}" is not a valid email.`);
  const live = s.users.filter((x) => !x.deletedAt && x.id !== u.id);
  const clash = live.find((x) => x.email.toLowerCase() === u.email.toLowerCase());
  if (clash) fail(`${u.email} is already used by ${clash.name}.`);
  const idClash = u.employeeId && live.find((x) => x.employeeId?.toLowerCase() === u.employeeId!.toLowerCase());
  if (idClash) fail(`User ID ${u.employeeId} is already used by ${idClash.name}.`);
  if ((u.employeeId?.length ?? 0) > 60 || (u.territoryId?.length ?? 0) > 60) fail('User ID and territory ID must be 60 characters or fewer.');
  const want = MANAGER_ROLE[u.role];
  if (u.managerId) {
    const m = s.users.find((x) => x.id === u.managerId && !x.deletedAt);
    if (!m) fail('Manager not found.');
    if (want && m!.role !== want) fail(`A ${u.role} reports to an ${want}, not an ${m!.role}.`);
  }
}

/** Profile fields a change leaves out (older versions, CSV without the columns) keep their values; empty clears. */
function withProfile(a: Account, existing?: Account): Account {
  const out: Account = { ...a };
  const keep = <K extends 'kol' | 'potential' | 'segment'>(k: K) => {
    if (a[k] === undefined) {
      if (existing?.[k] !== undefined) out[k] = existing[k];
      else delete out[k];
    } else if (a[k] === '' || a[k] === false) delete out[k];
  };
  keep('kol');
  keep('potential');
  keep('segment');
  if (out.potential && !POTENTIALS.includes(out.potential)) fail('Potential must be High, Medium or Low.');
  if (out.segment !== undefined) {
    out.segment = out.segment.trim() || undefined;
    if (!out.segment) delete out.segment;
    else if (out.segment.length > 40) fail('Segment must be 40 characters or fewer.');
  }
  return out;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function checkSamples(c: Call, s: Snapshot) {
  for (const x of c.samples ?? []) {
    if (!Number.isInteger(x.qty) || x.qty < 1 || x.qty > 1000) fail('Samples given must be a whole number from 1 to 1000.');
    if (!s.products.some((p) => p.name === x.product)) fail(`${x.product} is not a product.`);
    if (x.expiry && !MONTH_RE.test(x.expiry)) fail('Use YYYY-MM for the expiry month.');
    // A batch is usable until the end of its expiry month.
    if (x.expiry && c.status !== 'Planned' && x.expiry < c.datetime.slice(0, 7)) fail(`The ${x.product} batch${x.batch ? ` ${x.batch}` : ''} expired in ${x.expiry} and cannot be given out.`);
  }
}

export const MAX_OBJECTIVES = 5;
export const MAX_SIGNATURE_POINTS = 4000;

/** Checks the 2.7 parts of a call: objectives, slides shown, reaction and signature. */
function checkCallExtras(c: Call, s: Snapshot) {
  if ((c.objectives?.length ?? 0) > MAX_OBJECTIVES) fail(`A call can have up to ${MAX_OBJECTIVES} objectives.`);
  for (const o of c.objectives ?? []) if (!o.text.trim() || o.text.length > 200) fail('Write each objective in 1 to 200 characters.');
  if (c.status === 'Planned' && c.objectives?.some((o) => o.achieved !== undefined)) fail('Mark objectives when you record the call.');
  for (const v of c.detailing ?? []) {
    if (!Number.isInteger(v.slide) || v.slide < 1 || v.slide > 200) fail('Invalid slide number.');
    if (!Number.isInteger(v.seconds) || v.seconds < 0 || v.seconds > 3 * 3600) fail('Invalid slide time.');
    if (!s.products.some((p) => p.name === v.product)) fail(`${v.product} is not a product.`);
  }
  if (c.reaction && !REACTIONS.includes(c.reaction)) fail('Invalid reaction.');
  if (c.signature) checkSignature(c.signature);
}

export function checkSignature(sig: Signature) {
  if (!sig.name.trim() || sig.name.length > 120) fail('Write the name of the person signing.');
  const points = sig.strokes.reduce((n, x) => n + x.length / 2, 0);
  if (!sig.strokes.length || points < 2) fail('The signature is empty.');
  if (sig.strokes.length > 60 || points > MAX_SIGNATURE_POINTS) fail('The signature is too detailed. Clear it and sign again.');
  for (const st of sig.strokes) if (st.length % 2 || st.some((v) => !Number.isInteger(v) || v < 0 || v > 1000)) fail('Invalid signature.');
}

/** Removes accounts as account.delete does: they stay hidden for history; open calls and plan targets go. */
function deleteAccounts(s: Snapshot, ids: Set<string>, nowIso: string, mergedInto?: string): Snapshot {
  return {
    ...s,
    accounts: s.accounts.map((a) => (ids.has(a.id) ? { ...a, deletedAt: nowIso, pendingReview: undefined, ...(mergedInto ? { mergedInto } : {}) } : a)),
    calls: s.calls.filter((c) => !ids.has(c.accountId) || c.status === 'Submitted'),
    plans: s.plans.map((p) => (p.targets.some((t) => ids.has(t.accountId)) ? { ...p, targets: p.targets.filter((t) => !ids.has(t.accountId)), updatedAt: nowIso } : p)),
    accountChanges: (s.accountChanges ?? []).map((x) => (ids.has(x.accountId) && x.status === 'Pending' ? { ...x, status: 'Rejected' as const, reviewedAt: nowIso, reviewNote: mergedInto ? 'Merged into another account' : 'Account deleted' } : x)),
  };
}

/** Workplaces must be organizations (HCO accounts) that exist; up to 10, main one first. */
function cleanWorkplaces(list: string[] | undefined, s: Snapshot, selfId: string): string[] | undefined {
  if (!list) return undefined;
  const out = [...new Set(list)].filter((id) => id !== selfId);
  if (out.length > 10) fail('An account can list up to 10 workplaces.');
  for (const id of out) {
    const org = s.accounts.find((a) => a.id === id);
    if (!org) fail('Workplace not found.');
    if (org!.type !== 'HCO') fail(`${org!.name} is not an organization.`);
  }
  // Workplaces deleted since keep their id out of the list.
  return out.filter((id) => !s.accounts.find((a) => a.id === id)?.deletedAt);
}

const sameValue = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);

/** Applies proposed detail changes to an account, checking them as account.upsert would. */
function withChanges(a: Account, changes: AccountChanges, s: Snapshot): Account {
  const next: Account = { ...a };
  for (const k of ACCOUNT_CHANGE_FIELDS) {
    if (!(k in changes)) continue;
    const v = changes[k];
    if (k === 'workplaces') next.workplaces = cleanWorkplaces(v as string[] | undefined, s, a.id);
    else if (k === 'type') next.type = v as Account['type'];
    else (next as unknown as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() || undefined : v;
  }
  if (!next.name?.trim() || !next.specialty?.trim() || !next.city?.trim()) fail('Name, specialty and city are required.');
  next.address = next.address ?? '';
  if (next.type === 'HCO') {
    delete next.workplaces;
    delete next.affiliation;
  }
  return next;
}

const DECK_FILE_RE = /^ava-deck-[A-Za-z0-9_-]{1,80}\.json$/;
export const MAX_DECK_SLIDES = 40;

function checkDeck(d: NonNullable<Product['deck']>) {
  if (!DECK_FILE_RE.test(d.file) || !/^[0-9a-f]{64}$/.test(d.hash)) fail('Invalid presentation.');
  if (!Number.isInteger(d.slides) || d.slides < 1 || d.slides > MAX_DECK_SLIDES) fail(`A presentation can have 1 to ${MAX_DECK_SLIDES} slides.`);
}

/** Applies one mutation as `actor`. Throws RuleError when it is not allowed. */
export function applyMutation(s: Snapshot, m: Mutation, actor: User, now = new Date()): Snapshot {
  const nowIso = now.toISOString();
  const isAdmin = hasAdminRights(actor);
  const visible = visibleOwnerIds(s.users, actor);
  const adminOnly = () => {
    if (!isAdmin) fail('Only an administrator can do this.');
  };

  switch (m.type) {
    case 'account.upsert': {
      const a = m.account;
      const existing = s.accounts.find((x) => x.id === a.id);
      if (existing?.deletedAt) fail('This account was deleted.');
      if (existing && !visible.has(existing.ownerId)) fail('You cannot edit this account.');
      const owner = s.users.find((u) => u.id === a.ownerId && !u.deletedAt);
      if (!owner) fail('The account owner was not found.');
      if (!isAdmin && a.ownerId !== actor.id && !manages(s.users, actor, a.ownerId)) fail('You can only add accounts to your own territory or team.');
      if (!a.name.trim() || !a.specialty.trim() || !a.city.trim()) fail('Name, specialty and city are required.');
      // 2.7: a rep changes an existing account's details by asking (account.change); here only the
      // profile (KOL, potential, segment) and notes can change.
      const repEdit = existing && actor.role === 'Rep' && !isAdmin;
      const base: Account = repEdit ? { ...existing, kol: a.kol, potential: a.potential, segment: a.segment, notes: a.notes } : a;
      const account = withProfile(base, existing);
      if (repEdit) account.workplaces = existing.workplaces;
      else if (a.workplaces === undefined) {
        if (existing?.workplaces) account.workplaces = existing.workplaces;
      } else account.workplaces = a.type === 'HCP' ? cleanWorkplaces(a.workplaces, s, a.id) : undefined;
      if (!account.workplaces?.length) delete account.workplaces;
      // New accounts from reps wait for review when the company asks for it.
      const pending = existing ? existing.pendingReview : s.settings.reviewNewAccounts && actor.role === 'Rep' && !isAdmin ? true : undefined;
      if (pending) account.pendingReview = true;
      else delete account.pendingReview;
      delete account.mergedInto;
      return { ...s, accounts: replaceOrAdd(s.accounts, { ...account, createdAt: existing?.createdAt ?? a.createdAt ?? nowIso }) };
    }

    case 'account.pin': {
      const a = s.accounts.find((x) => x.id === m.id && !x.deletedAt) ?? fail('Account not found.');
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
      const account = s.accounts.find((a) => a.id === c.accountId && !a.deletedAt);
      if (!account || !visible.has(account.ownerId)) fail('Choose an account from your territory.');
      const problems = callProblems(c, s.settings, now);
      const first = Object.values(problems)[0];
      if (first) fail(first);
      checkSamples(c, s);
      checkCallExtras(c, s);
      if (c.coachId && !managersOf(s.users, c.ownerId).some((m) => m.id === c.coachId)) fail('The coach must be one of your managers.');
      const call: Call = {
        ...c,
        // The scorecard is the manager's, set with call.coach; the rep's save keeps it.
        coaching: existing?.coaching,
        // A signature only means something with samples handed over.
        signature: c.samples?.length ? c.signature : undefined,
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
      // Accounts deleted since the plan was made (e.g. on an older app) drop out, as account.delete does.
      const targets = p.targets.filter((t) => !s.accounts.some((x) => x.id === t.accountId && x.deletedAt));
      for (const t of targets) {
        const a = s.accounts.find((x) => x.id === t.accountId && !x.deletedAt);
        if (!a || !visible.has(a.ownerId)) fail('A plan can only include accounts in your territory.');
        if (!Number.isInteger(t.planned) || t.planned < 1 || t.planned > 50) fail('Planned calls must be between 1 and 50.');
      }
      const plan: CyclePlan = {
        ...p,
        targets,
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
      const existing = s.users.find((x) => x.id === m.user.id);
      if (existing?.deletedAt) fail('This person was deleted.');
      // The photo is changed with user.photo only, so editing someone keeps their picture.
      const u = { ...normalUser(keepMissing(m.user, existing)), photo: existing?.photo, deletedAt: undefined };
      // Reactivating someone who deleted their own account clears the mark.
      const leftAt = u.active ? undefined : existing?.leftAt;
      if (u.id === actor.id && (!u.active || !hasAdminRights(u))) fail('You cannot remove your own admin access.');
      checkUser(s, u);
      return { ...s, users: replaceOrAdd(s.users, { ...u, leftAt, createdAt: existing?.createdAt ?? u.createdAt ?? nowIso }) };
    }

    case 'user.leave': {
      const u = s.users.find((x) => x.id === actor.id && !x.deletedAt) ?? fail('Person not found.');
      // 2.6: only administrators delete their own account; others ask an administrator.
      adminOnly();
      // Their accounts, plans and calls stay for an administrator to reassign; their sign-in and photo go.
      return { ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, active: false, admin: undefined, photo: undefined, leftAt: nowIso } : x)) };
    }

    case 'user.delete': {
      adminOnly();
      let next = s;
      for (const { id, transferTo } of m.users) {
        const u = next.users.find((x) => x.id === id && !x.deletedAt);
        if (!u) continue; // already deleted, e.g. by another administrator
        if (u.id === actor.id) fail('You cannot delete yourself.');
        const owned = next.accounts.filter((a) => a.ownerId === u.id && !a.deletedAt);
        let to: User | undefined;
        if (transferTo) {
          to = next.users.find((x) => x.id === transferTo && !x.deletedAt && x.active) ?? fail('The person taking over was not found or is inactive.');
          if (to.id === u.id) fail('Choose someone else to take over.');
          if (to.role !== u.role) fail(`${u.name}'s accounts and team can only move to another ${u.role}; ${to.name} is a ${to.role}.`);
        }
        if (owned.length && !to) fail(`${u.name} has ${owned.length} account${owned.length > 1 ? 's' : ''}. Choose who takes ${owned.length > 1 ? 'them' : 'it'} over.`);
        const teamTiers = { ...next.settings.teamTiers };
        delete teamTiers[u.id];
        next = {
          ...next,
          // The person stays in the data, hidden, so their submitted calls keep a name.
          users: next.users.map((x) => (x.id === u.id ? { ...x, active: false, admin: undefined, deletedAt: nowIso } : x.managerId === u.id && !x.deletedAt ? { ...x, managerId: to?.id } : x)),
          accounts: next.accounts.map((a) => (a.ownerId === u.id && !a.deletedAt ? { ...a, ownerId: to!.id } : a)),
          // Their planned calls and drafts go; submitted calls are company records and stay.
          calls: next.calls.filter((c) => c.ownerId !== u.id || c.status === 'Submitted'),
          plans: next.plans.filter((p) => p.ownerId !== u.id),
          settings: { ...next.settings, teamTiers },
        };
      }
      return next;
    }

    case 'user.photo': {
      const u = s.users.find((x) => x.id === m.id && !x.deletedAt) ?? fail('Person not found.');
      if (u.id !== actor.id && !isAdmin) fail('You can only change your own photo.');
      if (m.photo && (!PHOTO_RE.test(m.photo) || m.photo.length > MAX_PHOTO_CHARS)) fail('The photo must be a JPEG or PNG image of about 100 KB or less.');
      return { ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, photo: m.photo || undefined } : x)) };
    }

    case 'account.delete': {
      adminOnly();
      const ids = new Set(m.ids.filter((id) => s.accounts.some((a) => a.id === id && !a.deletedAt)));
      if (!ids.size) return s;
      // Deleted accounts stay in the data, hidden, so submitted calls keep the account's name.
      return deleteAccounts(s, ids, nowIso);
    }

    case 'product.delete': {
      adminOnly();
      // Calls name their products, so past calls are unaffected.
      const ids = new Set(m.ids);
      return { ...s, products: s.products.filter((p) => !ids.has(p.id)) };
    }

    case 'product.upsert': {
      adminOnly();
      if (!m.product.name.trim()) fail('Product name is required.');
      if (m.product.brochureUrl && !/^https:\/\/\S+$/.test(m.product.brochureUrl)) fail('The brochure link must start with https://');
      if (m.product.deck) checkDeck(m.product.deck);
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
      const next: Settings = {
        ...s.settings,
        geofenceM: m.settings.geofenceM ?? s.settings.geofenceM,
        requireCheckIn: m.settings.requireCheckIn ?? s.settings.requireCheckIn,
        aiEnabled: m.settings.aiEnabled ?? s.settings.aiEnabled,
        cycleLength: m.settings.cycleLength ?? s.settings.cycleLength ?? 'quarter',
      };
      if (m.settings.objectives !== undefined) {
        const list = [...new Set(m.settings.objectives.map((o) => o.trim()).filter(Boolean))];
        if (list.length > 20 || list.some((o) => o.length > 200)) fail('Keep up to 20 objectives of 200 characters or fewer.');
        next.objectives = list;
      }
      if (m.settings.reviewNewAccounts !== undefined) next.reviewNewAccounts = m.settings.reviewNewAccounts || undefined;
      if (m.settings.sampleSignature !== undefined) {
        if (!['optional', 'required', 'off'].includes(m.settings.sampleSignature)) fail('Invalid signature setting.');
        next.sampleSignature = m.settings.sampleSignature === 'optional' ? undefined : m.settings.sampleSignature;
      }
      if (next.cycleLength !== 'quarter' && next.cycleLength !== 'month') fail('Choose quarterly or monthly cycles.');
      if (!(next.geofenceM >= 25 && next.geofenceM <= 5000)) fail('Geofence must be between 25 and 5000 metres.');
      if (m.settings.aiEnabled !== undefined) next.aiEnabled = m.settings.aiEnabled;
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
      const team = m.teamId ? s.users.find((u) => u.id === m.teamId && u.role === 'FLM' && !u.deletedAt) ?? fail('Team not found.') : undefined;
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
        const owner = s.users.find((u) => u.id === a.ownerId) ?? fail(`Owner not found for ${a.name}.`);
        if (owner.deletedAt) continue; // their rep was deleted since the file was prepared
        const existing = accounts.find((x) => x.id === a.id);
        if (existing?.deletedAt) continue; // deleted since the file was prepared; the rest still import
        accounts = replaceOrAdd(accounts, { ...existing, ...withProfile(a, existing), createdAt: existing?.createdAt ?? nowIso });
      }
      return { ...s, accounts };
    }

    case 'import.users': {
      adminOnly();
      let next = s;
      for (const raw of m.users) {
        const existing = next.users.find((x) => x.id === raw.id);
        // Skip people deleted since the file was prepared (e.g. on an older app); the rest still import.
        if (existing?.deletedAt) continue;
        const u = normalUser(keepMissing(raw, existing));
        if (u.id === actor.id && (!u.active || !hasAdminRights(u))) fail('You cannot remove your own admin access.');
        const user = { ...u, photo: existing?.photo, deletedAt: undefined, createdAt: existing?.createdAt ?? nowIso };
        checkUser({ ...next, users: replaceOrAdd(next.users, user) }, user);
        next = { ...next, users: replaceOrAdd(next.users, user) };
      }
      return next;
    }

    case 'import.products': {
      adminOnly();
      let products = s.products;
      for (const p of m.products) {
        if (p.brochureUrl && !/^https:\/\/\S+$/.test(p.brochureUrl)) fail(`The brochure link for ${p.name} must start with https://`);
        // CSV files carry no slides: a product keeps its presentation.
        const deck = products.find((x) => x.id === p.id)?.deck;
        products = replaceOrAdd(products, deck ? { ...p, deck } : p);
      }
      return { ...s, products };
    }

    // ----- leave (2.5) -----
    case 'leave.request': {
      const l = m.leave;
      if (l.userId !== actor.id) fail('You can only ask for your own leave.');
      const existing = (s.leaves ?? []).find((x) => x.id === l.id);
      if (existing && (existing.userId !== actor.id || existing.status !== 'Pending')) fail('Only a pending request can be changed.');
      if (!DAY_RE.test(l.start) || !DAY_RE.test(l.end)) fail('Use YYYY-MM-DD dates.');
      if (l.end < l.start) fail('Leave must end on or after the day it starts.');
      if (spanDays(l.start, l.end) > MAX_LEAVE_DAYS) fail(`Leave can be at most ${MAX_LEAVE_DAYS} days at a time.`);
      if (!LEAVE_KINDS.includes(l.kind)) fail('Choose the kind of leave.');
      const clash = (s.leaves ?? []).find((x) => x.userId === actor.id && x.id !== l.id && (x.status === 'Pending' || x.status === 'Approved') && x.start <= l.end && l.start <= x.end);
      if (clash) fail(`You already have leave from ${clash.start} to ${clash.end}.`);
      const leave: Leave = { id: l.id, userId: actor.id, start: l.start, end: l.end, kind: l.kind, note: l.note?.trim() || undefined, status: 'Pending', createdAt: existing?.createdAt ?? nowIso };
      return { ...s, leaves: replaceOrAdd(s.leaves ?? [], leave) };
    }

    case 'leave.review': {
      const l = (s.leaves ?? []).find((x) => x.id === m.id) ?? fail('Leave request not found.');
      if (l.userId === actor.id || !manages(s.users, actor, l.userId)) fail('Only the person’s manager can review their leave.');
      if (l.status !== 'Pending') fail('This request was already decided.');
      if (!m.approve && !m.note?.trim()) fail('Say why when declining leave.');
      const leave: Leave = { ...l, status: m.approve ? 'Approved' : 'Rejected', reviewerId: actor.id, reviewedAt: nowIso, reviewNote: m.note?.trim() || undefined };
      return { ...s, leaves: replaceOrAdd(s.leaves ?? [], leave) };
    }

    case 'leave.cancel': {
      const l = (s.leaves ?? []).find((x) => x.id === m.id) ?? fail('Leave request not found.');
      if (l.userId !== actor.id) fail('You can only cancel your own leave.');
      if (l.status !== 'Pending' && l.status !== 'Approved') return s;
      return { ...s, leaves: replaceOrAdd(s.leaves ?? [], { ...l, status: 'Cancelled' }) };
    }

    // ----- tasks (2.5) -----
    case 'task.save': {
      const t = m.task;
      const existing = (s.tasks ?? []).find((x) => x.id === t.id);
      const mayEdit = (owner: string, by?: string) => owner === actor.id || by === actor.id || (owner !== actor.id && manages(s.users, actor, owner));
      if (existing && !mayEdit(existing.ownerId, existing.assignedBy)) fail('You cannot change this task.');
      if (t.ownerId !== actor.id && !manages(s.users, actor, t.ownerId)) fail('You can only set tasks for yourself or your team.');
      if (!s.users.some((u) => u.id === t.ownerId && !u.deletedAt)) fail('Person not found.');
      const title = t.title.trim();
      if (!title || title.length > 200) fail('Write the task in 1 to 200 characters.');
      if (!DAY_RE.test(t.due)) fail('Use YYYY-MM-DD for the due date.');
      if (t.remindAt && !TIME_RE.test(t.remindAt)) fail('Use HH:MM for the reminder time.');
      if (t.accountId && !s.accounts.some((a) => a.id === t.accountId)) fail('Account not found.');
      const task: Task = {
        id: t.id, ownerId: t.ownerId, title, due: t.due, remindAt: t.remindAt || undefined, accountId: t.accountId, callId: t.callId,
        assignedBy: existing?.assignedBy ?? (t.ownerId !== actor.id ? actor.id : undefined), doneAt: existing?.doneAt, createdAt: existing?.createdAt ?? nowIso,
      };
      return { ...s, tasks: replaceOrAdd(s.tasks ?? [], task) };
    }

    case 'task.done':
    case 'task.delete': {
      const t = (s.tasks ?? []).find((x) => x.id === m.id);
      if (!t) return s;
      if (t.ownerId !== actor.id && t.assignedBy !== actor.id && !manages(s.users, actor, t.ownerId)) fail('You cannot change this task.');
      if (m.type === 'task.delete') return { ...s, tasks: (s.tasks ?? []).filter((x) => x.id !== t.id) };
      return { ...s, tasks: replaceOrAdd(s.tasks ?? [], { ...t, doneAt: m.done ? (t.doneAt ?? nowIso) : undefined }) };
    }

    // ----- samples (2.5) -----
    case 'sample.issue': {
      const x = m.issue;
      const rep = s.users.find((u) => u.id === x.repId && !u.deletedAt) ?? fail('Person not found.');
      if (rep.id === actor.id && !isAdmin) fail('Your manager records the samples you receive.');
      if (!manages(s.users, actor, rep.id)) fail('You can only issue samples to your own team.');
      if (!s.products.some((p) => p.name === x.product)) fail(`${x.product} is not a product.`);
      if (!Number.isInteger(x.qty) || x.qty === 0 || Math.abs(x.qty) > MAX_SAMPLE_QTY) fail(`Quantity must be a whole number up to ${MAX_SAMPLE_QTY}, not zero.`);
      if ((s.samples ?? []).some((y) => y.id === x.id)) return s;
      if (x.expiry && !MONTH_RE.test(x.expiry)) fail('Use YYYY-MM for the expiry month.');
      const issue: SampleIssue = { id: x.id, repId: rep.id, product: x.product, qty: x.qty, batch: x.batch?.trim() || undefined, expiry: x.expiry || undefined, note: x.note?.trim() || undefined, byId: actor.id, at: nowIso };
      return { ...s, samples: [...(s.samples ?? []), issue] };
    }

    // ----- coaching (2.5) -----
    case 'call.coach': {
      const c = s.calls.find((x) => x.id === m.id) ?? fail('Call not found.');
      if (c.ownerId === actor.id || (c.coachId !== actor.id && !manages(s.users, actor, c.ownerId))) fail('Only the rep’s manager can coach this call.');
      const scores: Coaching['scores'] = {};
      for (const k of COACHING_SKILLS) {
        const v = m.coaching.scores[k];
        if (v === undefined) continue;
        if (!Number.isInteger(v) || v < 1 || v > 5) fail('Scores go from 1 to 5.');
        scores[k] = v;
      }
      if (!Object.keys(scores).length) fail('Score at least one skill.');
      const coaching: Coaching = { by: actor.id, at: nowIso, scores, strengths: m.coaching.strengths?.trim() || undefined, improve: m.coaching.improve?.trim() || undefined };
      return { ...s, calls: s.calls.map((x) => (x.id === c.id ? { ...x, coachId: x.coachId ?? actor.id, coaching } : x)) };
    }


    // ----- account data quality (2.7) -----
    case 'account.change': {
      const x = m.change;
      const a = s.accounts.find((y) => y.id === x.accountId && !y.deletedAt) ?? fail('Account not found.');
      if (!visible.has(a.ownerId)) fail('You cannot change this account.');
      const existing = (s.accountChanges ?? []).find((y) => y.id === x.id);
      if (existing && (existing.byId !== actor.id || existing.status !== 'Pending')) fail('Only a pending request can be changed.');
      const changes: AccountChanges = {};
      for (const k of ACCOUNT_CHANGE_FIELDS) if (k in x.changes && !sameValue(x.changes[k], a[k])) (changes as Record<string, unknown>)[k] = x.changes[k];
      if (!Object.keys(changes).length) fail('Nothing has changed.');
      withChanges(a, changes, s); // checks the result now, so a bad request fails on the rep's phone
      const change: AccountChange = { id: x.id, accountId: a.id, byId: actor.id, at: existing?.at ?? nowIso, changes, note: x.note?.trim() || undefined, status: 'Pending' };
      return { ...s, accountChanges: replaceOrAdd(s.accountChanges ?? [], change) };
    }

    case 'account.review': {
      const x = (s.accountChanges ?? []).find((y) => y.id === m.id) ?? fail('Request not found.');
      if (x.status !== 'Pending') fail('This request was already decided.');
      const a = s.accounts.find((y) => y.id === x.accountId && !y.deletedAt) ?? fail('Account not found.');
      if (!isAdmin && (x.byId === actor.id || !manages(s.users, actor, a.ownerId))) fail('Only the rep’s manager or an administrator can review this.');
      if (!m.approve && !m.note?.trim()) fail('Say why when declining a change.');
      const decided: AccountChange = { ...x, status: m.approve ? 'Approved' : 'Rejected', reviewerId: actor.id, reviewedAt: nowIso, reviewNote: m.note?.trim() || undefined };
      const next = { ...s, accountChanges: replaceOrAdd(s.accountChanges ?? [], decided) };
      if (!m.approve) return next;
      return { ...next, accounts: replaceOrAdd(s.accounts, withChanges(a, x.changes, s)) };
    }

    case 'account.verify': {
      const list = s.accounts.filter((a) => m.ids.includes(a.id) && a.pendingReview && !a.deletedAt);
      if (!list.length) return s;
      for (const a of list) if (!isAdmin && (a.ownerId === actor.id || !manages(s.users, actor, a.ownerId))) fail('Only the rep’s manager or an administrator can confirm new accounts.');
      const ids = new Set(list.map((a) => a.id));
      if (m.approve) return { ...s, accounts: s.accounts.map((a) => (ids.has(a.id) ? { ...a, pendingReview: undefined } : a)) };
      return deleteAccounts(s, ids, nowIso);
    }

    case 'account.merge': {
      adminOnly();
      const keep = s.accounts.find((a) => a.id === m.keepId && !a.deletedAt) ?? fail('The account to keep was not found.');
      const ids = new Set(m.ids.filter((id) => id !== keep.id && s.accounts.some((a) => a.id === id && !a.deletedAt)));
      if (!ids.size) return s;
      for (const id of ids) if (s.accounts.find((a) => a.id === id)!.type !== keep.type) fail('Only accounts of the same kind can be merged.');
      const swap = (id: string) => (ids.has(id) ? keep.id : id);
      // Plans: targets for the duplicates move to the kept account; one plan never lists it twice.
      const plans = s.plans.map((p) => {
        if (!p.targets.some((t) => ids.has(t.accountId))) return p;
        const by = new Map<string, number>();
        for (const t of p.targets) by.set(swap(t.accountId), Math.min(50, (by.get(swap(t.accountId)) ?? 0) + t.planned));
        return { ...p, targets: [...by].map(([accountId, planned]) => ({ accountId, planned })), updatedAt: nowIso };
      });
      const events = (s.events ?? []).map((e) => {
        if (!e.attendees.some((x) => ids.has(x.accountId))) return e;
        const seen = new Set<string>();
        return { ...e, attendees: e.attendees.map((x) => ({ ...x, accountId: swap(x.accountId) })).filter((x) => (seen.has(x.accountId) ? false : (seen.add(x.accountId), true))) };
      });
      const moved: Snapshot = {
        ...s,
        // Every call, submitted ones included, now belongs to the account that stays.
        calls: s.calls.map((c) => (ids.has(c.accountId) ? { ...c, accountId: keep.id } : c)),
        plans,
        tasks: (s.tasks ?? []).map((t) => (t.accountId && ids.has(t.accountId) ? { ...t, accountId: keep.id } : t)),
        events,
        accounts: s.accounts.map((a) => {
          if (!a.workplaces?.some((w) => ids.has(w))) return a;
          return { ...a, workplaces: [...new Set(a.workplaces.map(swap))].filter((w) => w !== a.id) };
        }),
      };
      return deleteAccounts(moved, ids, nowIso, keep.id);
    }

    // ----- events (2.7) -----
    case 'event.save': {
      const e = m.event;
      const existing = (s.events ?? []).find((x) => x.id === e.id);
      const ownerId = existing?.ownerId ?? e.ownerId;
      if (ownerId !== actor.id && !manages(s.users, actor, ownerId)) fail('You can only manage your own or your team’s events.');
      if (!s.users.some((u) => u.id === ownerId && !u.deletedAt)) fail('Organiser not found.');
      const title = e.title.trim();
      if (!title || title.length > 120) fail('Give the event a title of up to 120 characters.');
      if (!EVENT_KINDS.includes(e.kind)) fail('Choose the kind of event.');
      if (!EVENT_STATUSES.includes(e.status)) fail('Invalid event status.');
      if (!DAY_RE.test(e.date)) fail('Use YYYY-MM-DD for the date.');
      if (e.time && !TIME_RE.test(e.time)) fail('Use HH:MM for the time.');
      for (const p of e.products) if (!s.products.some((x) => x.name === p)) fail(`${p} is not a product.`);
      if (e.products.length > 10) fail('Choose up to 10 products.');
      for (const v of [e.budget, e.spent]) if (v !== undefined && !(v >= 0 && v <= 1e12)) fail('Enter amounts of zero or more.');
      if (e.attendees.length > 500) fail('An event can have up to 500 invited people.');
      const seen = new Set<string>();
      const attendees = e.attendees.filter((x) => {
        if (seen.has(x.accountId)) return false;
        seen.add(x.accountId);
        const a = s.accounts.find((y) => y.id === x.accountId);
        if (!a) fail('Invited account not found.');
        if (!ATTENDEE_STATUSES.includes(x.status)) fail('Invalid attendance.');
        // Already on the list (e.g. deleted since): kept for the record. New invitations must be visible accounts.
        const before = existing?.attendees.some((y) => y.accountId === x.accountId);
        if (!before && (a!.deletedAt || !visible.has(a!.ownerId))) fail(`You cannot invite ${a!.name}.`);
        return true;
      });
      const event: MeetingEvent = {
        id: e.id, title, kind: e.kind, date: e.date, time: e.time || undefined, venue: e.venue?.trim() || undefined, city: e.city?.trim() || undefined, ownerId,
        products: [...new Set(e.products)], budget: e.budget, spent: e.spent, status: e.status, attendees, notes: e.notes?.trim() || undefined,
        createdAt: existing?.createdAt ?? nowIso, updatedAt: nowIso,
      };
      return { ...s, events: replaceOrAdd(s.events ?? [], event) };
    }

    case 'event.delete': {
      const e = (s.events ?? []).find((x) => x.id === m.id);
      if (!e) return s;
      if (e.ownerId !== actor.id && !manages(s.users, actor, e.ownerId)) fail('You can only delete your own or your team’s events.');
      if (e.status === 'Done') fail('A held event stays on record. Edit it instead.');
      return { ...s, events: (s.events ?? []).filter((x) => x.id !== e.id) };
    }

    // ----- sample reconciliation (2.7) -----
    case 'sample.count': {
      const x = m.count;
      if (x.repId !== actor.id) fail('You can only count your own samples.');
      if (!MONTH_RE.test(x.month)) fail('Use YYYY-MM for the month.');
      const existing = (s.sampleCounts ?? []).find((y) => y.id === x.id);
      if (existing && existing.repId !== actor.id) fail('You cannot change this count.');
      if (x.counts.length > 200) fail('Too many products.');
      for (const c of x.counts) {
        if (!Number.isInteger(c.counted) || c.counted < 0 || c.counted > 100000) fail('Counts must be whole numbers of zero or more.');
        if (!s.products.some((p) => p.name === c.product)) fail(`${c.product} is not a product.`);
      }
      const count: SampleCount = { id: x.id, repId: actor.id, month: x.month, counts: x.counts, note: x.note?.trim() || undefined, at: nowIso };
      return { ...s, sampleCounts: replaceOrAdd(s.sampleCounts ?? [], count) };
    }

    // ----- reports (2.3) -----
    case 'report.save': {
      adminOnly();
      const reports = s.settings.reports ?? [];
      const existing = reports.find((r) => r.id === m.report.id);
      const r: ReportDef = { ...m.report, name: m.report.name.trim(), createdBy: existing?.createdBy ?? actor.id, updatedAt: nowIso };
      const problem = reportProblem(r);
      if (problem) fail(problem);
      if (!existing && reports.length >= MAX_REPORTS) fail(`You can keep up to ${MAX_REPORTS} saved reports. Delete one first.`);
      return { ...s, settings: { ...s.settings, reports: replaceOrAdd(reports, r) } };
    }

    case 'report.delete': {
      adminOnly();
      const reports = s.settings.reports ?? [];
      if (!reports.some((r) => r.id === m.id)) return s;
      return { ...s, settings: { ...s.settings, reports: reports.filter((r) => r.id !== m.id) } };
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
    case 'user.delete':
      return `Deleted ${m.users.length} user${m.users.length > 1 ? 's' : ''}`;
    case 'user.photo':
      return m.photo ? 'Changed a profile photo' : 'Removed a profile photo';
    case 'user.leave':
      return 'Deleted their own account';
    case 'account.delete':
      return `Deleted ${m.ids.length} account${m.ids.length > 1 ? 's' : ''}`;
    case 'product.delete':
      return `Deleted ${m.ids.length} product${m.ids.length > 1 ? 's' : ''}`;
    case 'tiers.update':
      return m.teamId ? 'Changed a team’s tier names' : 'Changed the default tier names';
    case 'settings.update':
      return m.settings.cycleLength ? `Set planning cycles to ${m.settings.cycleLength === 'month' ? 'monthly' : 'quarterly'}` : m.type;
    case 'report.save':
      return `Saved report “${m.report.name}”`;
    case 'report.delete':
      return 'Deleted a report';
    case 'leave.request':
      return `Asked for leave ${m.leave.start} to ${m.leave.end}`;
    case 'leave.review':
      return m.approve ? 'Approved leave' : 'Declined leave';
    case 'sample.issue':
      return `${m.issue.qty > 0 ? 'Issued' : 'Took back'} ${Math.abs(m.issue.qty)} ${m.issue.product} samples`;
    case 'call.coach':
      return 'Coached a call';
    case 'account.change':
      return 'Asked to change an account';
    case 'account.review':
      return m.approve ? 'Approved an account change' : 'Declined an account change';
    case 'account.verify':
      return `${m.approve ? 'Confirmed' : 'Turned down'} ${m.ids.length} new account${m.ids.length > 1 ? 's' : ''}`;
    case 'account.merge':
      return `Merged ${m.ids.length} duplicate account${m.ids.length > 1 ? 's' : ''}`;
    case 'event.save':
      return `Saved event “${m.event.title}”`;
    case 'event.delete':
      return 'Deleted an event';
    case 'sample.count':
      return `Counted samples for ${m.count.month}`;
    default:
      return m.type;
  }
}
