import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { manages } from '@/data/access';
import { customerBalances, todayIso } from '@/data/erp';
import { Button, Card, Empty, Field, Kpi, KpiRow, Row, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, InvoiceRow, useErp } from '@/ui/erp';
import { shareDocument, statementHtml } from '@/ui/erpDocs';
import { Screen } from '@/ui/Screen';
import { space, tone } from '@/ui/theme';

/** One customer: balance, credit limit, every invoice, and a statement to send. */
export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, data, erp, run, money, getAccount, admin, settings, company } = useErp();
  const account = getAccount(id);
  const [limit, setLimit] = useState(account?.creditLimit !== undefined ? String(account.creditLimit) : '');
  const [editing, setEditing] = useState(false);
  if (!erp) return <ErpOff />;
  if (!account) return <Screen><Empty icon="person-outline">Customer not found.</Empty></Screen>;

  const today = todayIso();
  const invoices = (data.invoices ?? []).filter((i) => i.accountId === account.id).sort((a, b) => b.date.localeCompare(a.date));
  const bal = customerBalances({ invoices, accounts: [account] }, today)[0];
  const canLimit = admin || (me.role !== 'Rep' && manages(data.users, me, account.ownerId));

  const saveLimit = () => {
    try {
      run({ type: 'account.credit', id: account.id, limit: limit.trim() ? Number(limit) : undefined });
      setEditing(false);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Text style={text.h2}>{account.name}</Text>
      <Text style={[text.muted, { marginBottom: space.md }]}>{[account.address, account.city].filter(Boolean).join(', ')}</Text>
      <KpiRow>
        <Kpi label="Owes" value={money(bal?.owed ?? 0)} />
        <Kpi label="Overdue" value={money(bal?.overdue ?? 0)} tone={(bal?.overdue ?? 0) > 0 ? tone.urgent : undefined} />
        <Kpi label="Credit limit" value={account.creditLimit !== undefined ? money(account.creditLimit) : 'None'} sub={account.creditLimit !== undefined && (bal?.owed ?? 0) > account.creditLimit ? 'Over the limit' : undefined} tone={account.creditLimit !== undefined && (bal?.owed ?? 0) > account.creditLimit ? tone.important : undefined} onPress={canLimit ? () => setEditing(true) : undefined} />
      </KpiRow>
      {editing && (
        <Card>
          <Field label="Credit limit" value={limit} onChangeText={(v) => setLimit(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Leave empty for no limit" hint="Sellers are warned when a sale would take the customer over it." />
          <Row gap={space.sm}>
            <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
            <Button title="Save limit" onPress={saveLimit} />
          </Row>
        </Card>
      )}
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Button title="New sale" icon="add-circle-outline" onPress={() => router.push({ pathname: '/erp/sale', params: { accountId: account.id } })} />
        <Button
          title="Statement"
          icon="document-text-outline"
          variant="secondary"
          onPress={() => shareDocument(statementHtml(account, invoices, { company, erp: settings }, today), `Statement ${account.name}.pdf`).catch((e) => notify('Could not share', e instanceof Error ? e.message : String(e)))}
        />
      </Row>
      <SectionTitle>Invoices</SectionTitle>
      {invoices.length ? (
        <Card style={{ padding: 0 }}>
          {invoices.map((i) => (
            <InvoiceRow key={i.id} inv={i} showSeller={me.role !== 'Rep'} />
          ))}
        </Card>
      ) : (
        <View>
          <Text style={text.muted}>No sales to {account.name} yet.</Text>
        </View>
      )}
    </Screen>
  );
}
