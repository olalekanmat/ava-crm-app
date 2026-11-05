import { useState } from 'react';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { formatMoney, todayIso } from '@/data/erp';
import { newId } from '@/data/ids';
import { can } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/data/types';
import { Badge, Button, Card, Chip, Empty, Field, Row, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { approvesExpenses, ExpenseCard, useAttempt } from '@/ui/opsCards';
import { pickDocPhoto } from '@/ui/photo';
import { Screen } from '@/ui/Screen';
import { colors, radius, space } from '@/ui/theme';

const TONE = { Pending: colors.warn, Approved: colors.primary, Paid: colors.success, Rejected: colors.danger, Cancelled: colors.muted } as const;

/** 2.15 expenses: claim with a receipt photo; the manager approves and Finance pays. */
export default function ExpensesScreen() {
  const me = useMe();
  const { data } = useStore();
  const attempt = useAttempt();
  const cur = data.settings.erp?.currency ?? 'NGN';
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>('Transport');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const mine = (data.expenses ?? []).filter((e) => e.userId === me.id).sort((a, b) => b.date.localeCompare(a.date));
  const toReview = (data.expenses ?? []).filter((e) => (e.status === 'Pending' && approvesExpenses(data, me, e.userId)) || (e.status === 'Approved' && can(me, 'finance') && e.userId !== me.id));
  const n = Number(amount.replace(/,/g, ''));
  const month = todayIso().slice(0, 7);
  const thisMonth = mine.filter((e) => e.date.startsWith(month) && e.status !== 'Rejected' && e.status !== 'Cancelled').reduce((s, e) => s + e.amount, 0);

  const snap = async (source: 'camera' | 'library') => {
    try {
      const p = await pickDocPhoto(source, 280_000);
      if (p) setPhoto(p);
    } catch (e) {
      notify('No photo', e instanceof Error ? e.message : String(e));
    }
  };
  const submit = () =>
    attempt({ type: 'expense.submit', expense: { id: newId('exp'), userId: me.id, date, category, amount: n, note: note.trim() || undefined, photo, status: 'Pending', at: '' } }, () => {
      setAmount('');
      setNote('');
      setPhoto(undefined);
      notify('Sent', 'Your manager approves it, then Finance pays.');
    });

  return (
    <Screen wide>
      <Card>
        <Text style={text.title}>New expense</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs }}>
          {EXPENSE_CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
          ))}
        </View>
        <Row gap={space.sm}>
          <Field label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <Field label="Day (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        </Row>
        <Field label="What for" value={note} onChangeText={setNote} placeholder="e.g. Taxi to Lagos University Teaching Hospital" />
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Button small variant="ghost" title="Photo of receipt" icon="camera-outline" onPress={() => snap('camera')} />
          <Button small variant="ghost" title="From gallery" icon="image-outline" onPress={() => snap('library')} />
          {photo && <Image source={{ uri: photo }} style={{ width: 44, height: 44, borderRadius: radius.sm }} />}
        </Row>
        <Button title="Submit" icon="paper-plane-outline" disabled={!(n > 0)} onPress={submit} />
      </Card>

      {toReview.length > 0 && (
        <>
          <SectionTitle>To approve or pay ({toReview.length})</SectionTitle>
          {toReview.map((e) => (
            <ExpenseCard key={e.id} e={e} />
          ))}
        </>
      )}

      <SectionTitle>Your expenses · {formatMoney(thisMonth, cur)} this month</SectionTitle>
      {mine.length ? (
        <Card style={{ padding: 0 }}>
          {mine.map((e) => (
            <Row key={e.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <View style={{ flex: 1 }}>
                <Text style={text.title}>
                  {formatMoney(e.amount, cur)} · {e.category}
                </Text>
                <Text style={text.small}>
                  {e.date}
                  {e.note ? ` · ${e.note}` : ''}
                  {e.decisionNote ? ` · ${e.decisionNote}` : ''}
                </Text>
              </View>
              <Badge label={e.status} fg={TONE[e.status]} bg={colors.sunken} />
              {e.status === 'Pending' && <Button small variant="ghost" title="Cancel" onPress={() => attempt({ type: 'expense.cancel', id: e.id })} />}
            </Row>
          ))}
        </Card>
      ) : (
        <Empty icon="receipt-outline">Expenses you claim appear here with their status.</Empty>
      )}
    </Screen>
  );
}
