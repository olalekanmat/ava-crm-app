import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarItems } from '../src/data/calendarItems';
import {
  DATA_MODEL, DATA_MODEL_FILES, exportCallObjectives, exportCallProducts, exportCalls, exportDataModel, exportEventAttendees, exportEvents, exportLeave,
  exportPresentations, exportSampleMovements, exportTasks, exportUsers, parseCsv,
} from '../src/data/csv';
import { buildIcs, icsEscape, icsFold } from '../src/data/ics';
import { buildSeed } from '../src/data/seed';
import type { Call, MeetingEvent, Snapshot } from '../src/data/types';

const now = new Date('2026-10-03T12:00:00');
const table = (csv: string) => {
  const [head, ...rows] = parseCsv(csv);
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
};
const headerOf = (csv: string) => parseCsv(csv)[0];

const withExtras = (): Snapshot => {
  const s = buildSeed(now);
  const rep = 'usr_rep1';
  const acc = s.accounts.find((a) => a.ownerId === rep && !a.deletedAt)!;
  const call: Call = {
    id: 'cx', accountId: acc.id, ownerId: rep, datetime: '2026-10-02T09:00:00.000Z', channel: 'In person', status: 'Submitted',
    products: [{ product: 'Cardiovex', priority: 1 }, { product: 'Glucora', priority: 2 }], keyMessages: [], createdAt: '', updatedAt: '',
    objectives: [{ text: 'Agree a trial', achieved: true }, { text: 'Leave leaflets', achieved: false }],
    detailing: [{ product: 'Cardiovex', slide: 1, seconds: 20 }], reaction: 'Positive',
    samples: [{ product: 'Cardiovex', qty: 2, batch: 'B1', expiry: '2027-03' }], signature: { name: 'Dr X', strokes: [[1, 2, 3, 4]], at: '' },
  };
  const planned: Call = { ...call, id: 'cp', status: 'Planned', datetime: '2026-10-06T09:00:00.000Z', objectives: [{ text: 'Share new data' }], detailing: undefined, samples: undefined, signature: undefined };
  const ev: MeetingEvent = {
    id: 'ev1', title: 'Cardiology CME', kind: 'CME', date: '2026-10-10', time: '18:00', venue: 'Eko Hotel', city: 'Lagos', ownerId: rep, products: ['Cardiovex'],
    status: 'Planned', attendees: [{ accountId: acc.id, status: 'Invited' }], createdAt: '', updatedAt: '',
  };
  const gone = { ...s.users.find((u) => u.id === 'usr_rep2')!, deletedAt: '2026-09-01T00:00:00Z' };
  return {
    ...s,
    users: s.users.map((u) => (u.id === gone.id ? gone : u)),
    calls: [...s.calls, call, planned],
    samples: [{ id: 'i1', repId: rep, product: 'Cardiovex', qty: 10, batch: 'B1', expiry: '2027-03', byId: 'usr_flm1', at: '2026-09-30T08:00:00.000Z' }],
    tasks: [
      { id: 't1', ownerId: rep, title: 'Send leaflet', due: '2026-10-05', createdAt: '' },
      { id: 't2', ownerId: gone.id, title: 'Old task', due: '2026-10-05', createdAt: '' },
    ],
    leaves: [{ id: 'l1', userId: rep, start: '2026-10-07', end: '2026-10-09', kind: 'Annual', status: 'Approved', createdAt: '' }],
    events: [ev],
  };
};

test('live data: one file per table with ids for joining', () => {
  const s = withExtras();
  const products = table(exportCallProducts(s)).filter((r) => r.call_id === 'cx');
  assert.deepEqual(products.map((r) => [r.product, r.priority]), [['Cardiovex', '1'], ['Glucora', '2']]);
  assert.equal(products[0].rep_id, 'usr_rep1');
  assert.equal(products[0].date, '2026-10-02');

  const obj = table(exportCallObjectives(s));
  assert.deepEqual(obj.filter((r) => r.call_id === 'cx').map((r) => r.achieved), ['yes', 'no']);
  assert.equal(obj.find((r) => r.call_id === 'cp')!.achieved, '', 'blank while planned');

  const pres = table(exportPresentations(s)).filter((r) => r.call_id === 'cx');
  assert.deepEqual([pres[0].slide, pres[0].seconds, pres[0].reaction], ['1', '20', 'Positive']);

  const samples = table(exportSampleMovements(s)).filter((r) => r.rep_id === 'usr_rep1' && r.batch === 'B1');
  assert.deepEqual(samples.map((r) => [r.type, r.qty, r.call_id, r.signed]), [['issued', '10', '', ''], ['given', '2', 'cx', 'yes']]);

  assert.deepEqual(table(exportTasks(s)).map((r) => r.task_id), ['t1'], 'deleted people’s tasks are left out');
  assert.equal(table(exportLeave(s))[0].days, '3');
  const ev = table(exportEvents(s));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].invited, '1');
  assert.deepEqual(table(exportEventAttendees(s))[0], { event_id: 'ev1', account_id: s.events![0].attendees[0].accountId, status: 'Invited' });

  // The folder copies add ids at the end; the in-app exports stay as they were.
  assert.deepEqual(headerOf(exportCalls(s, true)).slice(-2), ['rep_id', 'account_id']);
  assert.equal(headerOf(exportCalls(s)).at(-1), 'submitted_at');
  assert.deepEqual(headerOf(exportUsers(s, true)).slice(-2), ['id', 'manager_id']);
});

