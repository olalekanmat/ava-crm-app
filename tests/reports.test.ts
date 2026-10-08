import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeSnapshot } from '../src/data/access';
import { applyMutation, describeMutation, RuleError } from '../src/data/mutations';
import {
  reportProblem, allReports, canBuildReports, canViewReports, formatCell, MAX_REPORTS, REPORT_COLUMNS, REPORT_TEMPLATES, reportCsv, reportFileName, resolveRange, runReport, weekOf,
} from '../src/data/reports';
import { sanitizeMutation } from '../src/data/sanitize';
import { buildSeed } from '../src/data/seed';
import type { ReportDef, Snapshot } from '../src/data/types';
import { parseCsv } from '../src/data/csv';
import { monthCycles, quarterCycles } from '../src/data/cycles';
import { addDays, toDateKey } from '../src/data/dates';

const now = new Date('2026-10-03T12:00:00');
const seed = () => buildSeed(now);
const user = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)!;
const def = (d: Partial<ReportDef>): ReportDef => ({ id: 'r1', name: 'Test', dataset: 'calls', columns: [], filters: { date: 'all' }, groupBy: 'none', metrics: [], ...d });

test('reports: every template runs for an administrator and a manager', () => {
  const s = seed();
  assert.ok(REPORT_TEMPLATES.length >= 6 && REPORT_TEMPLATES.length <= 8);
  for (const t of REPORT_TEMPLATES) {
    for (const who of ['usr_admin', 'usr_flm1', 'usr_slm']) {
      const r = runReport(s, t, user(s, who), now);
      assert.equal(r.totals.length, r.columns.length, t.name);
      for (const row of r.rows) assert.equal(row.length, r.columns.length, t.name);
    }
  }
  // Template results are deterministic.
  assert.deepEqual(runReport(s, REPORT_TEMPLATES[0], user(s, 'usr_admin'), now), runReport(s, REPORT_TEMPLATES[0], user(s, 'usr_admin'), now));
});

test('reports: calls list respects filters and scope', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const all = runReport(s, def({}), admin, now);
  assert.equal(all.total, s.calls.length);
  const submitted = runReport(s, def({ filters: { date: 'all', status: 'Submitted' } }), admin, now);
  assert.equal(submitted.total, s.calls.filter((c) => c.status === 'Submitted').length);

  // A first-line manager only ever sees their team, whatever the filters say.
  const flm = user(s, 'usr_flm1');
  const mine = runReport(s, def({ columns: ['rep'] }), flm, now);
  assert.ok(mine.total > 0);
  assert.ok(mine.rows.every((r) => ['usr_rep1', 'usr_rep2'].map((id) => user(s, id).name).includes(r[0] as string)));
  const outside = runReport(s, def({ filters: { date: 'all', repId: 'usr_rep3' } }), flm, now);
  assert.equal(outside.total, 0, 'a rep outside the manager’s team gives nothing');

  // Rep and team filters.
  const rep1 = runReport(s, def({ filters: { date: 'all', repId: 'usr_rep1' } }), admin, now);
  assert.equal(rep1.total, s.calls.filter((c) => c.ownerId === 'usr_rep1').length);
  const team1 = runReport(s, def({ filters: { date: 'all', teamId: 'usr_flm1' } }), admin, now);
  assert.equal(team1.total, s.calls.filter((c) => ['usr_rep1', 'usr_rep2'].includes(c.ownerId)).length);

  // Channel and product filters.
  const phone = runReport(s, def({ filters: { date: 'all', channel: 'Phone' }, columns: ['channel'] }), admin, now);
  assert.ok(phone.rows.every((r) => r[0] === 'Phone'));
  const product = s.calls.find((c) => c.products.length)!.products[0].product;
  const prod = runReport(s, def({ filters: { date: 'all', product: product.toUpperCase() } }), admin, now);
  assert.equal(prod.total, s.calls.filter((c) => c.products.some((p) => p.product === product)).length);

  // Unknown columns fall back to defaults; chosen columns come in order.
  const cols = runReport(s, def({ columns: ['account', 'date'] }), admin, now);
  assert.deepEqual(cols.columns.map((c) => c.key), ['account', 'date']);
});

