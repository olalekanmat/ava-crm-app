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
    version: '2.15.0',
    items: [
      { icon: 'calendar-outline', title: 'Plan visits by dragging', body: 'The Month and Week calendars list the doctors in your cycle plan with the visits still to book. Drag a doctor onto a day to plan a visit, or drag a visit to another day or time. On a phone, hold first, then drag.', who: 'rep' },
      { icon: 'apps-outline', title: 'Your desk on Home', body: 'Finance, Marketing, Medical, Warehouse and distributor users open on their own desk, and switch to their field home with one tap.' },
      { icon: 'return-down-back-outline', title: 'Returns and credit notes', body: 'Ava ERP: return goods from an invoice. Finance approves and a numbered credit note lowers the balance; resaleable stock goes back to the warehouse.' },
      { icon: 'create-outline', title: 'Proof of delivery', body: 'Record who received an invoice’s goods, with a signature or photo and the place.' },
      { icon: 'pricetags-outline', title: 'Price lists and repeat orders', body: 'Hospitals, pharmacies and distributors can each have their own prices. Repeat a customer’s last order in one tap; split an order to deliver part later.' },
      { icon: 'hourglass-outline', title: 'Batches and expiry', body: 'Receive stock with batch and expiry. Stock is used first-expiry-first-out and you are warned before it expires.' },
      { icon: 'call-outline', title: 'Collections', body: 'Overdue and due-soon customers, WhatsApp reminders, promises to pay (kept or broken) and your collection target.' },
      { icon: 'flag-outline', title: 'Targets', body: 'Monthly sales, collection and call targets per person, with progress.' },
      { icon: 'wallet-outline', title: 'Expenses', body: 'Claim expenses with a receipt photo. Your manager approves and Finance pays.' },
      { icon: 'warning-outline', title: 'Report a safety issue', body: 'Report an adverse event, product complaint or medical question from a call or More. Medical/Compliance is emailed at once.' },
      { icon: 'albums-outline', title: 'Content library and campaigns', body: 'Approved brochures and detail aids with versions and expiry, approved by Medical when switched on; campaigns with reach and frequency.' },
      { icon: 'people-outline', title: 'More roles', body: 'Medical, Warehouse, Key account manager, Read-only viewer and Distributor users, set in Users & roles.', who: 'admin' },
      { icon: 'git-network-outline', title: 'Distributor sales and accounting export', body: 'Distributors upload monthly sell-out to compare with what you sold them. Finance exports invoices, receipts and credit notes for the accountant.', who: 'manager' },
    ],
  },
  {
    version: '2.13.0',
    items: [
      { icon: 'cart-outline', title: 'Orders from the field', body: 'Ava ERP: place an order for a customer during a visit. It goes to the invoicing officer, with your line manager copied, and you see when it is invoiced.', who: 'rep' },
      { icon: 'cash-outline', title: 'Report payments, Finance confirms', body: 'When a customer pays, report it with a photo of the slip. Finance confirms it and issues the receipt; only then the balance goes down.' },
      { icon: 'git-network-outline', title: 'Direct or through a distributor', body: 'Tag each order and sale as bought from you directly or through a distributor. Distributor sales count for targets but add no debt.' },
      { icon: 'hourglass-outline', title: 'Debt summary and age', body: 'What every customer, rep, team and region owes, by how long it is overdue, with days sales outstanding and export.', who: 'manager' },
      { icon: 'speedometer-outline', title: 'Credit limits that hold', body: 'Customers start on cash and carry with a ₦2m limit. Finance asks for changes, one or many at once, and the country manager or named approver approves them. Orders over the limit or with old debt wait on hold.', who: 'manager' },
      { icon: 'briefcase-outline', title: 'New back-office roles', body: 'Give people Finance, Invoicing officer, Credit approver or Product manager / Marketing jobs in Users & roles. Administrators can do all of them.', who: 'admin' },
      { icon: 'checkmark-done-outline', title: 'One Approvals inbox', body: 'Payments, orders, credit changes, leave and account corrections that wait for you are together under Approvals.' },
      { icon: 'bulb-outline', title: 'Suggest a feature', body: 'Administrators can send ideas straight to the Ava CRM team from More.', who: 'admin' },
    ],
  },
  {
    version: '2.12.2',
    items: [
      { icon: 'map-outline', title: 'New map', body: 'The accounts map now uses TomTom maps, which load reliably however many people use them.' },
    ],
  },
  {
    version: '2.12.1',
    items: [
      { icon: 'cloud-upload-outline', title: 'Smaller uploads', body: 'Saving now sends only your new changes instead of your whole history, so it stays quick however long you have used Ava CRM.' },
    ],
  },
  {
    version: '2.12.0',
    items: [
      { icon: 'sync-outline', title: 'Faster, lighter sync', body: 'Each sync is now one quick request that brings only your colleagues’ new changes, so it uses less mobile data and works better on weak signal.' },
    ],
  },
  {
    version: '2.11.2',
    items: [
      { icon: 'sparkles-outline', title: 'Easier to try', body: 'The sign-in screen now offers the demo company and a free trial up front, so colleagues can see Ava CRM before their company signs up.' },
      { icon: 'chatbubble-ellipses-outline', title: 'Rate and send feedback', body: 'Find Rate Ava CRM and Send feedback under More. Your ideas go straight to the Ava CRM team.' },
    ],
  },
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
