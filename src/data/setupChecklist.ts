import type { Snapshot } from './types';

export interface SetupStep {
  key: 'company' | 'products' | 'accounts' | 'users' | 'invite' | 'cycle';
  title: string;
  hint: string;
  done: boolean;
  /** Where the step is done. */
  path: string;
  params?: Record<string, string>;
}

/** Ticks this device remembers (the data cannot tell): invitations sent, cycle settings checked. */
export interface SetupMarks {
  invited?: boolean;
  cycleChecked?: boolean;
  hidden?: boolean;
}

/** An administrator's first-run checklist (2.9). Each step ticks itself off from the company's data. */
export function setupSteps(s: Pick<Snapshot, 'company' | 'products' | 'accounts' | 'users'>, marks: SetupMarks = {}): SetupStep[] {
  const people = s.users.filter((u) => !u.deletedAt && u.role !== 'Admin');
  const c = s.company;
  return [
    { key: 'company', title: 'Company details', hint: 'Logo, address and phone appear on exports and reports.', done: !!(c.logo || c.address || c.phone), path: '/admin/company' },
    { key: 'products', title: 'Products and presentations', hint: 'Add products with their key messages; upload the approved slides.', done: s.products.some((p) => p.active), path: '/admin/settings' },
    { key: 'accounts', title: 'Import accounts', hint: 'Doctors, pharmacies and hospitals from a spreadsheet (CSV).', done: s.accounts.some((a) => !a.deletedAt), path: '/admin/import', params: { kind: 'accounts' } },
    { key: 'users', title: 'Add users', hint: 'Reps, first-line and second-line managers, with reporting lines.', done: people.length > 0, path: '/admin/users' },
    { key: 'invite', title: 'Invite your team', hint: 'Send each person the app link and company code by WhatsApp or email.', done: !!marks.invited, path: '/admin/users' },
    { key: 'cycle', title: 'Set the planning cycle', hint: 'Quarterly or monthly cycles, and tier frequencies.', done: !!marks.cycleChecked, path: '/admin/settings' },
  ];
}
