import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { customerBalances, daysBetween, todayIso } from '@/data/erp';
import { Card, Chip, Empty, ListRow, SearchBox, text } from '@/ui/components';
import { ErpOff, useErp } from '@/ui/erp';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type Sort = 'Owed' | 'Overdue' | 'Name';

/** Every customer who has bought, with what they owe; the oldest debts stand out. */
export default function CustomersScreen() {
  const { data, erp, money } = useErp();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('Owed');
  const today = todayIso();
  const rows = useMemo(() => customerBalances(data, today), [data, today]);
  if (!erp) return <ErpOff />;

  const list = rows
    .filter((r) => !q.trim() || `${r.account.name} ${r.account.city}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((r) => sort !== 'Overdue' || r.overdue > 0)
    .sort((a, b) => (sort === 'Name' ? a.account.name.localeCompare(b.account.name) : sort === 'Overdue' ? b.overdue - a.overdue : b.owed - a.owed));
  const total = rows.reduce((n, r) => n + r.owed, 0);

  return (
    <Screen>
      <Text style={text.muted}>Owed to you in total</Text>
      <Text style={[text.h1, { marginBottom: space.md }]}>{money(total)}</Text>
      <SearchBox placeholder="Find a customer" value={q} onChangeText={setQ} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md }}>
        {(['Owed', 'Overdue', 'Name'] as Sort[]).map((s) => (
          <Chip key={s} label={s === 'Owed' ? 'Most owed' : s === 'Overdue' ? 'Overdue only' : 'A to Z'} selected={sort === s} onPress={() => setSort(s)} />
        ))}
      </View>
      {list.length ? (
        <Card style={{ padding: 0 }}>
          {list.map((r) => {
            const late = r.oldestDue && r.oldestDue < today ? daysBetween(r.oldestDue, today) : 0;
            return (
              <ListRow
                key={r.account.id}
                icon={r.account.type === 'HCO' ? 'business-outline' : 'person-outline'}
                tone={r.overdue > 0 ? colors.danger : r.owed > 0 ? colors.primary : colors.success}
                title={r.account.name}
                subtitle={`${r.invoices} invoice${r.invoices === 1 ? '' : 's'}${late ? ` · oldest ${late} day${late === 1 ? '' : 's'} late` : ''}${r.account.creditLimit !== undefined ? ` · limit ${money(r.account.creditLimit)}` : ''}`}
                onPress={() => router.push({ pathname: '/erp/customer/[id]', params: { id: r.account.id } })}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[text.title, { fontVariant: ['tabular-nums'] }, r.owed <= 0 && { color: colors.success }]}>{r.owed > 0 ? money(r.owed) : 'Paid up'}</Text>
                    {r.overdue > 0 && <Text style={[text.small, { color: colors.danger }]}>{money(r.overdue)} overdue</Text>}
                  </View>
                }
              />
            );
          })}
        </Card>
      ) : (
        <Empty icon="people-outline" title={rows.length ? 'No match' : 'No customers yet'}>
          {rows.length ? 'Try another name, or show everyone.' : 'Customers appear here after their first sale.'}
        </Empty>
      )}
    </Screen>
  );
}