test('live data: the data model describes every column of every file', () => {
  const s = withExtras();
  const build: Partial<Record<string, string>> = {
    calls: exportCalls(s, true), users: exportUsers(s, true), callProducts: exportCallProducts(s), callObjectives: exportCallObjectives(s), presentations: exportPresentations(s),
    samples: exportSampleMovements(s), tasks: exportTasks(s), leave: exportLeave(s), events: exportEvents(s), eventAttendees: exportEventAttendees(s),
  };
  for (const m of DATA_MODEL) {
    const csv = build[m.file];
    if (csv) assert.deepEqual(m.columns.map((c) => c[0]), headerOf(csv), m.file);
  }
  for (const name of Object.values(DATA_MODEL_FILES)) assert.match(name, /^Ava CRM - [A-Za-z0-9 ._-]{1,60}\.csv$/);
  const model = table(exportDataModel(new Date('2026-10-03T11:00:00Z')));
  assert.match(model[0].meaning, /2026-10-03T11:00:00.000Z/);
  assert.ok(model.some((r) => r.file === DATA_MODEL_FILES.callProducts && r.column === 'call_id' && r.joins_to === 'calls.call_id'));
});

test('calendar items: planned visits and organised events, today to 60 days ahead', () => {
  const s = withExtras();
  const acc = s.accounts.find((a) => a.id === s.calls.find((c) => c.id === 'cp')!.accountId)!;
  const items = calendarItems(s, 'usr_rep1', now);
  const visit = items.find((i) => i.key === 'call:cp')!;
  assert.equal(visit.title, `Visit: ${acc.name}`);
  assert.equal(visit.end.getTime() - visit.start.getTime(), 30 * 60 * 1000);
  assert.equal(visit.notes, 'Objectives:\n- Share new data');
  assert.ok(!items.some((i) => i.key === 'call:cx'), 'recorded calls are not planned');
  const ev = items.find((i) => i.key === 'event:ev1')!;
  assert.equal(ev.title, 'CME: Cardiology CME');
  assert.equal(ev.location, 'Eko Hotel, Lagos');
  assert.equal(ev.end.getTime() - ev.start.getTime(), 2 * 60 * 60 * 1000);
  assert.equal(ev.start.getHours(), 18);
  assert.equal(calendarItems(s, 'usr_rep1', new Date('2026-12-30T12:00:00')).length, 0, 'past items are left out');
  assert.equal(calendarItems(s, 'usr_rep1', new Date('2026-07-01T12:00:00')).length, 0, 'more than 60 days ahead is left out');
  assert.ok(items.every((i, k) => k === 0 || items[k - 1].start <= i.start), 'soonest first');
});

test('ics: CRLF, UTC times, a UID per key, escaped and folded text', () => {
  const ics = buildIcs(
    [{ key: 'call:c1', title: 'Visit: Dr Bello, Ikeja; clinic', start: new Date('2026-10-06T09:00:00Z'), end: new Date('2026-10-06T09:30:00Z'), location: '1 Allen Ave, Ikeja', notes: 'Objectives:\n- A\\B' }],
    new Date('2026-10-03T12:00:00Z'),
  );
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
  assert.match(ics, /\r\nUID:call:c1@ava-crm\r\n/);
  assert.match(ics, /\r\nDTSTART:20261006T090000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261006T093000Z\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20261003T120000Z\r\n/);
  assert.match(ics, /SUMMARY:Visit: Dr Bello\\, Ikeja\; clinic/);
  assert.match(ics, /DESCRIPTION:Objectives:\\n- A\\\\B/);
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  const long = icsFold(`SUMMARY:${'é'.repeat(80)}`);
  for (const line of long.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.equal(long.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), `SUMMARY:${'é'.repeat(80)}`);
});
