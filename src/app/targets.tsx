import { useState } from 'react';
import { Text, View } from 'react-native';
import { isAdmin, repsUnder } from '@/data/access';
import { achieved, formatMoney, todayIso } from '@/data/erp';
import { newId } from '@/data/ids';
import { can } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import type { User } from '@/data/types';
import { Button, Card, Empty, Field, ProgressBar, Row, SectionTitle, UserAvatar, text } from '@/ui/components';
import { useAttempt } from '@/ui/opsCards';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/,/g, '')));

/** One person's month: target and how far they got. */
function Progress({ label, got, goal, fmt }: { label: string; got: number; goal?: number; fmt: (n: number) => string }) {
  if (!goal) return null;
  const share = goal ? got / goal : 0;
  return (
    <View style={{ marginTop: space.xs }}>
      <Row>
        <Text style={[text.small, { flex: 1 }]}>{label}</Text>
        <Text style={text.small}>
          {fmt(got)} of {fmt(goal)} · {Math.round(share * 100)}%
        </Text>
      </Row>
      <ProgressBar value={Math.min(1, share)} color={share >= 1 ? colors.success : share >= 0.7 ? colors.primary : colors.warn} />
    </View>
  );
}

function PersonTarget({ u, month, edit }: { u: User; month: string; edit: boolean }) {
  const me = useMe();
  const { data, erp } = useStore();
  const attempt = useAttempt();
  const cur = data.settings.erp?.currency ?? 'NGN';
  const money = (n: number) => formatMoney(n, cur);
  const t = (data.targets ?? []).find((x) => x.userId === u.id && x.month === month);
  const got = achieved(data, u.id, month);
  const [open, setOpen] = useState(false);
  const [sales, setSales] = useState(t?.sales?.toString() ?? '');
  const [collection, setCollection] = useState(t?.collection?.toString() ?? '');
  const [calls, setCalls] = useState(t?.calls?.toString() ?? '');
  const save = () =>
    attempt({ type: 'target.set', target: { id: t?.id ?? newId('tgt'), userId: u.id, month, sales: erp ? num(sales) : undefined, collection: erp ? num(collection) : undefined, calls: num(calls), setBy: me.id, at: '' } }, () => setOpen(false));
  return (
    <Card>
      <Row>
        <UserAvatar user={u} size={34} />
        <Text style={[text.title, { flex: 1 }]}>{u.name}</Text>
        {edit && <Button small variant="ghost" title={t ? 'Change' : 'Set target'} onPress={() => setOpen(!open)} />}
      </Row>
      {!t && !open && <Text style={text.muted}>No target for {month}.</Text>}
      {t && (
        <>
          {erp && <Progress label="Sales" got={got.sales} goal={t.sales} fmt={money} />}
          {erp && <Progress label="Collected" got={got.collection} goal={t.collection} fmt={money} />}
          <Progress label="Calls" got={got.calls} goal={t.calls} fmt={(n) => String(n)} />
        </>
      )}
      {open && (
        <View style={{ marginTop: space.sm }}>
          <Row gap={space.sm}>
            {erp && <Field label={`Sales (${cur})`} value={sales} onChangeText={setSales} keyboardType="numeric" />}
            {erp && <Field label={`Collection (${cur})`} value={collection} onChangeText={setCollection} keyboardType="numeric" />}
            <Field label="Calls" value={calls} onChangeText={setCalls} keyboardType="numeric" />
          </Row>
          <Row gap={space.sm}>
            {t && <Button small variant="ghost" title="Remove" onPress={() => attempt({ type: 'target.delete', id: t.id }, () => setOpen(false))} />}
            <Button small title="Save" onPress={save} />
          </Row>
        </View>
      )}
    </Card>
  );
}

/** 2.15 targets: monthly sales, collection and call targets per person, with progress. */
export default function TargetsScreen() {
  const me = useMe();
  const { data } = useStore();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const setter = isAdmin(me) || can(me, 'finance');
  const team = (setter ? data.users.filter((u) => u.active && !u.deletedAt && (u.role === 'Rep' || u.role === 'FLM')) : me.role === 'Rep' ? [] : repsUnder(data.users, me)).filter((u) => u.id !== me.id);
  const ok = MONTH.test(month);
  return (
    <Screen wide>
      <Field label="Month (YYYY-MM)" value={month} onChangeText={setMonth} />
      {ok && me.role === 'Rep' && <PersonTarget u={me} month={month} edit={false} />}
      {ok && team.length > 0 && (
        <>
          <SectionTitle>{setter ? 'Everyone' : 'Your team'}</SectionTitle>
          {team.map((u) => (
            <PersonTarget key={`${u.id}-${month}`} u={u} month={month} edit />
          ))}
        </>
      )}
      {ok && me.role !== 'Rep' && !team.length && <Empty icon="people-outline">Nobody reports to you yet.</Empty>}
      <Text style={[text.small, { color: colors.faint }]}>Sales count invoices dated in the month; collection counts payments received; calls count submitted calls.</Text>
    </Screen>
  );
}
