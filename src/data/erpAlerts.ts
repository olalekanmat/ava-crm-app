import type { AlertItem } from './alerts';
import { HOLD_RELEASER } from './erp';
import { can } from './roles';
import type { Snapshot, User } from './types';

const RECENT_MS = 3 * 864e5;

/**
 * 2.13 alerts for the order and finance flow: what waits for this person (orders to invoice, holds,
 * payments to confirm, credit changes) and what happened to what they sent (orders, payments, credit).
 */
export function erpAlerts(s: Snapshot, me: User, accountName: (id: string) => string, now = new Date()): AlertItem[] {
  const out: AlertItem[] = [];
  const recent = (iso?: string) => !!iso && now.getTime() - Date.parse(iso) < RECENT_MS;
  for (const o of s.orders ?? []) {
    const name = accountName(o.accountId);
    if (o.status === 'Submitted' && can(me, 'invoicing') && o.ownerId !== me.id)
      out.push({ id: `oi:${o.id}`, level: 'important', kind: 'order-invoice', title: `Order to ${o.channel === 'Distributor' ? 'forward' : 'invoice'} · ${name}`, orderId: o.id, at: o.createdAt });
    if (o.status === 'On hold' && (o.holds ?? []).some((h) => can(me, HOLD_RELEASER[h])) && o.ownerId !== me.id)
      out.push({ id: `oh:${o.id}`, level: 'important', kind: 'order-hold', title: `Order on hold · ${name}`, orderId: o.id, at: o.createdAt });
    if (o.ownerId === me.id && (o.status === 'Invoiced' || o.status === 'Rejected' || o.status === 'Forwarded') && o.decidedBy !== me.id && recent(o.decidedAt))
      out.push({ id: `od:${o.id}`, level: o.status === 'Rejected' ? 'important' : 'normal', kind: 'order-decided', title: `Order ${o.status === 'Rejected' ? 'turned down' : o.status.toLowerCase()} · ${name}`, orderId: o.id, at: o.decidedAt! });
  }
  for (const c of s.paymentClaims ?? []) {
    if (c.status === 'Pending' && can(me, 'finance') && c.byId !== me.id)
      out.push({ id: `pc:${c.id}`, level: 'important', kind: 'payment-confirm', title: `Payment to confirm · ${accountName(c.accountId)}`, accountId: c.accountId, at: c.at });
    if (c.byId === me.id && c.status !== 'Pending' && c.decidedBy !== me.id && recent(c.decidedAt))
      out.push({ id: `pd:${c.id}`, level: c.status === 'Rejected' ? 'important' : 'normal', kind: 'payment-decided', title: `Payment ${c.status === 'Rejected' ? 'turned down' : 'confirmed'} · ${accountName(c.accountId)}`, accountId: c.accountId, at: c.decidedAt! });
  }
  for (const r of s.creditRequests ?? []) {
    if (r.status === 'Pending' && can(me, 'creditApprover') && r.byId !== me.id)
      out.push({ id: `cr:${r.id}`, level: 'important', kind: 'credit-approve', title: `Credit change to approve · ${r.accountIds.length === 1 ? accountName(r.accountIds[0]) : `${r.accountIds.length} customers`}`, at: r.at });
    if (r.byId === me.id && (r.status === 'Approved' || r.status === 'Rejected') && recent(r.decidedAt))
      out.push({ id: `cd:${r.id}`, level: 'normal', kind: 'credit-decided', title: `Credit change ${r.status.toLowerCase()} · ${r.accountIds.length === 1 ? accountName(r.accountIds[0]) : `${r.accountIds.length} customers`}`, at: r.decidedAt! });
  }
  return out;
}
