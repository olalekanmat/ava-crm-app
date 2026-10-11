import { repsUnder } from './access';
import { toDateKey } from './dates';
import { detailingStats } from './detailing';
import { geoStatus } from './geo';
import { approvedLeave, cycleElapsed, repMetrics } from './metrics';
import { objectiveStats } from './objectives';
import { tierRank, tiersFor } from './tiers';
import { COACHING_SKILLS, type Cycle, type Snapshot, type User } from './types';

export interface RepWeek {
  rep: User;
  /** Submitted calls in the last 7 days, and in the 7 days before. */
  calls: number;
  callsBefore: number;
  /** Cycle attainment and how far through the cycle they are (after leave), 0..1. */
  attainment: number;
  elapsed: number;
  reach: number;
  /** In-person calls this week checked in within the geofence, 0..1; undefined with none. */
  verified?: number;
  /** Objectives achieved this week, 0..1; undefined when none were marked. */
  objectivesRate?: number;
  /** Calls this week in which a presentation was shown. */
  presented: number;
  /** Top-tier accounts or key opinion leaders in the plan not seen this cycle. */
  missedKey: { id: string; name: string }[];
  /** Drafts older than a day. */
  lateDrafts: number;
  /** Average coaching score (1 to 5) over the cycle, and the weakest skill. */
  coachingAvg?: number;
  weakestSkill?: string;
  /** Days of approved leave in the last 7. */
  leaveDays: number;
  /** Plain-language flags, most important first. */
  risks: string[];
  /** Things going well. */
  wins: string[];
}

export interface WeeklyDigest {
  /** YYYY-MM-DD, the Monday the summary covers up to. */
  weekOf: string;
  from: string;
  to: string;
  reps: RepWeek[];
  totals: { calls: number; callsBefore: number; atRisk: number };
}

const DAY = 864e5;

/** The Monday of `now`'s week (local time), as YYYY-MM-DD. */
export function mondayOf(now: Date): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateKey(d);
}

/**
 * A manager's weekly summary of each rep: the last 7 days against the 7 before, plan pace,
 * check-ins, objectives, presentations and coaching, with plain flags for what needs a word.
 * Works offline from data the manager already has; Ava AI can add a tip per rep on top.
 */
