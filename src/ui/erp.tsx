import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { creditDaysOf, creditLimitOf, creditTermsLabel, erpSettings, formatMoney, invoiceTotals, payState, rulesV2, todayIso, type PayState } from '@/data/erp';
import { can } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import { WAREHOUSE, type Account, type Invoice, type User } from '@/data/types';
import { Badge, Button, Card, Empty, ListRow, text } from '@/ui/components';
import { colors, space } from '@/ui/theme';

/** Ava ERP context for screens: settings, money formatting and who the person sells for. */
export function useErp() {
  const me = useMe();
  const store = useStore();
  const settings = erpSettings(store.data.settings);
  const money = (n: number) => formatMoney(n, settings.currency);
  // People this person can sell for and whose stock they look after.
  const team: User[] = me.role === 'Rep' ? [] : (store.admin ? store.data.users.filter((u) => u.active && !u.deletedAt && u.role !== 'Admin') : [...repsUnder(store.data.users, me), ...store.data.users.filter((u) => u.managerId === me.id && u.role !== 'Rep' && u.active)]);
  const manager = me.role !== 'Rep' || store.admin;
  // Reps keep their own stock; managers and administrators also run the warehouse.
  const places = [me.id, ...(manager ? [WAREHOUSE] : []), ...team.filter((u) => u.id !== me.id).map((u) => u.id)];
  // 2.13: who does which back-office step, and whether reps order rather than invoice.
  const v2 = rulesV2(store.data);
  const finance = can(me, 'finance');
  const invoicer = can(me, 'invoicing');
  const approver = can(me, 'creditApprover');
  // 2.15: the warehouse role runs the warehouse stock.
  const warehouse = can(me, 'warehouse');
  const office = finance || invoicer || approver;
  const ordersOnly = v2 && !invoicer && !settings.repsInvoice && me.role === 'Rep';
  return { ...store, me, settings, money, team, manager: manager || invoicer || warehouse, warehouse, places: (invoicer || warehouse) && !places.includes(WAREHOUSE) ? [...places, WAREHOUSE] : places, v2, finance, invoicer, approver, office, ordersOnly, ctx: (inv?: Pick<Invoice, 'accountId' | 'ownerId'> & { distributorId?: string }) => ({ company: store.company, erp: settings, account: inv ? store.getAccount(inv.accountId) : undefined, seller: inv ? store.getUser(inv.ownerId) : undefined, distributor: inv?.distributorId ? store.data.distributors?.find((d) => d.id === inv.distributorId)?.name : undefined }) };
}

const PAY_COLORS: Record<PayState, { fg: string; bg: string }> = {
  Paid: { fg: colors.success, bg: colors.successSoft },
  'Part paid': { fg: colors.warn, bg: colors.warnSoft },
  Unpaid: { fg: colors.primaryInk, bg: colors.primarySoft },
  Overdue: { fg: colors.danger, bg: colors.dangerSoft },
  Void: { fg: colors.muted, bg: colors.sunken },
  'Via distributor': { fg: colors.muted, bg: colors.sunken },
};

export function PayBadge({ state }: { state: PayState }) {
  const c = PAY_COLORS[state];
  return <Badge label={state === 'Void' ? 'Cancelled' : state} fg={c.fg} bg={c.bg} />;
}