test('reports: date presets', () => {
  const s = seed();
  const cur = resolveRange(s, { date: 'thisCycle' }, now);
  assert.equal(cur.cycle?.id, 'cyc_now');
  assert.equal(resolveRange(s, { date: 'lastCycle' }, now).cycle?.id, 'cyc_prev');
  assert.deepEqual([resolveRange(s, { date: 'thisMonth' }, now).from, resolveRange(s, { date: 'thisMonth' }, now).to], ['2026-10-01', '2026-10-31']);
  assert.deepEqual([resolveRange(s, { date: 'lastMonth' }, now).from, resolveRange(s, { date: 'lastMonth' }, now).to], ['2026-09-01', '2026-09-30']);
  assert.deepEqual([resolveRange(s, { date: 'custom', from: '2026-09-10', to: '2026-09-20' }, now).from, resolveRange(s, { date: 'custom', from: '2026-09-10', to: '2026-09-20' }, now).to], ['2026-09-10', '2026-09-20']);
  assert.equal(resolveRange(s, { date: 'all' }, now).from, undefined);

  // With monthly cycles, "this cycle" is the month and "last cycle" the month before.
  const m: Snapshot = { ...s, cycles: [...quarterCycles(2026, 2026), ...monthCycles(2026, 2026)], settings: { ...s.settings, cycleLength: 'month' } };
  assert.equal(resolveRange(m, { date: 'thisCycle' }, now).cycle?.id, 'm2026-10');
  assert.equal(resolveRange(m, { date: 'lastCycle' }, now).cycle?.id, 'm2026-09');
  assert.equal(resolveRange({ ...m, settings: { ...m.settings, cycleLength: 'quarter' } }, { date: 'lastCycle' }, now).cycle?.id, 'q2026-3');

  const custom = runReport(s, def({ filters: { date: 'custom', from: '2026-09-25', to: '2026-09-30' }, columns: ['date'] }), user(s, 'usr_admin'), now);
  assert.ok(custom.rows.every((r) => (r[0] as string) >= '2026-09-25' && (r[0] as string) <= '2026-09-30'));
});

test('reports: grouping, metrics, totals and chart', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const byRep = runReport(s, def({ groupBy: 'rep', metrics: ['count', 'plannedDone', 'attainment', 'geoVerified'] }), admin, now);
  assert.deepEqual(byRep.columns.map((c) => c.key), ['group', 'count', 'planned', 'done', 'attainment', 'geoVerified']);
  assert.equal(byRep.rows.length, 4);
  const sum = byRep.rows.reduce((n, r) => n + (r[1] as number), 0);
  assert.equal(sum, s.calls.length);
  assert.equal(byRep.totals[1], s.calls.length);
  assert.equal(byRep.totals[3], s.calls.filter((c) => c.status === 'Submitted').length);
  // Sorted by the first metric, largest first, and charted.
  for (let i = 1; i < byRep.rows.length; i++) assert.ok((byRep.rows[i - 1][1] as number) >= (byRep.rows[i][1] as number));
  assert.equal(byRep.chart?.length, 4);

  // Product grouping counts a call once per product.
  const byProduct = runReport(s, def({ groupBy: 'product', metrics: ['count'] }), admin, now);
  assert.equal(byProduct.rows.reduce((n, r) => n + (r[1] as number), 0), s.calls.reduce((n, c) => n + (c.products.length || 1), 0));

  // Weeks are chronological and start on Monday.
  const byWeek = runReport(s, def({ groupBy: 'week', metrics: ['count'] }), admin, now);
  const weeks = byWeek.rows.map((r) => String(r[0]).replace('Week of ', ''));
  assert.deepEqual([...weeks].sort(), weeks);
  assert.equal(weekOf('2026-10-03'), '2026-09-28');
  assert.equal(weekOf('2026-09-28'), '2026-09-28');

  // An explicit sort wins.
  const asc = runReport(s, def({ groupBy: 'rep', metrics: ['count'], sort: { key: 'count', dir: 'asc' } }), admin, now);
  for (let i = 1; i < asc.rows.length; i++) assert.ok((asc.rows[i - 1][1] as number) <= (asc.rows[i][1] as number));
});