export function weeklyDigest(s: Snapshot, manager: User, cycle: Cycle | undefined, now = new Date()): WeeklyDigest {
  const to = now.getTime();
  const from = to - 7 * DAY;
  const fromBefore = from - 7 * DAY;
  const inRange = (iso: string, a: number, b: number) => {
    const t = Date.parse(iso);
    return t > a && t <= b;
  };
  const reps = repsUnder(s.users, manager).map((rep): RepWeek => {
    const own = s.calls.filter((c) => c.ownerId === rep.id);
    const week = own.filter((c) => c.status === 'Submitted' && inRange(c.datetime, from, to));
    const before = own.filter((c) => c.status === 'Submitted' && inRange(c.datetime, fromBefore, from));
    const m = cycle ? repMetrics(s, rep, cycle) : undefined;
    const leave = approvedLeave(s, rep.id);
    const elapsed = cycle ? cycleElapsed(cycle, now, leave) : 0;
    const geo = week.map((c) => geoStatus(c, s.settings.geofenceM)).filter((g) => g !== 'Remote');
    const obj = objectiveStats(week);
    const presented = detailingStats(week).reduce((n, d) => n + d.calls, 0);
    const scheme = tiersFor(s.settings, s.users, rep.id);
    const seen = new Set(cycle ? own.filter((c) => c.status === 'Submitted' && toDateKey(new Date(c.datetime)) >= cycle.start).map((c) => c.accountId) : []);
    const missedKey = (m?.plan?.targets ?? [])
      .map((t) => s.accounts.find((a) => a.id === t.accountId && !a.deletedAt))
      .filter((a): a is NonNullable<typeof a> => !!a && !seen.has(a.id) && (tierRank(scheme, a.tier) === 0 || !!a.kol))
      .map((a) => ({ id: a.id, name: a.name }));
    const lateDrafts = own.filter((c) => c.status === 'Saved' && to - Date.parse(c.datetime) > DAY).length;
    const coached = cycle ? own.filter((c) => c.coaching && toDateKey(new Date(c.datetime)) >= cycle.start) : [];
    const skillTotals = new Map<string, { sum: number; n: number }>();
    for (const c of coached) for (const k of COACHING_SKILLS) {
      const v = c.coaching!.scores[k];
      if (v === undefined) continue;
      const t = skillTotals.get(k) ?? { sum: 0, n: 0 };
      skillTotals.set(k, { sum: t.sum + v, n: t.n + 1 });
    }
    const allScores = [...skillTotals.values()];
    const coachingAvg = allScores.length ? allScores.reduce((n, x) => n + x.sum, 0) / allScores.reduce((n, x) => n + x.n, 0) : undefined;
    const weakest = [...skillTotals.entries()].sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n)[0];
    let leaveDays = 0;
    for (let t = from + DAY / 2; t <= to; t += DAY) {
      const k = toDateKey(new Date(t));
      if (leave.some((l) => l.start <= k && k <= l.end)) leaveDays++;
    }

    const verified = geo.length ? geo.filter((g) => g === 'Verified').length / geo.length : undefined;
    const attainment = m?.attainment ?? 0;
    const risks: string[] = [];
    const wins: string[] = [];
    if (m && m.planned && attainment < elapsed * 0.7) risks.push(`Behind plan: ${Math.round(attainment * 100)}% done with ${Math.round(elapsed * 100)}% of the cycle gone`);
    if (cycle && !m?.plan) risks.push('No cycle plan yet');
    else if (m?.plan?.status === 'Submitted') risks.push('Cycle plan waiting for your approval');
    if (week.length === 0 && leaveDays < 5) risks.push('No calls recorded this week');
    else if (before.length >= 4 && week.length < before.length * 0.6 && leaveDays < 3) risks.push(`Calls down to ${week.length} from ${before.length} the week before`);
    if (verified !== undefined && geo.length >= 3 && verified < 0.7) risks.push(`Only ${Math.round(verified * 100)}% of visits checked in at the account`);
    if (missedKey.length) risks.push(`${missedKey.length} key doctor${missedKey.length > 1 ? 's' : ''} not seen this cycle (${missedKey.slice(0, 3).map((a) => a.name).join(', ')}${missedKey.length > 3 ? '…' : ''})`);
    if (lateDrafts) risks.push(`${lateDrafts} draft call${lateDrafts > 1 ? 's' : ''} not submitted within a day`);
    if (obj.rate !== undefined && obj.achieved + obj.missed >= 3 && obj.rate < 0.4) risks.push(`Achieved ${Math.round(obj.rate * 100)}% of call objectives`);
    if (m && m.planned && attainment >= elapsed && elapsed > 0.1) wins.push('On or ahead of plan');
    if (week.length > before.length && before.length > 0) wins.push(`More calls than last week (${week.length} vs ${before.length})`);
    if (verified !== undefined && geo.length >= 3 && verified >= 0.95) wins.push('Every visit checked in on site');
    if (obj.rate !== undefined && obj.achieved >= 3 && obj.rate >= 0.7) wins.push(`Achieved ${Math.round(obj.rate * 100)}% of call objectives`);
    if (presented >= 3) wins.push(`Used presentations in ${presented} calls`);

    return {
      rep, calls: week.length, callsBefore: before.length, attainment, elapsed, reach: m?.reach ?? 0, verified, objectivesRate: obj.rate, presented, missedKey, lateDrafts,
      coachingAvg, weakestSkill: weakest && weakest[1].sum / weakest[1].n < 3.5 ? weakest[0] : undefined, leaveDays, risks, wins,
    };
  });
  reps.sort((a, b) => b.risks.length - a.risks.length || a.rep.name.localeCompare(b.rep.name));
  return {
    weekOf: mondayOf(now),
    from: toDateKey(new Date(from + DAY / 2)),
    to: toDateKey(now),
    reps,
    totals: { calls: reps.reduce((n, r) => n + r.calls, 0), callsBefore: reps.reduce((n, r) => n + r.callsBefore, 0), atRisk: reps.filter((r) => r.risks.length).length },
  };
}

/** The digest as compact text for Ava AI to write coaching tips from (no contact details). */
export function digestForAi(d: WeeklyDigest): string {
  return JSON.stringify({
    week: `${d.from} to ${d.to}`,
    reps: d.reps.map((r) => ({
      name: r.rep.name,
      callsThisWeek: r.calls,
      callsWeekBefore: r.callsBefore,
      planDone: Math.round(r.attainment * 100),
      cycleGone: Math.round(r.elapsed * 100),
      reach: Math.round(r.reach * 100),
      checkedInOnSite: r.verified === undefined ? null : Math.round(r.verified * 100),
      objectivesAchieved: r.objectivesRate === undefined ? null : Math.round(r.objectivesRate * 100),
      presentations: r.presented,
      keyDoctorsNotSeen: r.missedKey.length,
      lateDrafts: r.lateDrafts,
      coachingAverage: r.coachingAvg === undefined ? null : Math.round(r.coachingAvg * 10) / 10,
      weakestSkill: r.weakestSkill ?? null,
      leaveDays: r.leaveDays,
      flags: r.risks,
      wins: r.wins,
    })),
  });
}

/** Parses Ava's reply ("Name: tip" lines) into one tip per rep name. */
export function parseTips(answer: string, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of answer.split(/\n+/)) {
    const clean = line.replace(/^[\s*\-•\d.)]+/, '').replace(/\*\*/g, '').trim();
    const i = clean.indexOf(':');
    if (i < 1) continue;
    const who = clean.slice(0, i).trim().toLowerCase();
    const name = names.find((n) => n.toLowerCase() === who) ?? names.find((n) => who.includes(n.toLowerCase()));
    if (name && !out[name]) out[name] = clean.slice(i + 1).trim().slice(0, 400);
  }
  return out;
}
