import { addDays, toDateKey } from './dates';
import type { Account, Call } from './types';
import type { Snapshot } from './storage';

/** Fictional demo territory so the app is usable on first launch. */
export function buildSeed(now = new Date()): Snapshot {
  const created = now.toISOString();
  const a = (p: Omit<Account, 'createdAt'>): Account => ({ ...p, createdAt: created });

  const accounts: Account[] = [
    a({ id: 'acc_hco1', type: 'HCO', name: 'Riverside General Hospital', specialty: 'Teaching hospital', tier: 'A', address: '12 Harbour Rd', city: 'Lakeview', phone: '+1 555 0100' }),
    a({ id: 'acc_hco2', type: 'HCO', name: 'Northgate Family Clinic', specialty: 'Primary care clinic', tier: 'B', address: '88 North Ave', city: 'Lakeview', phone: '+1 555 0144' }),
    a({ id: 'acc_hco3', type: 'HCO', name: 'Elm Street Pharmacy', specialty: 'Retail pharmacy', tier: 'C', address: '5 Elm St', city: 'Brookfield' }),
    a({ id: 'acc_hcp1', type: 'HCP', name: 'Dr. Amara Okafor', specialty: 'Cardiology', affiliation: 'Riverside General Hospital', tier: 'A', address: '12 Harbour Rd', city: 'Lakeview', email: 'a.okafor@example.com' }),
    a({ id: 'acc_hcp2', type: 'HCP', name: 'Dr. Daniel Reyes', specialty: 'Endocrinology', affiliation: 'Riverside General Hospital', tier: 'A', address: '12 Harbour Rd', city: 'Lakeview' }),
    a({ id: 'acc_hcp3', type: 'HCP', name: 'Dr. Mei Lin', specialty: 'General Practice', affiliation: 'Northgate Family Clinic', tier: 'B', address: '88 North Ave', city: 'Lakeview', phone: '+1 555 0145' }),
    a({ id: 'acc_hcp4', type: 'HCP', name: 'Dr. Tomasz Nowak', specialty: 'Pulmonology', affiliation: 'Riverside General Hospital', tier: 'B', address: '12 Harbour Rd', city: 'Lakeview' }),
    a({ id: 'acc_hcp5', type: 'HCP', name: 'Sarah Bennett, PharmD', specialty: 'Pharmacist', affiliation: 'Elm Street Pharmacy', tier: 'C', address: '5 Elm St', city: 'Brookfield' }),
    a({ id: 'acc_hcp6', type: 'HCP', name: 'Dr. Kwame Mensah', specialty: 'Neurology', tier: 'B', address: '301 Cedar Blvd', city: 'Brookfield' }),
  ];

  const at = (daysFromNow: number, h: number, m = 0) => {
    const d = addDays(now, daysFromNow);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const c = (p: Omit<Call, 'createdAt' | 'updatedAt'>): Call => ({ ...p, createdAt: created, updatedAt: created });

  const calls: Call[] = [
    c({ id: 'call_1', accountId: 'acc_hcp1', datetime: at(-9, 10), channel: 'In person', status: 'Submitted', submittedAt: at(-9, 11),
        products: [{ product: 'Cardiovex', priority: 1 }], keyMessages: ['Efficacy vs. standard of care', 'Safety profile'],
        notes: 'Interested in the new outcomes data. Asked for the full study PDF.', nextStep: 'Bring outcomes study summary',
        followUpDate: toDateKey(addDays(now, 2)) }),
    c({ id: 'call_2', accountId: 'acc_hcp3', datetime: at(-4, 14, 30), channel: 'Phone', status: 'Submitted', submittedAt: at(-4, 15),
        products: [{ product: 'Glucara XR', priority: 1 }], keyMessages: ['Patient support programme'], notes: 'Has 3 patients who may qualify for the support programme.' }),
    c({ id: 'call_3', accountId: 'acc_hcp2', datetime: at(-1, 9), channel: 'In person', status: 'Saved',
        products: [{ product: 'Glucara XR', priority: 1 }, { product: 'Cardiovex', priority: 2 }], keyMessages: ['HbA1c reduction'], notes: 'Draft, finish notes before submitting.' }),
    c({ id: 'call_4', accountId: 'acc_hcp4', datetime: at(0, 11), channel: 'In person', status: 'Planned', products: [{ product: 'Respira Inhaler', priority: 1 }], keyMessages: [] }),
    c({ id: 'call_5', accountId: 'acc_hco2', datetime: at(0, 15), channel: 'In person', status: 'Planned', products: [], keyMessages: [], notes: 'Lunch & learn with clinic staff.' }),
    c({ id: 'call_6', accountId: 'acc_hcp6', datetime: at(1, 10, 30), channel: 'Video', status: 'Planned', products: [{ product: 'Neurolin', priority: 1 }], keyMessages: [] }),
  ];

  return { accounts, calls };
}
