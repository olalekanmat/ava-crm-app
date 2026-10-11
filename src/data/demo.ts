import { addDays, toDateKey } from './dates';
import { buildSeed } from './seed';
import type { Snapshot } from './types';

/** Demo roles offered on the sign-in screen, and the demo person each one signs in as. */
export const DEMO_ROLES = [
  { key: 'rep', label: 'Sales rep', userId: 'usr_rep1', hint: 'Plan visits, log calls, present, hand out samples' },
  { key: 'flm', label: 'First-line manager', userId: 'usr_flm1', hint: 'Approve plans, coach, the weekly summary' },
  { key: 'slm', label: 'Regional manager', userId: 'usr_slm', hint: 'Teams across the region' },
  { key: 'admin', label: 'Administrator', userId: 'usr_admin', hint: 'Users, products, rules, duplicates' },
] as const;

/**
 * The demo company: the fictional seed plus examples of the 2.7 features (objectives, a doctor
 * at two hospitals, an event, a correction waiting for approval, a likely duplicate).
 * Laid out relative to `now`, so it always looks current. Nothing in it is ever uploaded.
 */
export function buildDemo(now = new Date()): Snapshot {
  const s = buildSeed(now);
  const iso = (days: number, h = 9) => {
    const d = addDays(now, days);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  const repAccounts = (id: string) => s.accounts.filter((a) => a.ownerId === id);
  const hcps = repAccounts('usr_rep1').filter((a) => a.type === 'HCP');
  const orgs = repAccounts('usr_rep1').filter((a) => a.type === 'HCO');

  // A doctor who also works at a second hospital.
  if (hcps[0] && orgs[1]) hcps[0].workplaces = [orgs[1].id];

  // Objectives on recent calls, one not achieved (Visit next suggests picking it up).
  const recent = s.calls.filter((c) => c.ownerId === 'usr_rep1' && c.status === 'Submitted').sort((a, b) => b.datetime.localeCompare(a.datetime));
  for (const [i, c] of recent.slice(0, 6).entries()) {
    c.objectives = i % 3 === 0 ? [{ text: 'Agree a trial with 5 patients', achieved: false }, { text: 'Share new clinical data', achieved: true }] : [{ text: 'Share new clinical data', achieved: true }];
    if (i < 2) c.reaction = i === 0 ? 'Positive' : 'Neutral';
  }

  // A likely duplicate (same doctor typed twice), for the Duplicates screen.
  if (hcps[1]) s.accounts.push({ ...hcps[1], id: 'acc_dup1', name: hcps[1].name.replace('Dr. ', 'Dr '), email: undefined, createdAt: iso(-3) });

  // A correction from the rep waiting for the manager, and a new account to confirm.
  if (hcps[2]) s.accountChanges = [{ id: 'chg_demo1', accountId: hcps[2].id, byId: 'usr_rep1', at: iso(-1, 15), changes: { phone: '+234 802 555 0147', address: '14 Allen Ave' }, note: 'New clinic number from the receptionist', status: 'Pending' }];
  const fresh = { ...hcps[3], id: 'acc_new1', name: 'Dr. Ifeoma Nnaji', specialty: 'Endocrinology', email: undefined, pendingReview: true, createdAt: iso(-1, 11) };
  if (hcps[3]) s.accounts.push(fresh);

  // An upcoming CME with invitations, and expiry dates on the sample batches.
  s.events = [
    {
      id: 'evt_demo1', title: 'Diabetes update CME', kind: 'CME', date: toDateKey(addDays(now, 5)), time: '12:30', venue: 'Eko Hotel, Room 3', city: 'Lagos', ownerId: 'usr_rep1',
      products: ['Glucara XR'], budget: 450000, spent: 0, status: 'Planned',
      attendees: hcps.slice(0, 4).map((a, i) => ({ accountId: a.id, status: i === 0 ? 'Confirmed' : 'Invited' })), notes: 'Lunch for 25. Speaker: Prof. Adewale.', createdAt: iso(-6), updatedAt: iso(-2),
    },
  ];
  for (const x of s.samples ?? []) x.expiry = x.product === 'Cardiovex' ? toDateKey(addDays(now, 50)).slice(0, 7) : toDateKey(addDays(now, 400)).slice(0, 7);
  s.settings = { ...s.settings, reviewNewAccounts: true, sampleSignature: 'optional' };
  return s;
}
