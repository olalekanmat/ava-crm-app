/**
 * The summary sent with an "Ask Ava" question. It is built only from the signed-in user's scoped
 * data (useStore().data), so it never holds more than they can already see, and it is kept
 * under MAX_CONTEXT characters by shortening the lists until it fits.
 */
import { repsUnder, roleLabel } from '../data/access';
import { activeCycleLength } from '../data/cycles';
import { toDateKey } from '../data/dates';
import { callsByAccount, currentCycle, cycleCalls, cycleElapsed, daysLeft, repMetrics, rollup, type RepMetrics } from '../data/metrics';
import { nextVisits } from '../data/nextBest';
import { tierRank, tiersFor } from '../data/tiers';
import type { Snapshot, User } from '../data/types';

export const MAX_CONTEXT = 60_000;

const day = (iso: string) => toDateKey(new Date(iso));
const pct = (x: number) => Math.round(x * 100);

function repLine(m: RepMetrics) {
  return { rep: m.rep.name, repId: m.rep.id, territory: m.rep.territory, plan: m.plan?.status ?? 'None', calls: m.calls, planned: m.planned, attainmentPct: pct(m.attainment), reachPct: pct(m.reach), drafts: m.drafts, offSite: m.offSite, missingCheckIn: m.missingCheckIn };
}