test('reports: plans, coverage and activity agree with the plan data', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const plans = runReport(s, def({ dataset: 'plans', filters: { date: 'thisCycle' }, groupBy: 'team', metrics: ['plannedDone', 'attainment', 'reach'] }), admin, now);
  const planned = s.plans.filter((p) => p.cycleId === 'cyc_now').reduce((n, p) => n + p.targets.reduce((m, t) => m + t.planned, 0), 0);
  assert.equal(plans.totals[1], planned);
  const att = plans.totals[3] as number;
  assert.ok(att >= 0 && att <= 1);
  const draft = runReport(s, def({ dataset: 'plans', filters: { date: 'thisCycle', status: 'Approved' }, columns: ['status'] }), admin, now);
  assert.ok(draft.rows.every((r) => r[0] === 'Approved'));

  const coverage = runReport(s, REPORT_TEMPLATES.find((t) => t.id === 'tpl-coverage-tier')!, admin, now);
  assert.equal(coverage.totals[1], s.accounts.filter((a) => !a.deletedAt).length);

  const notVisited = runReport(s, REPORT_TEMPLATES.find((t) => t.id === 'tpl-not-visited')!, admin, now);
  const lastVisit = (id: string) => s.calls.filter((c) => c.accountId === id && c.status === 'Submitted').map((c) => toDateKey(new Date(c.datetime))).sort().at(-1);
  const cutoff = toDateKey(addDays(now, -60));
  const expected = s.accounts.filter((a) => {
    const l = lastVisit(a.id);
    return !l || l <= cutoff;
  }).length;
  assert.equal(notVisited.total, expected);

  const activity = runReport(s, def({ dataset: 'activity', filters: { date: 'all' }, columns: ['rep', 'calls'] }), admin, now);
  assert.equal(activity.total, 4);
  assert.equal(activity.totals[1], s.calls.filter((c) => c.status === 'Submitted').length);
  // A rep's own view through a manager: the FLM sees two reps.
  assert.equal(runReport(s, def({ dataset: 'activity', filters: { date: 'all' } }), user(s, 'usr_flm1'), now).total, 2);
});

test('reports: CSV export and formatting', () => {
  const s = seed();
  const r = runReport(s, def({ groupBy: 'tier', metrics: ['count', 'attainment'] }), user(s, 'usr_admin'), now);
  const rows = parseCsv(reportCsv(r));
  assert.deepEqual(rows[0], ['Tier', 'Calls', 'Completed %']);
  assert.equal(rows.length, r.rows.length + 2, 'header, rows and a totals line');
  assert.equal(rows.at(-1)![0], 'Total');
  assert.ok(/^\d+$/.test(rows[1][2]), 'percentages are whole numbers');
  assert.equal(formatCell(0.456, 'pct'), '46%');
  assert.equal(formatCell(null, 'pct'), '–');
  assert.equal(reportFileName('Calls by rep / this cycle!', now), 'ava-report-calls-by-rep-this-cycle-2026-10-03.csv');
  // The on-screen limit leaves the export complete.
  const limited = runReport(s, def({}), user(s, 'usr_admin'), now, 5);
  assert.equal(limited.rows.length, 5);
  assert.equal(limited.total, s.calls.length);
});

