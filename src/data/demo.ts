import { addDays, toDateKey } from './dates';
import { buildSeed } from './seed';
import { ERP_DEFAULTS, ERP_RULES_V2 } from './types';
import type { Snapshot } from './types';

/** Demo roles offered on the sign-in screen, and the demo person each one signs in as. */
export const DEMO_ROLES = [
  { key: 'rep', label: 'Sales rep', userId: 'usr_rep1', hint: 'Plan visits, log calls, present, hand out samples' },
  { key: 'flm', label: 'First-line manager', userId: 'usr_flm1', hint: 'Approve plans, coach, the weekly summary' },
  { key: 'slm', label: 'Regional manager', userId: 'usr_slm', hint: 'Teams across the region' },
  { key: 'finance', label: 'Finance', userId: 'usr_fin', hint: 'Confirm payments, invoice orders, debt age, credit' },
  { key: 'marketing', label: 'Marketing', userId: 'usr_mkt', hint: 'Campaigns, content library, products' },
  { key: 'medical', label: 'Medical', userId: 'usr_med', hint: 'Safety reports, approve marketing material' },
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

  // 2.13: the new order and finance flow. A Finance person who also invoices, the regional manager
  // approves credit, two distributors, orders waiting and on hold, and a payment to confirm.
  s.settings = { ...s.settings, erp: { ...ERP_DEFAULTS, ...s.settings.erp, ...ERP_RULES_V2 } };
  s.users.push({ id: 'usr_fin', name: 'Ngozi Udeh', email: 'finance@ava.demo', role: 'SLM', territory: 'Head office', functions: ['finance', 'invoicing'], active: true, createdAt: iso(-200) });
  const slm = s.users.find((u) => u.id === 'usr_slm');
  if (slm) slm.functions = ['creditApprover'];
  s.distributors = [
    { id: 'dst_demo1', name: 'Mega Lifesciences Distributors', city: 'Lagos', active: true, createdAt: iso(-90) },
    { id: 'dst_demo2', name: 'Bond Pharma Wholesale', city: 'Ibadan', active: true, createdAt: iso(-60) },
  ];
  const price = (name: string) => s.products.find((p) => p.name === name)?.price ?? 0;
  if (orgs[0]) {
    s.orders = [
      { id: 'ord_demo1', number: 'ORD-REP1-0001', accountId: orgs[0].id, ownerId: 'usr_rep1', channel: 'Direct', lines: [{ product: 'Cardiovex', qty: 20, unitPrice: price('Cardiovex') }], deliveryDate: toDateKey(addDays(now, 1)), status: 'Submitted', payFirst: true, createdAt: iso(0, 8) },
      { id: 'ord_demo2', number: 'ORD-REP1-0002', accountId: orgs[0].id, ownerId: 'usr_rep1', channel: 'Direct', lines: [{ product: 'Glucara XR', qty: 200, unitPrice: price('Glucara XR'), discountPercent: 15 }], status: 'On hold', holds: ['credit', 'discount'], payFirst: true, createdAt: iso(-1, 16) },
      ...(orgs[1] ? [{ id: 'ord_demo3', number: 'ORD-REP1-0003', accountId: orgs[1].id, ownerId: 'usr_rep1', channel: 'Distributor' as const, distributorId: 'dst_demo1', lines: [{ product: 'Respira Inhaler', qty: 30, unitPrice: price('Respira Inhaler') }], status: 'Submitted' as const, createdAt: iso(-1, 10) }] : []),
    ];
    if (orgs[1]) Object.assign(orgs[1], { channel: 'Distributor', distributorId: 'dst_demo1' });
    const unpaid = (s.invoices ?? []).filter((i) => !i.voidedAt && i.payments.length === 0 && i.ownerId.startsWith('usr_rep'));
    const owing = unpaid.find((i) => i.ownerId === 'usr_rep1') ?? unpaid[0];
    if (owing) s.paymentClaims = [{ id: 'pcl_demo1', accountId: owing.accountId, invoiceId: owing.id, amount: Math.min(25000, Math.round(owing.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0) / 2)), method: 'Transfer', date: toDateKey(addDays(now, -1)), reference: 'GTB-TRF-883120', byId: owing.ownerId, at: iso(-1, 17), status: 'Pending' }];
    // 2.14: a return waiting for Finance and a promise to pay.
    const paidInv = (s.invoices ?? []).find((i) => i.ownerId === 'usr_rep1' && i.payments.length);
    if (paidInv) s.returns = [{ id: 'rtn_demo1', invoiceId: paidInv.id, accountId: paidInv.accountId, lines: [{ product: paidInv.lines[0].product, qty: Math.min(2, paidInv.lines[0].qty) }], condition: 'Damaged', reason: 'Cartons crushed in delivery', byId: 'usr_rep1', at: iso(-1, 12), status: 'Pending' }];
    if (owing) s.promises = [{ id: 'prm_demo1', accountId: owing.accountId, amount: 50000, date: toDateKey(addDays(now, 4)), note: 'Pharmacist promised after month-end', byId: owing.ownerId, at: iso(-2, 15) }];
  }

  // 2.14 and 2.15: batches with expiry, a Marketing and a Medical person, a campaign, approved and
  // waiting material, a safety report, an expense, targets, and a key account manager.
  for (const [i, m] of (s.stockMoves ?? []).filter((x) => x.kind === 'receive').entries()) m.expiry = toDateKey(addDays(now, i === 0 ? 60 : 420 + i * 30));
  s.users.push(
    { id: 'usr_mkt', name: 'Bisi Adeyemi', email: 'marketing@ava.demo', role: 'SLM', territory: 'Head office', functions: ['marketing'], active: true, createdAt: iso(-180) },
    { id: 'usr_med', name: 'Dr. Tobi Ogunleye', email: 'medical@ava.demo', role: 'SLM', territory: 'Head office', functions: ['medical'], active: true, createdAt: iso(-180) },
  );
  const month = toDateKey(now).slice(0, 7);
  s.targets = ['usr_rep1', 'usr_rep2', 'usr_rep3'].map((u, i) => ({ id: `tgt_demo${i + 1}`, userId: u, month, sales: 1500000 + i * 250000, collection: 1200000, calls: 60, setBy: 'usr_flm1', at: iso(-20) }));
  s.content = [
    { id: 'cnt_demo1', title: 'Cardiovex detail aid', product: 'Cardiovex', kind: 'Detail aid', url: 'https://avahealthcareltd.com/AvaCRM/', version: 2, status: 'Approved', endDate: toDateKey(addDays(now, 200)), code: 'NG-CVX-2026-014', byId: 'usr_mkt', at: iso(-30), reviewedBy: 'usr_med', reviewedAt: iso(-28) },
    { id: 'cnt_demo2', title: 'Glucara XR patient leaflet', product: 'Glucara XR', kind: 'Leave piece', url: 'https://avahealthcareltd.com/AvaCRM/', version: 1, status: 'Pending', byId: 'usr_mkt', at: iso(-1, 10) },
  ];
  const all = s.accounts.filter((a) => a.type === 'HCP' && !a.deletedAt);
  s.campaigns = [{ id: 'cmp_demo1', name: 'Glucara XR diabetes push', product: 'Glucara XR', keyMessages: ['Once daily', 'HbA1c down 1.2% in 12 weeks'], objectives: [], targetIds: all.filter((a) => a.tier === 'ST' || a.tier === 'T1').map((a) => a.id), tiers: ['ST', 'T1'], frequency: 2, start: toDateKey(addDays(now, -20)), end: toDateKey(addDays(now, 40)), status: 'Live', ownerId: 'usr_mkt', createdAt: iso(-21), updatedAt: iso(-21) }];
  if (hcps[0]) s.safetyReports = [{ id: 'pv_demo1', kind: 'Adverse event', product: 'Cardiovex', accountId: hcps[0].id, description: 'Patient (F, 58) reported dizziness two days after starting Cardiovex 10 mg; dose reduced, recovering.', patientAge: '58', patientSex: 'Female', onset: toDateKey(addDays(now, -4)), serious: false, byId: 'usr_rep1', at: iso(-2, 14), status: 'New' }];
  s.expenses = [
    { id: 'exp_demo1', userId: 'usr_rep1', date: toDateKey(addDays(now, -2)), category: 'Transport', amount: 6500, note: 'Taxi to Lagos Island hospitals', status: 'Pending', at: iso(-2, 18) },
    { id: 'exp_demo2', userId: 'usr_rep2', date: toDateKey(addDays(now, -6)), category: 'Meals', amount: 12000, note: 'Lunch meeting with pharmacists', status: 'Approved', at: iso(-6, 18), decidedBy: 'usr_flm1', decidedAt: iso(-5) },
  ];
  return s;
}