function build(data: Snapshot, me: User, now: Date, limit: number): Record<string, unknown> {
  const today = toDateKey(now);
  const cycle = currentCycle(data.cycles, now, activeCycleLength(data.settings));
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const userName = new Map(data.users.map((u) => [u.id, u.name]));
  const calls = data.calls;
  const lastCall = new Map<string, string>();
  for (const c of calls) if (c.status === 'Submitted' && (lastCall.get(c.accountId) ?? '') < c.datetime) lastCall.set(c.accountId, c.datetime);

  const planned = calls.filter((c) => c.status === 'Planned').sort((a, b) => a.datetime.localeCompare(b.datetime));
  const overdue = planned.filter((c) => c.datetime < now.toISOString());
  const upcoming = planned.filter((c) => c.datetime >= now.toISOString());
  const callLine = (c: (typeof calls)[number]) => ({ callId: c.id, accountId: c.accountId, account: accountName.get(c.accountId) ?? 'Account', rep: me.role === 'Rep' ? undefined : userName.get(c.ownerId), when: c.datetime.slice(0, 16), notes: c.notes?.slice(0, 120) });
  const followUps = calls
    .filter((c) => c.status === 'Submitted' && c.followUpDate && c.followUpDate <= toDateKey(new Date(now.getTime() + 14 * 86400000)))
    .filter((c) => !calls.some((x) => x.accountId === c.accountId && x.datetime > c.datetime))
    .sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!));

  const reps = repsUnder(data.users, me);
  const ctx: Record<string, unknown> = {
    me: { name: me.name, role: roleLabel(me), territory: me.territory },
    today,
    company: data.company.name,
    counts: {
      accounts: data.accounts.length,
      hcp: data.accounts.filter((a) => a.type === 'HCP').length,
      hco: data.accounts.filter((a) => a.type === 'HCO').length,
      reps: reps.length,
      submittedCalls: calls.filter((c) => c.status === 'Submitted').length,
      draftCalls: calls.filter((c) => c.status === 'Saved').length,
      upcomingPlannedCalls: upcoming.length,
      overduePlannedCalls: overdue.length,
    },
    products: data.products.filter((p) => p.active).map((p) => p.name),
  };

  if (cycle) {
    const metrics = reps.map((r) => repMetrics(data, r, cycle));
    const team = rollup(metrics);
    ctx.cycle = {
      name: cycle.name,
      start: cycle.start,
      end: cycle.end,
      elapsedPct: pct(cycleElapsed(cycle, now)),
      daysLeft: daysLeft(cycle, now),
      callsSubmitted: team.calls,
      plannedCalls: team.planned,
      attainmentPct: pct(team.attainment),
      reachPct: pct(team.reach),
      plansWaitingApproval: team.plansPending,
      repsWithoutPlan: team.plansMissing,
      reachByTier: team.reachByTier,
    };

    // Accounts behind their plan, compared with the share of the cycle that has passed.
    const elapsed = cycleElapsed(cycle, now);
    const behind: Record<string, unknown>[] = [];
    for (const m of metrics) {
      if (!m.plan) continue;
      const done = callsByAccount(cycleCalls(calls.filter((c) => c.ownerId === m.rep.id), cycle));
      for (const t of m.plan.targets) {
        const n = done.get(t.accountId)?.length ?? 0;
        const expected = Math.floor(t.planned * elapsed);
        if (n < expected) behind.push({ accountId: t.accountId, account: accountName.get(t.accountId), rep: me.role === 'Rep' ? undefined : m.rep.name, done: n, planned: t.planned, expectedByNow: expected, gap: expected - n });
      }
    }
    behind.sort((a, b) => (b.gap as number) - (a.gap as number));
    ctx.behindPlan = behind.slice(0, limit);
    if (me.role !== 'Rep') ctx.reps = metrics.map(repLine).slice(0, limit);
    if (me.role === 'SLM' || me.role === 'Admin') {
      const flms = data.users.filter((u) => u.role === 'FLM' && u.active && !u.deletedAt);
      ctx.teams = flms.slice(0, limit).map((f) => {
        const r = rollup(repsUnder(data.users, f).map((x) => repMetrics(data, x, cycle)));
        return { manager: f.name, team: f.territory, reps: r.reps.length, calls: r.calls, attainmentPct: pct(r.attainment), reachPct: pct(r.reach), plansWaitingApproval: r.plansPending, repsWithoutPlan: r.plansMissing };
      });
    }
  }

  // Whom to see next (2.6): ranked offline from plan pace, follow-ups, tasks and the doctor's profile,
  // with what was discussed last time so Ava can suggest talking points.
  if (me.role === 'Rep') {
    ctx.visitNext = nextVisits(data, me.id, cycle, now, Math.min(limit, 10)).map((v) => {
      const last = calls.filter((c) => c.accountId === v.account.id && c.status === 'Submitted').sort((a, b) => b.datetime.localeCompare(a.datetime))[0];
      return {
        accountId: v.account.id,
        account: v.account.name,
        specialty: v.account.specialty,
        kol: v.account.kol || undefined,
        potential: v.account.potential,
        segment: v.account.segment,
        why: v.reasons,
        lastVisit: last ? { date: day(last.datetime), products: last.products.map((p) => p.product), keyMessages: last.keyMessages, notes: last.notes?.slice(0, 160), nextStep: last.nextStep?.slice(0, 120) } : null,
      };
    });
  }
  const openTasks = (data.tasks ?? []).filter((t) => !t.doneAt && (me.role !== 'Rep' || t.ownerId === me.id)).sort((a, b) => a.due.localeCompare(b.due));
  if (openTasks.length) ctx.openTasks = openTasks.slice(0, limit).map((t) => ({ task: t.title, due: t.due, account: t.accountId ? accountName.get(t.accountId) : undefined, owner: me.role === 'Rep' ? undefined : userName.get(t.ownerId) }));
  const leave = (data.leaves ?? []).filter((l) => (l.status === 'Approved' || l.status === 'Pending') && l.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  if (leave.length) ctx.leave = leave.slice(0, limit).map((l) => ({ who: userName.get(l.userId), from: l.start, to: l.end, kind: l.kind, status: l.status }));

  ctx.overdueCalls = overdue.slice(Math.max(0, overdue.length - limit)).map(callLine);
  ctx.upcomingCalls = upcoming.slice(0, limit).map(callLine);
  ctx.followUpsDue = followUps.slice(0, limit).map((c) => ({ accountId: c.accountId, account: accountName.get(c.accountId), due: c.followUpDate, nextStep: c.nextStep?.slice(0, 120) }));

  // Top accounts by tier (top tier first), with when they were last seen.
  ctx.topAccounts = [...data.accounts]
    .map((a) => ({ a, rank: tierRank(tiersFor(data.settings, data.users, a.ownerId), a.tier) }))
    .sort((x, y) => x.rank - y.rank || (lastCall.get(x.a.id) ?? '').localeCompare(lastCall.get(y.a.id) ?? '') || x.a.name.localeCompare(y.a.name))
    .slice(0, limit * 2)
    .map(({ a }) => ({ accountId: a.id, name: a.name, type: a.type, specialty: a.specialty, tier: a.tier, kol: a.kol || undefined, potential: a.potential, segment: a.segment, city: a.city, owner: me.role === 'Rep' ? undefined : userName.get(a.ownerId), lastCall: lastCall.has(a.id) ? day(lastCall.get(a.id)!) : null }));

  ctx.recentCalls = calls
    .filter((c) => c.status === 'Submitted')
    .sort((a, b) => b.datetime.localeCompare(a.datetime))
    .slice(0, limit)
    .map((c) => ({ accountId: c.accountId, account: accountName.get(c.accountId), rep: me.role === 'Rep' ? undefined : userName.get(c.ownerId), date: day(c.datetime), products: c.products.map((p) => p.product), nextStep: c.nextStep?.slice(0, 100) }));
  return ctx;
}

/** JSON summary of what `me` can see, at most `max` characters. */
export function buildAskContext(data: Snapshot, me: User, now = new Date(), max = MAX_CONTEXT): string {
  for (let limit = 60; limit >= 1; limit = Math.floor(limit / 2)) {
    const json = JSON.stringify(build(data, me, now, limit));
    if (json.length <= max) return json;
  }
  // Very large companies: the headline numbers only.
  const { me: who, today, counts, cycle } = build(data, me, now, 0);
  return JSON.stringify({ me: who, today, counts, cycle }).slice(0, max);
}
