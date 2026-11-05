import { api, loadToken } from '@/cloud/relay';
import { holdersOf } from '@/data/roles';
import { orderTotal, erpSettings } from '@/data/erp';
import { HOLD_LABEL, type Account, type HoldReason, type Order, type Snapshot, type User } from '@/data/types';

interface Ctx {
  data: Snapshot;
  me: User;
  getUser: (id?: string) => User | undefined;
  getAccount: (id: string) => Account | undefined;
  money: (n: number) => string;
}

const emails = (users: (User | undefined)[], except?: string) => [...new Set(users.filter((u): u is User => !!u && u.active && !u.deletedAt && u.id !== except).map((u) => u.email))];

/** Best effort: an email that does not go out never stops the work (the order is in the app either way). */
async function send(to: string[], cc: string[], subject: string, text: string) {
  if (!to.length && !cc.length) return;
  try {
    const token = await loadToken();
    if (!token) return;
    await api.notify(token, { to: to.length ? to : cc, cc: to.length ? cc : [], subject, text });
  } catch {
    // Offline or email not set up on the server: the alert in the app still shows.
  }
}

/** A new order: to the invoicing officers (or Finance when it waits on a hold), the rep's line manager copied. */
export function notifyOrder(o: Pick<Order, 'accountId' | 'channel' | 'distributorId' | 'lines' | 'deliveryDate'> & { holds: HoldReason[] }, c: Ctx) {
  const account = c.getAccount(o.accountId);
  const manager = c.getUser(c.me.managerId);
  const held = o.holds.length > 0;
  const office = held ? [...(o.holds.some((h) => h !== 'discount') ? holdersOf(c.data.users, 'finance') : []), ...(o.holds.includes('discount') ? holdersOf(c.data.users, 'creditApprover') : [])] : holdersOf(c.data.users, 'invoicing');
  const total = c.money(orderTotal(o.lines, c.data.products, erpSettings(c.data.settings)));
  const subject = `${held ? 'Order on hold' : 'New order'} from ${c.me.name}${account ? ` for ${account.name}` : ''}`;
  const text = [
    `${c.me.name} placed an order${account ? ` for ${account.name}${account.city ? `, ${account.city}` : ''}` : ''}.`,
    ...(o.channel === 'Distributor' ? [`The customer buys through ${c.data.distributors?.find((d) => d.id === o.distributorId)?.name ?? 'a distributor'}.`] : []),
    '',
    ...o.lines.map((l) => `- ${l.qty} x ${l.product}${l.discountPercent ? ` (${l.discountPercent}% off)` : ''}`),
    `Total about ${total} including VAT.`,
    ...(o.deliveryDate ? [`Wanted by ${o.deliveryDate}.`] : []),
    ...(held ? [`On hold: ${o.holds.map((h) => HOLD_LABEL[h]).join(', ')}.`] : []),
    '',
    'Open Ava CRM › Approvals to deal with it.',
  ].join('\n');
  void send(emails(office, c.me.id), emails([manager], c.me.id), subject, text);
}

/** Tells someone what happened to their request (order invoiced, payment confirmed, credit decided). */
export function notifyPerson(to: User | undefined, subject: string, text: string, cc: User[] = []) {
  void send(emails([to]), emails(cc), subject, `${text}\n\nOpen Ava CRM for the details.`);
}
