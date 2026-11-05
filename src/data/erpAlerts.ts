import type { AlertItem } from './alerts';
import { approverOf } from './mutations';
import { erpSettings, expiringLots, HOLD_RELEASER, stockLots, todayIso } from './erp';
import { isAdmin, manages } from './access';
import { can } from './roles';
import { WAREHOUSE, type Snapshot, type User } from './types';

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

/** 2.14 and 2.15: returns for Finance, expenses to approve or pay, content and safety reports for Medical (needs no ERP). */
export function opsAlerts(s: Snapshot, me: User, accountName: (id: string) => string, erp: boolean, now = new Date()): AlertItem[] {
  const out: AlertItem[] = [];
  if (erp && can(me, 'finance'))
    for (const r of s.returns ?? []) if (r.status === 'Pending' && r.byId !== me.id) out.push({ id: `rt:${r.id}`, level: 'important', kind: 'return-approve', title: `Return to approve · ${accountName(r.accountId)}`, at: r.at });
  const name = (id: string) => s.users.find((u) => u.id === id)?.name ?? 'Someone';
  for (const e of s.expenses ?? []) {
    if (e.status === 'Pending' && e.userId !== me.id && (isAdmin(me) || approverOf(s.users, e.userId)?.id === me.id || manages(s.users, me, e.userId)))
      out.push({ id: `ex:${e.id}`, level: 'important', kind: 'expense-approve', title: `Expense to approve · ${name(e.userId)}`, at: e.at });
    if (e.status === 'Approved' && can(me, 'finance') && e.userId !== me.id) out.push({ id: `ep:${e.id}`, level: 'normal', kind: 'expense-pay', title: `Expense to pay · ${name(e.userId)}`, at: e.decidedAt ?? e.at });
  }
  if (can(me, 'medical')) {
    for (const d of s.content ?? []) if (d.status === 'Pending' && d.byId !== me.id) out.push({ id: `ct:${d.id}`, level: 'important', kind: 'content-approve', title: `Material to approve · ${d.title}`, at: d.at });
    for (const r of s.safetyReports ?? []) if (r.status === 'New') out.push({ id: `sf:${r.id}`, level: r.serious ? 'urgent' : 'important', kind: 'safety-new', title: `${r.serious ? 'Serious ' : ''}${r.kind.toLowerCase()} · ${r.product}`, at: r.at });
  }
  if (erp && (can(me, 'warehouse') || isAdmin(me))) {
    const today = todayIso(now);
    const lots = stockLots(s).get(WAREHOUSE) ?? [];
    const { expired, soon } = expiringLots(lots.filter((l) => l.qty > 0), today, erpSettings(s.settings).nearExpiryDays ?? 90);
    if (expired.length || soon.length) out.push({ id: `se:${today}`, level: expired.length ? 'important' : 'normal', kind: 'stock-expiring', title: expired.length ? `${expired.length} batch${expired.length === 1 ? '' : 'es'} expired in the warehouse` : `${soon.length} batch${soon.length === 1 ? '' : 'es'} expiring soon`, at: `${today}T08:00:00` });
  }
  return out;
}
