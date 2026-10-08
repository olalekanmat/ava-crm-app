/**
 * Pure helpers for the AI features: checking what the server returns and turning it into the
 * app's own changes. Nothing here talks to the network or to React, so it is unit-tested.
 * AI output is never trusted: ids must be ones the user can see, dates must be valid, and
 * every change still goes through the normal mutation rules when the rep confirms it.
 */
import { lengthOfCycle, previousCycle, scaleFrequency } from '../data/cycles';
import { addDays, parseLocal, toDateKey } from '../data/dates';
import { cycleCalls } from '../data/metrics';
import { tiersFor } from '../data/tiers';
import type { Account, Call, Cycle, PlanTarget, Product, Snapshot } from '../data/types';
import type { AiTask, AiTasks, AskAction, AskResult, BriefResult, CallNoteResult, PlanInput, PlanResult, PlanSuggestion, ScheduleResult, ScheduleVisit } from './types';

// ----- reading untrusted JSON -----
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asStr = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const asArr = (v: unknown, max = 500): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const asStrings = (v: unknown, max = 50, len = 500): string[] => asArr(v, max).map((x) => asStr(x, len)).filter(Boolean);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: string) => DAY_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`)) && toDateKey(new Date(`${v}T00:00:00`)) === v;
const asDay = (v: unknown): string | null => {
  const s = asStr(v, 10);
  return isDay(s) ? s : null;
};
const asTime = (v: unknown): string | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(asStr(v, 8));
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

function coerceCallNote(v: unknown): CallNoteResult {
  const o = asObj(v);
  return {
    notes: asStr(o.notes, 5000),
    productsDiscussed: asStrings(o.productsDiscussed, 20, 120),
    keyMessages: asArr(o.keyMessages, 50)
      .map((k) => ({ product: asStr(asObj(k).product, 120), message: asStr(asObj(k).message, 300) }))
      .filter((k) => k.message),
    nextStep: asStr(o.nextStep, 500),
    followUpDate: asDay(o.followUpDate),
    attendees: asStr(o.attendees, 500),
  };
}

function coerceSchedule(v: unknown): ScheduleResult {
  const o = asObj(v);
  return {
    visits: asArr(o.visits, 50).map((x) => {
      const r = asObj(x);
      return { accountId: asStr(r.accountId, 80), date: asStr(r.date, 10), time: asStr(r.time, 8), note: asStr(r.note, 500) };
    }),
    unmatched: asStrings(o.unmatched, 20, 300),
    message: asStr(o.message, 1000),
  };
}

function coercePlan(v: unknown): PlanResult {
  const o = asObj(v);
  return {
    targets: asArr(o.targets, 3000).map((x) => {
      const r = asObj(x);
      return { accountId: asStr(r.accountId, 80), planned: typeof r.planned === 'number' ? r.planned : Number(r.planned), reason: asStr(r.reason, 300) };
    }),
    summary: asStr(o.summary, 2000),
  };
}

function coerceBrief(v: unknown): BriefResult {
  const o = asObj(v);
  return { summary: asStr(o.summary, 3000), talkingPoints: asStrings(o.talkingPoints, 10, 400), watchOuts: asStrings(o.watchOuts, 10, 400) };
}

const ACTION_TYPES = ['open_account', 'plan_visit', 'open_report'] as const;
function coerceAsk(v: unknown): AskResult {
  const o = asObj(v);
  return {
    answer: asStr(o.answer, 8000),
    actions: asArr(o.actions, 10)
      .map((x): AskAction | null => {
        const r = asObj(x);
        const type = ACTION_TYPES.find((t) => t === r.type);
        return type ? { type, accountId: asStr(r.accountId, 80) || undefined, label: asStr(r.label, 80) } : null;
      })
      .filter((x): x is AskAction => !!x),
  };
}

const COERCE: { [K in AiTask]: (v: unknown) => AiTasks[K]['result'] } = {
  call_note: coerceCallNote,
  schedule: coerceSchedule,
  plan: coercePlan,
  brief: coerceBrief,
  ask: coerceAsk,
};

/** Shapes a server reply into the task's result type. Throws when there is no result at all. */
export function coerceResult<T extends AiTask>(task: T, raw: unknown): AiTasks[T]['result'] {
  if (!raw || typeof raw !== 'object') throw new Error('No result');
  return COERCE[task](raw);
}

// ----- call notes -----

export interface CallNoteFields {
  notes: string;
  chosen: string[];
  messages: string[];
  nextStep: string;
  followUp: string;
  attendees: string;
}

/**
 * Merges an AI-tidied note into the call form. Products and key messages are matched to the
 * company's list (case-insensitive) and anything unknown is dropped; existing choices are kept.
 * Empty AI fields leave the form as it was. A follow-up date in the past is ignored.
 */
export function mergeCallNote(current: CallNoteFields, r: CallNoteResult, products: Pick<Product, 'name' | 'keyMessages'>[], today: string): CallNoteFields {
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p]));
  const chosen = [...current.chosen];
  for (const name of r.productsDiscussed) {
    const p = byName.get(name.trim().toLowerCase());
    if (p && !chosen.includes(p.name)) chosen.push(p.name);
  }
  const messages = [...current.messages];
  for (const k of r.keyMessages) {
    // The message must belong to a product on the call (by name, or any chosen product when unnamed).
    const pool = (k.product ? [byName.get(k.product.toLowerCase())] : chosen.map((c) => byName.get(c.toLowerCase()))).filter((p): p is Pick<Product, 'name' | 'keyMessages'> => !!p && chosen.includes(p.name));
    for (const p of pool) {
      const msg = p.keyMessages.find((m) => m.toLowerCase() === k.message.toLowerCase());
      if (msg && !messages.includes(msg)) messages.push(msg);
    }
  }
  const follow = r.followUpDate && r.followUpDate >= today ? r.followUpDate : '';
  return {
    notes: r.notes || current.notes,
    chosen,
    messages,
    nextStep: r.nextStep || current.nextStep,
    followUp: follow || current.followUp,
    attendees: r.attendees || current.attendees,
  };
}

// ----- voice to plan -----

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayName = (d: Date) => WEEKDAYS[d.getDay()];

/**
 * The accounts sent with a "plan my visits" request. Small territories go in full; for large
 * ones, accounts whose name or city shares a word with what the rep said come first.
 */
export function accountsForTranscript(accounts: Pick<Account, 'id' | 'name' | 'city'>[], transcript: string, max = 400): { id: string; name: string; city: string }[] {
  const slim = (a: Pick<Account, 'id' | 'name' | 'city'>) => ({ id: a.id, name: a.name, city: a.city });
  if (accounts.length <= max) return accounts.map(slim);
  const STOP = new Set(['the', 'and', 'visit', 'see', 'with', 'at', 'on', 'for', 'dr', 'doctor', 'next', 'this', 'pharmacy', 'hospital', 'clinic']);
  const words = new Set(transcript.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w)));
  const score = (a: Pick<Account, 'name' | 'city'>) => `${a.name} ${a.city}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => words.has(w)).length;
  return [...accounts]
    .map((a) => ({ a, s: score(a) }))
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .slice(0, max)
    .map((x) => slim(x.a));
}

