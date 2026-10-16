import type { User } from './types';

const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Compares "2.9.0"-style versions; a missing or odd version counts as 0.0.0 (apps before 2.9 send none). */
export function compareVersions(a?: string, b?: string): number {
  const p = (v?: string) => (v && VERSION_RE.test(v) ? v.split('.').map(Number) : [0, 0, 0]);
  const x = p(a);
  const y = p(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export interface SeenDevice {
  userId: string;
  v?: string;
  p?: string;
  at: string;
}

/** People grouped by the app version they last synced with, newest version first; unknown last. */
export function versionGroups(users: User[], devices: SeenDevice[]): { label: string; people: { user: User; device?: SeenDevice }[] }[] {
  const by = new Map<string, { user: User; device?: SeenDevice }[]>();
  for (const user of users) {
    const device = devices.find((d) => d.userId === user.id);
    const key = !device ? 'Not synced since 2.9' : device.v ? `Version ${device.v}` : 'Before 2.9';
    by.set(key, [...(by.get(key) ?? []), { user, device }]);
  }
  const rank = (label: string) => (label.startsWith('Version ') ? label.slice(8) : undefined);
  return [...by]
    .map(([label, people]) => ({ label, people: people.sort((a, b) => a.user.name.localeCompare(b.user.name)) }))
    .sort((a, b) => {
      const x = rank(a.label);
      const y = rank(b.label);
      if (x && y) return compareVersions(y, x);
      if (x || y) return x ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

/** What's new screen: shown once after the app updates to a version with notes (not on a fresh install). */
export interface ReleaseNote {
  version: string;
  items: { icon: string; title: string; body: string; who?: 'admin' | 'manager' | 'rep' }[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '2.11.0',
    items: [
      { icon: 'cart-outline', title: 'Ava ERP: sell and invoice', body: 'An optional add-on. Make a sale from a visit in a few taps, with a numbered invoice you can share as a PDF or on WhatsApp.' },
      { icon: 'cash-outline', title: 'Payments and balances', body: 'Record full or part payments with receipts, see what each customer owes, set credit limits and send statements.' },
      { icon: 'cube-outline', title: 'Stock', body: 'Warehouse and personal stock that goes down with every sale, with low-stock warnings.' },
      { icon: 'pie-chart-outline', title: 'Sales dashboard', body: 'Sales today and this month, money owed and overdue, top products and sales by person.', who: 'manager' },
      { icon: 'card-outline', title: 'Add Ava ERP', body: 'Switch it on during setup or add it from Company settings › Subscription on the web.', who: 'admin' },
    ],
  },
  {
    version: '2.10.0',
    items: [
      { icon: 'eye-outline', title: 'Sign in as a user', body: 'From Users & roles, open the app exactly as one of your people to see what they see or fix something for them. A banner takes you back; every time is listed for all administrators.', who: 'admin' },
      { icon: 'map-outline', title: 'Map fixed on phones', body: 'The accounts map now loads on Android and iPhone instead of showing “Access blocked”.' },
    ],
  },
  {
    version: '2.9.0',
    items: [
      { icon: 'map-outline', title: 'Accounts on a map', body: 'Doctors, pharmacies and hospitals on a map, coloured by tier. Overdue accounts stand out.' },
      { icon: 'repeat-outline', title: 'Repeat last call', body: 'Start a call from your last visit: products, key messages and objectives filled in.', who: 'rep' },
      { icon: 'calendar-outline', title: 'Next cycle in one tap', body: 'Start next cycle’s plan from this one, adjusted for tier changes and missed visits.', who: 'rep' },
      { icon: 'medkit-outline', title: 'Ask for samples', body: 'Request a restock from the Samples screen. Your manager approves and records it in one tap.' },
      { icon: 'trending-up-outline', title: 'Tier review', body: 'At the end of a cycle Ava suggests doctors to move up or down a tier. Managers approve.', who: 'manager' },
      { icon: 'swap-horizontal-outline', title: 'Handover', body: 'When someone leaves, move their accounts, plans, tasks, events and samples to another person in one step.', who: 'manager' },
      { icon: 'key-outline', title: 'Forgot password', body: 'Reset your own password with a code sent to your work email.' },
      { icon: 'shield-checkmark-outline', title: 'Safer admin sign-in', body: 'Administrators can require a code by email at sign-in, and see everyone’s app version.', who: 'admin' },
      { icon: 'grid-outline', title: 'Edit in a grid', body: 'On the web, edit many accounts or users at once in a spreadsheet-style grid, with undo.', who: 'admin' },
      { icon: 'flash-outline', title: 'Faster start', body: 'Older history is condensed, so Ava opens quickly in large companies.' },
    ],
  },
];