export function InvoiceRow({ inv, showSeller }: { inv: Invoice; showSeller?: boolean }) {
  const { getAccount, getUser, money } = useErp();
  const t = invoiceTotals(inv);
  const state = payState(inv, todayIso());
  const account = getAccount(inv.accountId);
  return (
    <ListRow
      icon="receipt-outline"
      tone={state === 'Overdue' ? colors.danger : state === 'Paid' ? colors.success : colors.primary}
      title={account?.name ?? 'Customer'}
      subtitle={`${inv.number} · ${new Date(`${inv.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${showSeller ? ` · ${getUser(inv.ownerId)?.name ?? ''}` : ''}${t.balance > 0 && state !== 'Void' ? ` · ${money(t.balance)} owed` : ''}`}
      onPress={() => router.push({ pathname: '/erp/invoice/[id]', params: { id: inv.id } })}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[text.title, { fontVariant: ['tabular-nums'] }, state === 'Void' && { textDecorationLine: 'line-through', color: colors.faint }]}>{money(t.total)}</Text>
          <PayBadge state={state} />
        </View>
      }
    />
  );
}

/** On an account page (Ava ERP only): what the customer owes and a New sale button. */
export function AccountSales({ account }: { account: Account }) {
  const { erp, data, money, v2, ordersOnly, finance, settings } = useErp();
  if (!erp) return null;
  // 2.13: doctors are not billed; their page offers an order for one of their workplaces.
  if (v2 && settings.hcoOnly && account.type === 'HCP')
    return (
      <Card style={{ padding: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text style={[text.muted, { flex: 1 }]}>Orders go to the hospital or pharmacy this doctor works at.</Text>
          <Button small title={ordersOnly ? 'New order' : 'New sale'} icon="cart-outline" onPress={() => router.push({ pathname: '/erp/sale', params: { accountId: account.id, ...(ordersOnly ? { mode: 'order' } : {}) } })} />
        </View>
      </Card>
    );
  const invoices = (data.invoices ?? []).filter((i) => i.accountId === account.id && i.status !== 'Void');
  const owed = invoices.reduce((n, i) => n + invoiceTotals(i).balance, 0);
  const overdue = invoices.filter((i) => payState(i) === 'Overdue').length;
  const last = invoices.reduce((d, i) => (i.date > d ? i.date : d), '');
  return (
    <Card style={{ padding: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text style={text.title}>{owed > 0 ? `Owes ${money(owed)}` : invoices.length ? 'Paid up' : 'No sales yet'}</Text>
          {v2 && (
            <Text style={text.small}>
              {creditTermsLabel(creditDaysOf(account, settings))}
              {creditLimitOf(account, settings) !== undefined ? ` · limit ${money(creditLimitOf(account, settings)!)}` : ''}
              {account.channel === 'Distributor' ? ` · buys through ${data.distributors?.find((d) => d.id === account.distributorId)?.name ?? 'a distributor'}` : ''}
            </Text>
          )}
          <Text style={[text.muted, overdue > 0 && { color: colors.danger }]}>
            {overdue > 0 ? `${overdue} overdue invoice${overdue === 1 ? '' : 's'}` : last ? `Last sale ${new Date(`${last}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Sell to this customer in a few taps'}
          </Text>
        </View>
        {invoices.length > 0 && <Button small variant="ghost" title="Statement" onPress={() => router.push({ pathname: '/erp/customer/[id]', params: { id: account.id } })} />}
        {v2 && !finance && owed > 0 && <Button small variant="ghost" title="Payment" icon="cash-outline" onPress={() => router.push({ pathname: '/erp/payment', params: { accountId: account.id } })} />}
        <Button small title={ordersOnly ? 'New order' : 'New sale'} icon="cart-outline" onPress={() => router.push({ pathname: '/erp/sale', params: { accountId: account.id, ...(ordersOnly ? { mode: 'order' } : {}) } })} />
      </View>
    </Card>
  );
}

/** Shown in place of ERP screens when the company does not have the module. */
export function ErpOff() {
  const { admin } = useStore();
  return (
    <View style={{ padding: space.xl }}>
      <Empty icon="cube-outline" title="Ava ERP is not switched on">
        {admin
          ? 'Ava ERP adds selling, invoices, payments and stock to Ava CRM. Add it on the web in Company settings › Subscription, or ask Ava Healthcare to switch it on.'
          : 'Ava ERP adds selling, invoices, payments and stock. Ask your administrator to add it.'}
      </Empty>
    </View>
  );
}
