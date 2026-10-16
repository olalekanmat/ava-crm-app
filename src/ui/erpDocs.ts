import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';
import { formatMoney, invoiceTotals, lineTotals, payState, round2 } from '@/data/erp';
import type { Account, Company, ErpSettings, Invoice, Payment, User } from '@/data/types';

/**
 * Printable invoices, receipts and customer statements (Ava ERP, 2.11). The same HTML is printed
 * to a PDF and shared on phones (WhatsApp, email, Drive) and printed or saved as PDF on the web.
 */

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

interface Ctx {
  company: Company;
  erp: ErpSettings;
  account?: Account;
  seller?: User;
}

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f1b3d; margin: 0; padding: 32px; font-size: 13px; }
  .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .co { display: flex; gap: 12px; align-items: center; }
  .co img { max-height: 56px; max-width: 140px; object-fit: contain; }
  .co h1 { font-size: 18px; margin: 0; }
  .muted { color: #5b6785; }
  .doc { text-align: right; }
  .doc h2 { font-size: 26px; letter-spacing: 2px; margin: 0; color: #1846c8; }
  .pill { display: inline-block; padding: 3px 10px; border-radius: 99px; font-weight: 700; font-size: 11px; margin-top: 6px; }
  .Paid { background: #dcf5e7; color: #13693b; } .Unpaid, .Part { background: #fff1d6; color: #8a5a00; } .Overdue { background: #fde0e0; color: #a11b1b; } .Void { background: #e9ecf3; color: #5b6785; }
  .meta { display: flex; gap: 32px; margin: 28px 0 18px; }
  .meta div { min-width: 140px; }
  .label { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #5b6785; font-weight: 700; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #5b6785; border-bottom: 2px solid #0f1b3d; padding: 8px 6px; }
  td { padding: 9px 6px; border-bottom: 1px solid #e3e7f0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 300px; margin-top: 14px; }
  .totals td { border: none; padding: 4px 6px; }
  .totals .grand td { font-size: 16px; font-weight: 800; border-top: 2px solid #0f1b3d; padding-top: 8px; }
  .due td { font-weight: 800; color: #1846c8; font-size: 15px; }
  .box { margin-top: 24px; padding: 14px 16px; background: #f4f6fb; border-radius: 10px; white-space: pre-wrap; }
  .foot { margin-top: 32px; font-size: 11px; color: #5b6785; text-align: center; }
  .void { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 96px; font-weight: 900; color: rgba(200, 30, 30, 0.12); transform: rotate(-20deg); }
`;

function header(ctx: Ctx, title: string, right: string) {
  const c = ctx.company;
  const addr = [c.address, c.city, c.country].filter(Boolean).join(', ');
  const contact = [c.phone, c.email, c.website].filter(Boolean).join(' · ');
  return `<div class="top">
    <div class="co">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : ''}<div><h1>${esc(c.name)}</h1>
      ${addr ? `<div class="muted">${esc(addr)}</div>` : ''}${contact ? `<div class="muted">${esc(contact)}</div>` : ''}${c.registrationNo ? `<div class="muted">Reg. no. ${esc(c.registrationNo)}</div>` : ''}</div></div>
    <div class="doc"><h2>${esc(title)}</h2>${right}</div>
  </div>`;
}

function billTo(a?: Account) {
  if (!a) return '';
  return `<div><div class="label">Bill to</div><b>${esc(a.name)}</b><div class="muted">${esc([a.address, a.city].filter(Boolean).join(', '))}</div>${a.phone ? `<div class="muted">${esc(a.phone)}</div>` : ''}</div>`;
}

const page = (body: string, title: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;

export function invoiceHtml(inv: Invoice, ctx: Ctx): string {
  const cur = ctx.erp.currency;
  const m = (n: number) => esc(formatMoney(n, cur));
  const t = invoiceTotals(inv);
  const state = payState(inv);
  const rows = inv.lines
    .map((l) => {
      const lt = lineTotals(l);
      return `<tr><td>${esc(l.product)}</td><td class="r">${l.qty}</td><td class="r">${m(l.unitPrice)}</td><td class="r">${l.discountPercent ? `${l.discountPercent}%` : ''}</td><td class="r">${l.vatPercent ? `${l.vatPercent}%` : 'Exempt'}</td><td class="r">${m(lt.total)}</td></tr>`;
    })
    .join('');
  const pays = inv.payments.map((p) => `<tr><td>Paid ${esc(dayLabel(p.date))} · ${esc(p.method)}${p.reference ? ` · ${esc(p.reference)}` : ''} · receipt ${esc(p.receiptNo)}</td><td class="r">−${m(p.amount)}</td></tr>`).join('');
  return page(
    `${inv.status === 'Void' ? '<div class="void">CANCELLED</div>' : ''}
    ${header(ctx, 'INVOICE', `<div><b>${esc(inv.number)}</b></div><span class="pill ${state.split(' ')[0]}">${esc(state.toUpperCase())}</span>`)}
    <div class="meta">${billTo(ctx.account)}
      <div><div class="label">Invoice date</div>${esc(dayLabel(inv.date))}</div>
      <div><div class="label">Due</div>${esc(dayLabel(inv.dueDate))}</div>
      ${inv.orderRef ? `<div><div class="label">Your order</div>${esc(inv.orderRef)}</div>` : ''}
      ${ctx.seller ? `<div><div class="label">Sold by</div>${esc(ctx.seller.name)}</div>` : ''}
    </div>
    <table><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Disc.</th><th class="r">VAT</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="r">${m(t.gross)}</td></tr>
      ${t.discount ? `<tr><td>Discount</td><td class="r">−${m(t.discount)}</td></tr>` : ''}
      <tr><td>VAT</td><td class="r">${m(t.vat)}</td></tr>
      <tr class="grand"><td>Total</td><td class="r">${m(t.total)}</td></tr>
      ${pays}
      ${inv.status !== 'Void' ? `<tr class="due"><td>Balance due</td><td class="r">${m(t.balance)}</td></tr>` : ''}
    </table>
    ${inv.status === 'Void' ? `<div class="box">Cancelled: ${esc(inv.voidReason)}</div>` : ''}
    ${ctx.erp.paymentDetails && t.balance > 0 ? `<div class="box"><div class="label">How to pay</div>${esc(ctx.erp.paymentDetails)}</div>` : ''}
    ${inv.notes ? `<div class="box">${esc(inv.notes)}</div>` : ''}
    <div class="foot">Thank you for your business.</div>`,
    `Invoice ${inv.number}`,
  );
}

export function receiptHtml(inv: Invoice, p: Payment, ctx: Ctx): string {
  const m = (n: number) => esc(formatMoney(n, ctx.erp.currency));
  const t = invoiceTotals(inv);
  return page(
    `${header(ctx, 'RECEIPT', `<div><b>${esc(p.receiptNo)}</b></div>`)}
    <div class="meta">${billTo(ctx.account)}
      <div><div class="label">Date</div>${esc(dayLabel(p.date))}</div>
      <div><div class="label">For invoice</div>${esc(inv.number)}</div>
      <div><div class="label">Paid by</div>${esc(p.method)}${p.reference ? `<br>${esc(p.reference)}` : ''}</div>
    </div>
    <table class="totals" style="width:100%">
      <tr class="grand"><td>Amount received</td><td class="r">${m(p.amount)}</td></tr>
      <tr><td>Invoice total</td><td class="r">${m(t.total)}</td></tr>
      <tr class="due"><td>Still owed on this invoice</td><td class="r">${m(t.balance)}</td></tr>
    </table>
    <div class="foot">Thank you for your payment.</div>`,
    `Receipt ${p.receiptNo}`,
  );
}

export function statementHtml(account: Account, invoices: Invoice[], ctx: Ctx, today: string): string {
  const m = (n: number) => esc(formatMoney(n, ctx.erp.currency));
  const live = invoices.filter((i) => i.status !== 'Void').sort((a, b) => a.date.localeCompare(b.date));
  const events = [
    ...live.map((i) => ({ day: i.date, what: `Invoice ${i.number} (due ${dayLabel(i.dueDate)})`, debit: invoiceTotals(i).total, credit: 0 })),
    ...live.flatMap((i) => i.payments.map((p) => ({ day: p.date, what: `Payment, ${p.method}${p.reference ? ` ${p.reference}` : ''} · ${p.receiptNo}`, debit: 0, credit: p.amount }))),
  ].sort((a, b) => a.day.localeCompare(b.day) || b.debit - a.debit);
  let bal = 0;
  const rows = events
    .map((e) => {
      bal = round2(bal + e.debit - e.credit);
      return `<tr><td>${esc(dayLabel(e.day))}</td><td>${esc(e.what)}</td><td class="r">${e.debit ? m(e.debit) : ''}</td><td class="r">${e.credit ? m(e.credit) : ''}</td><td class="r">${m(bal)}</td></tr>`;
    })
    .join('');
  const overdue = round2(live.filter((i) => i.dueDate < today).reduce((n, i) => n + invoiceTotals(i).balance, 0));
  return page(
    `${header(ctx, 'STATEMENT', `<div class="muted">${esc(dayLabel(today))}</div>`)}
    <div class="meta">${billTo(account)}</div>
    <table><thead><tr><th>Date</th><th>Details</th><th class="r">Invoiced</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">No invoices yet.</td></tr>'}</tbody></table>
    <table class="totals">
      <tr class="grand"><td>Balance owed</td><td class="r">${m(bal)}</td></tr>
      ${overdue > 0 ? `<tr class="due"><td>Overdue</td><td class="r">${m(overdue)}</td></tr>` : ''}
    </table>
    ${ctx.erp.paymentDetails && bal > 0 ? `<div class="box"><div class="label">How to pay</div>${esc(ctx.erp.paymentDetails)}</div>` : ''}`,
    `Statement ${account.name}`,
  );
}

/** Phone: makes a PDF and opens the share sheet (WhatsApp, email…). Web: opens the browser's print dialog, where "Save as PDF" is one choice. */
export async function shareDocument(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Allow pop-ups for this site to print or save the PDF.');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName });
}

const COUNTRY_CODES: Record<string, string> = { nigeria: '234', ghana: '233', kenya: '254', 'south africa': '27', uganda: '256', tanzania: '255', 'united kingdom': '44', uk: '44' };

/** A WhatsApp message with the invoice summary, to the customer's number when the account has one. */
export function whatsappInvoice(inv: Invoice, ctx: Ctx): Promise<void> {
  const t = invoiceTotals(inv);
  const m = (n: number) => formatMoney(n, ctx.erp.currency);
  const lines = inv.lines.map((l) => `• ${l.qty} × ${l.product}: ${m(lineTotals(l).total)}`).join('\n');
  const msg = [
    `${ctx.company.name}: invoice ${inv.number}${ctx.account ? ` for ${ctx.account.name}` : ''}`,
    lines,
    `Total ${m(t.total)}${t.paid ? `, paid ${m(t.paid)}` : ''}`,
    t.balance > 0 ? `Balance ${m(t.balance)} due ${dayLabel(inv.dueDate)}` : 'Paid in full. Thank you!',
    t.balance > 0 && ctx.erp.paymentDetails ? `\nHow to pay:\n${ctx.erp.paymentDetails}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  // Local numbers (0803…) get the country code of the company's country, when known.
  const code = COUNTRY_CODES[(ctx.company.country ?? '').trim().toLowerCase()] ?? '';
  const raw = (ctx.account?.phone ?? '').replace(/[^\d+]/g, '');
  const phone = raw.startsWith('+') ? raw.slice(1) : raw.startsWith('0') && code ? code + raw.slice(1) : raw;
  const url = `https://wa.me/${phone.length >= 8 ? phone : ''}?text=${encodeURIComponent(msg)}`;
  return Linking.openURL(url);
}