test('reports: saved definitions are admin-only, sanitized and capped', () => {
  const s = seed();
  const admin = user(s, 'usr_admin');
  const flm = user(s, 'usr_flm1');
  assert.ok(canBuildReports(admin) && !canBuildReports(flm));
  assert.ok(canViewReports(flm) && canViewReports(user(s, 'usr_slm')) && !canViewReports(user(s, 'usr_rep1')));

  const raw = {
    type: 'report.save',
    report: {
      id: 'rep_1', name: '  Calls by team  ', dataset: 'calls', columns: ['date', 'bogus', 'date'], metrics: ['count', 'nope'], groupBy: 'team',
      filters: { date: 'custom', from: '2026-09-01', to: '2026-09-30', channel: 'Phone', extra: 'x', teamId: '' }, sort: { key: 'count', dir: 'desc' }, createdBy: 'usr_rep1', evil: true,
    },
  };
  const clean = sanitizeMutation(raw, now);
  assert.deepEqual(clean, {
    type: 'report.save',
    report: { id: 'rep_1', name: '  Calls by team  ', dataset: 'calls', columns: ['date'], metrics: ['count'], groupBy: 'team', filters: { date: 'custom', from: '2026-09-01', to: '2026-09-30', channel: 'Phone' }, sort: { key: 'count', dir: 'desc' } },
  });
  assert.throws(() => sanitizeMutation({ ...raw, report: { ...raw.report, dataset: 'payroll' } }, now), RuleError);
  assert.throws(() => sanitizeMutation({ ...raw, report: { ...raw.report, groupBy: 'city' } }, now), RuleError);
  assert.throws(() => sanitizeMutation({ ...raw, report: { ...raw.report, id: '../x' } }, now), RuleError);
  assert.throws(() => sanitizeMutation({ ...raw, report: { ...raw.report, filters: { notVisitedDays: 1.5 } } }, now), RuleError);
  assert.throws(() => sanitizeMutation({ ...raw, report: { ...raw.report, filters: { from: '1 Sept' } } }, now), RuleError);

  assert.throws(() => applyMutation(s, clean, flm, now), /administrator/);
  const s2 = applyMutation(s, clean, admin, now);
  const saved = s2.settings.reports![0];
  assert.equal(saved.name, 'Calls by team');
  assert.equal(saved.createdBy, 'usr_admin');
  assert.equal(saved.updatedAt, now.toISOString());
  assert.equal(describeMutation(clean), 'Saved report “  Calls by team  ”');
  assert.equal(allReports(s2.settings.reports)[0].id, 'rep_1');

  // Saving again replaces it; an empty name is refused.
  const s3 = applyMutation(s2, { type: 'report.save', report: { ...clean.report, name: 'Renamed' } } as never, admin, now);
  assert.equal(s3.settings.reports!.length, 1);
  assert.equal(s3.settings.reports![0].name, 'Renamed');
  assert.throws(() => applyMutation(s2, { type: 'report.save', report: { ...clean.report, name: ' ' } } as never, admin, now), /name/);

  // At most 50, and a definition must stay small.
  let full = s;
  for (let i = 0; i < MAX_REPORTS; i++) full = applyMutation(full, { type: 'report.save', report: { ...clean.report, id: `r${i}` } } as never, admin, now);
  assert.throws(() => applyMutation(full, { type: 'report.save', report: { ...clean.report, id: 'one-more' } } as never, admin, now), /up to 50/);
  assert.throws(() => applyMutation(s, { type: 'report.save', report: { ...clean.report, columns: Array(100).fill("x".repeat(40)), name: "n" } } as never, admin, now), /too large/);

  // Delete: admin only; deleting a missing one is a no-op.
  assert.throws(() => applyMutation(s3, sanitizeMutation({ type: 'report.delete', id: 'rep_1' }, now), flm, now), /administrator/);
  const s4 = applyMutation(s3, sanitizeMutation({ type: 'report.delete', id: 'rep_1' }, now), admin, now);
  assert.equal(s4.settings.reports!.length, 0);
  assert.equal(applyMutation(s4, { type: 'report.delete', id: 'rep_1' }, admin, now), s4);
});

test('reports: a manager running an admin-built report stays in scope', () => {
  const s = seed();
  const flm = user(s, 'usr_flm1');
  const r = runReport(s, def({ dataset: 'accounts', columns: ['rep'] }), flm, now);
  const scoped = scopeSnapshot(s, flm);
  assert.equal(r.total, scoped.accounts.length);
  assert.ok(REPORT_COLUMNS.accounts.some((c) => c.key === 'daysSince'));
});

test('reports: definitions are checked before saving', () => {
  assert.match(reportProblem(def({ name: ' ' }))!, /name/);
  assert.match(reportProblem(def({ filters: { date: 'custom', from: '2026-09-01' } }))!, /custom dates/);
  assert.match(reportProblem(def({ filters: { date: 'custom', from: '2026-9-1', to: '2026-09-30' } }))!, /custom dates/);
  assert.match(reportProblem(def({ filters: { date: 'custom', from: '2026-10-01', to: '2026-09-30' } }))!, /before/);
  assert.equal(reportProblem(def({ filters: { date: 'custom', from: '2026-09-01', to: '2026-09-30' } })), undefined);
  for (const t of REPORT_TEMPLATES) assert.equal(reportProblem(t), undefined, t.name);
});