export interface ProposedVisit extends ScheduleVisit {
  accountName: string;
  /** Why the visit cannot be planned as is, if anything. */
  problem?: string;
}

/** Checks AI-proposed visits: the account must be one sent with the request and the time valid and not past. */
export function checkVisits(visits: ScheduleVisit[], accounts: Pick<Account, 'id' | 'name'>[], now = new Date()): ProposedVisit[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const out: ProposedVisit[] = [];
  for (const v of visits) {
    const a = byId.get(v.accountId);
    if (!a) continue; // the model named an account the rep cannot plan; it shows under "not matched"
    const time = asTime(v.time) ?? '09:00';
    const date = asDay(v.date);
    const key = `${a.id}|${date}|${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const when = date ? parseLocal(date, time) : null;
    const problem = !when ? 'No valid date.' : when.getTime() < now.getTime() - 60 * 1000 ? 'This time has passed.' : undefined;
    out.push({ accountId: a.id, accountName: a.name, date: date ?? '', time, note: v.note, problem });
  }
  return out;
}

/** The Planned calls for the visits the rep confirmed (same shape the call editor saves). */
export function visitsToCalls(visits: ProposedVisit[], ownerId: string, now = new Date(), id: (i: number) => string = (i) => `call_${now.getTime().toString(36)}${i}`): Call[] {
  const iso = now.toISOString();
  return visits
    .filter((v) => !v.problem)
    .map((v, i) => ({
      id: id(i),
      accountId: v.accountId,
      ownerId,
      datetime: parseLocal(v.date, v.time)!.toISOString(),
      channel: 'In person' as const,
      status: 'Planned' as const,
      products: [],
      keyMessages: [],
      notes: v.note.trim() || undefined,
      createdAt: iso,
      updatedAt: iso,
    }));
}

// ----- cycle plan -----

/** Working days (Mon–Fri) between two YYYY-MM-DD dates, inclusive. */
export function workingDays(start: string, end: string): number {
  let n = 0;
  for (let d = new Date(`${start}T12:00:00`); toDateKey(d) <= end; d = addDays(d, 1)) if (d.getDay() % 6 !== 0) n++;
  return n;
}

/** About six calls a working day, or the rep's own pace last cycle when there is one. */
export const CALLS_PER_DAY = 6;

/** What the AI needs to suggest a plan for one rep and cycle. Only the rep's own territory goes in. */
export function buildPlanInput(data: Snapshot, ownerId: string, cycle: Cycle): PlanInput {
  const scheme = tiersFor(data.settings, data.users, ownerId);
  const territory = data.accounts.filter((a) => a.ownerId === ownerId && !a.deletedAt);
  const own = data.calls.filter((c) => c.ownerId === ownerId && c.status === 'Submitted');
  const prev = previousCycle(data.cycles, cycle);
  const lastCycle = prev ? cycleCalls(own, prev) : [];
  const plan = data.plans.find((p) => p.ownerId === ownerId && p.cycleId === cycle.id);
  const lastDate = new Map<string, string>();
  for (const c of own) {
    const d = toDateKey(new Date(c.datetime));
    if ((lastDate.get(c.accountId) ?? '') < d) lastDate.set(c.accountId, d);
  }
  const days = workingDays(cycle.start, cycle.end);
  const pace = prev && lastCycle.length ? lastCycle.length / Math.max(1, workingDays(prev.start, prev.end)) : CALLS_PER_DAY;
  return {
    cycle: { name: cycle.name, start: cycle.start, end: cycle.end },
    tiers: scheme.map((t) => ({ name: t.name, callsPerCycle: scaleFrequency(t.frequency, lengthOfCycle(cycle)) })),
    capacity: Math.max(1, Math.round(days * Math.min(Math.max(pace * 1.1, 2), 12))),
    accounts: territory.map((a) => ({
      id: a.id,
      name: a.name,
      tier: a.tier,
      specialty: a.specialty,
      type: a.type,
      callsLastCycle: lastCycle.filter((c) => c.accountId === a.id).length,
      lastCallDate: lastDate.get(a.id) ?? null,
      planned: plan?.targets.find((t) => t.accountId === a.id)?.planned ?? null,
    })),
  };
}

/** Keeps suggestions for accounts in the request, with whole numbers of calls from 1 to 50, once each. */
export function filterPlanTargets(targets: PlanSuggestion[], allowedIds: Iterable<string>): PlanSuggestion[] {
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  const out: PlanSuggestion[] = [];
  for (const t of targets) {
    if (!allowed.has(t.accountId) || seen.has(t.accountId)) continue;
    const n = Math.round(Number(t.planned));
    if (!Number.isFinite(n) || n < 1) continue;
    seen.add(t.accountId);
    out.push({ accountId: t.accountId, planned: Math.min(50, n), reason: t.reason });
  }
  return out;
}

export const toPlanTargets = (s: PlanSuggestion[]): PlanTarget[] => s.map((t) => ({ accountId: t.accountId, planned: t.planned }));

// ----- ask -----

/** Drops actions that point at accounts the user cannot see. */
export function filterAskActions(actions: AskAction[], knownAccountIds: Set<string>): AskAction[] {
  return actions
    .filter((a) => (a.type === 'open_account' ? !!a.accountId && knownAccountIds.has(a.accountId) : !a.accountId || knownAccountIds.has(a.accountId)))
    .map((a) => ({ ...a, label: a.label || (a.type === 'open_account' ? 'Open account' : a.type === 'plan_visit' ? 'Plan a visit' : 'Open report') }));
}

// ----- brief -----

/** The account and its recent calls, for a pre-call brief. */
export function buildBriefInput(account: Account, calls: Call[], today: string) {
  const recent = [...calls].sort((a, b) => b.datetime.localeCompare(a.datetime)).slice(0, 12);
  return {
    account: { name: account.name, type: account.type, specialty: account.specialty, tier: account.tier, city: account.city, affiliation: account.affiliation, notes: account.notes },
    calls: recent.map((c) => ({
      date: toDateKey(new Date(c.datetime)),
      status: c.status,
      channel: c.channel,
      products: c.products.map((p) => p.product),
      keyMessages: c.keyMessages,
      notes: c.notes?.slice(0, 1500),
      nextStep: c.nextStep,
      followUpDate: c.followUpDate,
      attendees: c.attendees,
    })),
    today,
  };
}
