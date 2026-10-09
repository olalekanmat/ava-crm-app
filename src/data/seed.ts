import { addDays, toDateKey } from './dates';
import { distanceM } from './geo';
import { tierFrequency } from './tiers';
import type { Account, Call, CallChannel, Company, Cycle, CyclePlan, Leave, Product, SampleIssue, Snapshot, Task, User } from './types';
import { DEFAULT_SETTINGS, DEFAULT_TIERS } from './types';

/** Small deterministic PRNG so the demo looks the same on every device. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_PRODUCTS: Product[] = [
  { id: 'prd_cardiovex', name: 'Cardiovex', keyMessages: ['Efficacy vs. standard of care', 'Once-daily dosing', 'Safety profile'], active: true },
  { id: 'prd_glucara', name: 'Glucara XR', keyMessages: ['HbA1c reduction', 'Weight-neutral', 'Patient support programme'], active: true },
  { id: 'prd_respira', name: 'Respira Inhaler', keyMessages: ['Inhaler technique', 'Exacerbation reduction', 'Formulary status'], active: true },
  { id: 'prd_neurolin', name: 'Neurolin', keyMessages: ['Onset of action', 'Tolerability', 'New indication'], active: true },
];

/** Fictional organisation: one region, two districts, four reps. */
const PEOPLE: Omit<User, 'createdAt' | 'active'>[] = [
  { id: 'usr_admin', name: 'Grace Adeyemi', email: 'admin@ava.demo', role: 'Admin', territory: 'Head office' },
  { id: 'usr_slm', name: 'Michael Osei', email: 'slm@ava.demo', role: 'SLM', territory: 'West Africa region' },
  { id: 'usr_flm1', name: 'Aisha Bello', email: 'flm.mainland@ava.demo', role: 'FLM', managerId: 'usr_slm', territory: 'Lagos Mainland' },
  { id: 'usr_flm2', name: 'David Mensah', email: 'flm.island@ava.demo', role: 'FLM', managerId: 'usr_slm', territory: 'Lagos Island' },
  { id: 'usr_rep1', name: 'Tunde Okoro', email: 'tunde@ava.demo', role: 'Rep', managerId: 'usr_flm1', territory: 'Ikeja' },
  { id: 'usr_rep2', name: 'Chioma Eze', email: 'chioma@ava.demo', role: 'Rep', managerId: 'usr_flm1', territory: 'Yaba' },
  { id: 'usr_rep3', name: 'Kemi Lawal', email: 'kemi@ava.demo', role: 'Rep', managerId: 'usr_flm2', territory: 'Victoria Island' },
  { id: 'usr_rep4', name: 'Emeka Obi', email: 'emeka@ava.demo', role: 'Rep', managerId: 'usr_flm2', territory: 'Lekki' },
];

/** Per rep: territory centre, call pace (share of plan done so far), check-in discipline. */
const REP_PROFILE: Record<string, { center: [number, number]; pace: number; geo: number; plan: CyclePlan['status'] | null }> = {
  usr_rep1: { center: [6.6018, 3.3515], pace: 1.05, geo: 0.95, plan: 'Approved' },
  usr_rep2: { center: [6.5095, 3.3711], pace: 0.7, geo: 0.88, plan: 'Submitted' },
  usr_rep3: { center: [6.4281, 3.4219], pace: 0.9, geo: 0.9, plan: 'Approved' },
  usr_rep4: { center: [6.4474, 3.4723], pace: 0.45, geo: 0.6, plan: 'Draft' },
};

const ORG_KINDS = ['Teaching hospital', 'Specialist hospital', 'Family clinic', 'Retail pharmacy', 'Diagnostic centre'];
const SPECIALTIES = ['Cardiology', 'Endocrinology', 'General Practice', 'Pulmonology', 'Neurology', 'Internal Medicine', 'Pharmacist'];
const FIRST = ['Amara', 'Daniel', 'Mei', 'Tomasz', 'Sarah', 'Kwame', 'Ifeoma', 'Yusuf', 'Bola', 'Nadia', 'Samuel', 'Zainab', 'Peter', 'Funmi', 'Olu', 'Hannah', 'Ibrahim', 'Ngozi', 'Victor', 'Lara', 'Chidi', 'Ruth', 'Segun', 'Esther'];
const LAST = ['Okafor', 'Reyes', 'Lin', 'Nowak', 'Bennett', 'Mensah', 'Nwosu', 'Abubakar', 'Adebayo', 'Hassan', 'Ogun', 'Danjuma', 'Akande', 'Balogun', 'Coker', 'Idowu'];
const ORG_NAMES = ['Lakeside', 'Harbour View', 'St. Luke', 'Palmgrove', 'Unity', 'Crescent', 'Riverbend', 'Greenfield', 'Mercy', 'Sunrise', 'Cedar', 'Northgate'];
const NOTES = [
  'Interested in the new outcomes data. Asked for the full study PDF.',
  'Has several patients who may qualify for the support programme.',
  'Concerned about formulary access at the hospital pharmacy.',
  'Positive on once-daily dosing; wants patient leaflets.',
  'Short call between clinics. Follow up with dosing card.',
  'Asked about tolerability in elderly patients.',
  'Discussed inhaler technique training for nurses.',
];
const NEXT = ['Bring outcomes study summary', 'Drop off patient leaflets', 'Book lunch & learn', 'Share formulary dossier', 'Introduce MSL for clinical questions'];

const freq = (tier: string) => tierFrequency(DEFAULT_TIERS, tier);

export const DEMO_COMPANY: Company = {
  name: 'Ava Demo Pharma',
  address: '12 Adeola Odeku St, Victoria Island',
  city: 'Lagos',
  country: 'Nigeria',
  phone: '+234 1 000 0000',
  email: 'info@example.com',
  website: 'https://example.com',
};

/** Fictional demo data, laid out relative to `now` so it always looks current. */
export function buildSeed(now = new Date()): Snapshot {
  const rand = rng(20261003);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const created = addDays(now, -120).toISOString();
  const users: User[] = PEOPLE.map((p) => ({ ...p, active: true, createdAt: created }));

  const cycleStart = addDays(now, -24);
  const cycles: Cycle[] = [
    { id: 'cyc_prev', name: 'Cycle 3', start: toDateKey(addDays(cycleStart, -56)), end: toDateKey(addDays(cycleStart, -1)) },
    { id: 'cyc_now', name: 'Cycle 4', start: toDateKey(cycleStart), end: toDateKey(addDays(cycleStart, 55)) },
    { id: 'cyc_next', name: 'Cycle 5', start: toDateKey(addDays(cycleStart, 56)), end: toDateKey(addDays(cycleStart, 111)) },
  ];

  const accounts: Account[] = [];
  const calls: Call[] = [];
  const plans: CyclePlan[] = [];
  let n = 0;
  let orgIdx = 0;
  let personIdx = 0;

  const jitter = (c: [number, number], km: number): [number, number] => [c[0] + (rand() - 0.5) * (km / 55), c[1] + (rand() - 0.5) * (km / 55)];

  for (const rep of users.filter((u) => u.role === 'Rep')) {
    const prof = REP_PROFILE[rep.id];
    const mine: Account[] = [];
    // Organisations first, so people can be affiliated with them.
    for (let i = 0; i < 3; i++) {
      const kind = ORG_KINDS[(orgIdx + i) % ORG_KINDS.length];
      const [lat, lng] = jitter(prof.center, 4);
      mine.push({
        id: `acc_${++n}`, type: 'HCO', name: `${ORG_NAMES[orgIdx++ % ORG_NAMES.length]} ${kind.split(' ').slice(-1)[0].replace(/^\w/, (c) => c.toUpperCase())}`,
        specialty: kind, tier: i === 0 ? 'ST' : i === 1 ? 'T1' : 'T2', address: `${10 + Math.floor(rand() * 180)} ${pick(['Allen Ave', 'Herbert Macaulay Way', 'Adeola Odeku St', 'Admiralty Way', 'Ikorodu Rd', 'Awolowo Rd'])}`,
        city: rep.territory ?? 'Lagos', phone: `+234 80${Math.floor(10000000 + rand() * 89999999)}`, ownerId: rep.id, lat: +lat.toFixed(6), lng: +lng.toFixed(6), createdAt: created,
      });
    }
    for (let i = 0; i < 6; i++) {
      const org = mine[i % 3];
      const spec = SPECIALTIES[(personIdx + i) % SPECIALTIES.length];
      const name = `${spec === 'Pharmacist' ? '' : 'Dr. '}${FIRST[personIdx % FIRST.length]} ${LAST[(personIdx * 7) % LAST.length]}${spec === 'Pharmacist' ? ', PharmD' : ''}`;
      personIdx++;
      const atOrg = rand() < 0.8;
      const [lat, lng] = atOrg ? [org.lat! + (rand() - 0.5) * 0.0008, org.lng! + (rand() - 0.5) * 0.0008] : jitter(prof.center, 5);
      mine.push({
        id: `acc_${++n}`, type: 'HCP', name, specialty: spec, affiliation: atOrg ? org.name : undefined, tier: i < 1 ? 'ST' : i < 3 ? 'T1' : i < 5 ? 'T2' : 'T3',
        address: atOrg ? org.address : `${5 + Math.floor(rand() * 90)} ${pick(['Opebi Rd', 'Bode Thomas St', 'Ozumba Mbadiwe Ave', 'Lekki-Epe Expy'])}`,
        city: rep.territory ?? 'Lagos', email: `${name.replace(/^Dr\. /, '').split(/[ ,]/)[0].toLowerCase()}@example.com`, ownerId: rep.id,
        lat: +lat.toFixed(6), lng: +lng.toFixed(6), createdAt: created,
      });
    }
    // One account without a pinned location, to show how pinning works.
    delete mine[mine.length - 1].lat;
    delete mine[mine.length - 1].lng;
    accounts.push(...mine);

    // Plan for the current cycle: every account at its tier frequency.
    if (prof.plan) {
      plans.push({
        id: `pln_${rep.id}`, ownerId: rep.id, cycleId: 'cyc_now', status: prof.plan,
        targets: mine.map((a) => ({ accountId: a.id, planned: freq(a.tier) })),
        submittedAt: prof.plan !== 'Draft' ? addDays(cycleStart, 1).toISOString() : undefined,
        reviewedAt: prof.plan === 'Approved' ? addDays(cycleStart, 2).toISOString() : undefined,
        reviewerId: prof.plan === 'Approved' ? rep.managerId : undefined,
        updatedAt: addDays(cycleStart, 2).toISOString(),
      });
    }

    // Submitted call history: from 40 days ago until yesterday, paced per rep.
    const elapsed = 24 / 56;
    for (const a of mine) {
      const due = Math.round(freq(a.tier) * elapsed * prof.pace + (rand() - 0.4));
      const history = due + (rand() < 0.5 ? 1 : 0); // a few calls from the previous cycle
      for (let k = 0; k < history; k++) {
        const inPrev = k >= due;
        const daysAgo = inPrev ? 25 + Math.floor(rand() * 15) : 1 + Math.floor(rand() * 23);
        const d = addDays(now, -daysAgo);
        if (d.getDay() === 0) d.setDate(d.getDate() + 1);
        if (d.getDay() === 6) d.setDate(d.getDate() - 1);
        d.setHours(9 + Math.floor(rand() * 8), rand() < 0.5 ? 0 : 30, 0, 0);
        if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 2);
        const channel: CallChannel = rand() < 0.8 ? 'In person' : pick(['Phone', 'Video'] as CallChannel[]);
        const prods = [DEMO_PRODUCTS[Math.floor(rand() * 4)]];
        if (rand() < 0.35) prods.push(DEMO_PRODUCTS[(DEMO_PRODUCTS.indexOf(prods[0]) + 1) % 4]);
        let checkIn: Call['checkIn'];
        if (channel === 'In person' && a.lat !== undefined && a.lng !== undefined) {
          const r = rand();
          if (r < prof.geo) {
            const [lat, lng] = [a.lat + (rand() - 0.5) * 0.002, a.lng + (rand() - 0.5) * 0.002];
            checkIn = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), accuracy: 10 + Math.floor(rand() * 30), at: d.toISOString(), distanceM: distanceM({ lat, lng }, { lat: a.lat, lng: a.lng }) };
          } else if (r < prof.geo + (1 - prof.geo) / 2) {
            const [lat, lng] = jitter([a.lat, a.lng], 6);
            checkIn = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), accuracy: 25, at: d.toISOString(), distanceM: distanceM({ lat, lng }, { lat: a.lat, lng: a.lng }) };
          }
        }
        const id = `call_${calls.length + 1}`;
        calls.push({
          id, accountId: a.id, ownerId: rep.id, datetime: d.toISOString(), channel, status: 'Submitted',
          products: prods.map((p, i) => ({ product: p.name, priority: i + 1 })),
          keyMessages: prods.flatMap((p) => p.keyMessages.filter(() => rand() < 0.5)).slice(0, 3),
          notes: rand() < 0.7 ? pick(NOTES) : undefined,
          nextStep: rand() < 0.3 ? pick(NEXT) : undefined,
          followUpDate: rand() < 0.2 ? toDateKey(addDays(now, Math.floor(rand() * 7))) : undefined,
          checkIn, createdAt: d.toISOString(), updatedAt: d.toISOString(), submittedAt: new Date(d.getTime() + 3600000).toISOString(),
        });
      }
    }

    // Today: two planned calls; a draft from yesterday for some reps.
    const at = (days: number, h: number, m = 0) => {
      const d = addDays(now, days);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
    const planned = (acc: Account, iso: string, products: string[], notes?: string): Call => ({
      id: `call_${calls.length + 1}`, accountId: acc.id, ownerId: rep.id, datetime: iso, channel: 'In person', status: 'Planned',
      products: products.map((p, i) => ({ product: p, priority: i + 1 })), keyMessages: [], notes, createdAt: created, updatedAt: created,
    });
    calls.push(planned(mine[3], at(0, 10, 30), ['Cardiovex']));
    calls.push(planned(mine[0], at(0, 14), [], 'Lunch & learn with clinic staff.'));
    calls.push(planned(mine[5], at(1, 9, 30), ['Glucara XR']));
    // Coming up, and one planned call that was missed, for the calendar.
    calls.push(planned(mine[1], at(-2, 11), ['Cardiovex'], 'Missed: clinic closed early.'));
    calls.push(planned(mine[6], at(3, 10), ['Glucara XR']));
    calls.push(planned(mine[2], at(6, 15), ['Respira Inhaler']));
    calls.push(planned(mine[7], at(9, 11, 30), ['Cardiovex']));
    if (prof.pace < 1) {
      calls.push({
        ...planned(mine[4], at(-1, 16), ['Respira Inhaler']), status: 'Saved', channel: 'In person',
        keyMessages: ['Inhaler technique'], notes: 'Draft: finish notes before submitting.',
      });
    }
  }

  // 2.6 field work, added after the random data so the rest of the seed stays the same.
  const iso = (days: number, h = 9) => {
    const d = addDays(now, days);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  for (const rep of users.filter((u) => u.role === 'Rep')) {
    const mine = accounts.filter((a) => a.ownerId === rep.id && a.type === 'HCP');
    Object.assign(mine[0], { kol: true, potential: 'High', segment: 'Opinion leader' });
    Object.assign(mine[1], { potential: 'High', segment: 'Early adopter' });
    Object.assign(mine[3], { potential: 'Medium', segment: 'Loyalist' });
    Object.assign(mine[5], { potential: 'Low' });
  }
  const samples: SampleIssue[] = users
    .filter((u) => u.role === 'Rep')
    .flatMap((u, i) => [
      { id: `smp_${u.id}_1`, repId: u.id, product: 'Cardiovex', qty: 40 - i * 5, batch: 'CVX-2609', byId: u.managerId!, at: iso(-20) },
      { id: `smp_${u.id}_2`, repId: u.id, product: 'Glucara XR', qty: 24, batch: 'GLX-0910', byId: u.managerId!, at: iso(-12) },
    ]);
  const own = (id: string) => calls.filter((c) => c.ownerId === id && c.status === 'Submitted' && c.channel === 'In person');
  for (const c of own('usr_rep1').slice(0, 3)) c.samples = [{ product: 'Cardiovex', qty: 2, batch: 'CVX-2609' }];
  const coached = own('usr_rep1')[1];
  if (coached) {
    coached.coachId = 'usr_flm1';
    coached.coaching = { by: 'usr_flm1', at: coached.submittedAt ?? coached.datetime, scores: { Opening: 4, 'Needs discovery': 3, 'Product knowledge': 5, 'Objection handling': 3, Closing: 2, Compliance: 5 }, strengths: 'Strong product knowledge and a clear opening.', improve: 'Ask for a commitment before you leave.' };
  }
  const waiting = own('usr_rep2')[0];
  if (waiting) waiting.coachId = 'usr_flm1';
  const leaves: Leave[] = [
    { id: 'lv_rep1', userId: 'usr_rep1', start: toDateKey(addDays(now, 10)), end: toDateKey(addDays(now, 14)), kind: 'Annual', status: 'Approved', reviewerId: 'usr_flm1', reviewedAt: iso(-3), createdAt: iso(-5) },
    { id: 'lv_rep2', userId: 'usr_rep2', start: toDateKey(addDays(now, 20)), end: toDateKey(addDays(now, 21)), kind: 'Training', note: 'Product launch training', status: 'Pending', createdAt: iso(-1) },
  ];
  const repOne = accounts.filter((a) => a.ownerId === 'usr_rep1' && a.type === 'HCP');
  const tasks: Task[] = [
    { id: 'tsk_1', ownerId: 'usr_rep1', title: 'Send the outcomes study reprint', due: toDateKey(now), remindAt: '16:00', accountId: repOne[0].id, createdAt: iso(-2) },
    { id: 'tsk_2', ownerId: 'usr_rep1', title: 'Confirm the lunch & learn headcount', due: toDateKey(addDays(now, -1)), accountId: repOne[2].id, createdAt: iso(-4) },
    { id: 'tsk_3', ownerId: 'usr_rep1', title: 'Update the pharmacy stock list', due: toDateKey(addDays(now, 2)), assignedBy: 'usr_flm1', createdAt: iso(-1) },
  ];
  const products = DEMO_PRODUCTS.map((p, i) => (i < 2 ? { ...p, brochureUrl: `https://example.com/brochures/${p.name.toLowerCase().replace(/\W+/g, '-')}.pdf` } : p));

  return { company: { ...DEMO_COMPANY }, users, accounts, calls, plans, cycles, products, settings: { ...DEFAULT_SETTINGS }, leaves, tasks, samples };
}

