import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AGE_BANDS, debtAge, dso, emptyAge, formatMoneyShort, todayIso, type AgeRow } from '@/data/erp';
import type { Invoice } from '@/data/types';
import { Button, Card, Empty, Kpi, KpiRow, Segmented, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { saveTextFile } from '@/ui/files';
import { Screen } from '@/ui/Screen';
import { colors, space, tone } from '@/ui/theme';

type By = 'Customer' | 'Rep' | 'Team' | 'Region';

/** 2.13: what customers owe, in age bands from the due date, grouped four ways, with DSO and export. */
export default function DebtScreen() {
  const { data, erp, settings, getUser, getAccount, money, me } = useErp();
  const [by, setBy] = useState<By>(me.role === 'Rep' ? 'Customer' : 'Rep');
  const today = todayIso();
  const invoices = useMemo(() => data.invoices ?? [], [data.invoices]);
  const keyOf = useMemo(() => {
    const team = (repId: string) => getUser(repId)?.managerId ?? repId;
    const region = (repId: string) => getUser(team(repId))?.managerId ?? team(repId);
    const f: Record<By, (i: Invoice) => string> = { Customer: (i) => i.accountId, Rep: (i) => i.ownerId, Team: (i) => team(i.ownerId), Region: (i) => region(i.ownerId) };
    return f[by];
  }, [by, getUser]);
  const rows = useMemo(() => [...debtAge(invoices, keyOf, today)].sort((a, b) => b[1].total - a[1].total), [invoices, keyOf, today]);
  const all = useMemo(() => rows.reduce<AgeRow>((t, [, r]) => {
    const out = { ...t };
    for (const b of AGE_BANDS) out[b] += r[b];
    out.total += r.total;
    out.overdue += r.overdue;
    return out;
  }, emptyAge()), [rows]);
  const days = useMemo(() => dso(invoices, today), [invoices, today]);
  if (!erp) return <ErpOff />;

  const name = (k: string) => (by === 'Customer' ? getAccount(k)?.name : by === 'Rep' ? getUser(k)?.name : `${getUser(k)?.name ?? 'Unassigned'}${getUser(k)?.territory ? ` · ${getUser(k)?.territory}` : ''}`) ?? 'Unknown';
  const cur = settings.currency;

  const exportCsv = () => {
    const q = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const head = [by.toLowerCase(), ...AGE_BANDS.map((b) => (b === 'Not yet due' ? 'not_yet_due' : `days_${b.replace('+', '_plus')}`)), 'overdue', 'total'];
    const lines = [head, ...rows.map(([k, r]) => [name(k), ...AGE_BANDS.map((b) => r[b].toFixed(2)), r.overdue.toFixed(2), r.total.toFixed(2)])];
    saveTextFile(`Ava ERP - debt by ${by.toLowerCase()} ${today}.csv`, lines.map((l) => l.map(q).join(',')).join('\n')).catch((e) => notify('Export failed', e instanceof Error ? e.message : String(e)));
  };

  return (
    <Screen wide>
      <KpiRow>
        <Kpi icon="wallet-outline" label="Owed to us" value={formatMoneyShort(all.total, cur)} sub={days !== undefined ? `${days} days sales outstanding` : undefined} />
        <Kpi icon="alarm-outline" label="Overdue" value={formatMoneyShort(all.overdue, cur)} tone={all.overdue ? tone.urgent : undefined} sub={all.total ? `${Math.round((all.overdue / all.total) * 100)}% of the debt` : undefined} />
        <Kpi icon="skull-outline" label="Over 90 days" value={formatMoneyShort(all['91-120'] + all['120+'], cur)} tone={all['91-120'] + all['120+'] ? tone.urgent : undefined} sub="Hardest to collect" />
      </KpiRow>

      <Card>
        <Text style={[text.small, { marginBottom: space.sm }]}>DEBT BY AGE</Text>
        <View style={styles.bars}>
          {AGE_BANDS.map((b) => (
            <View key={b} style={{ flex: 1, alignItems: 'center' }}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${all.total ? Math.max(2, (all[b] / all.total) * 100) : 2}%`, backgroundColor: b === 'Not yet due' ? colors.success : b === '1-30' ? colors.warn : colors.danger }]} />
              </View>
              <Text style={text.small}>{b === 'Not yet due' ? 'Not due' : b}</Text>
              <Text style={[text.small, { fontWeight: '700' }]}>{formatMoneyShort(all[b], cur)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle right={rows.length ? <Button small variant="ghost" icon="download-outline" title="Export" onPress={exportCsv} /> : undefined}>By {by.toLowerCase()}</SectionTitle>
      <Segmented options={['Customer', 'Rep', 'Team', 'Region'] as By[]} value={by} onChange={setBy} />
      {rows.length ? (
        <Card style={{ padding: 0 }}>
          <ScrollView horizontal>
            <View>
              <View style={[styles.tr, styles.th]}>
                <Text style={[styles.name, text.small]}>{by}</Text>
                {AGE_BANDS.map((b) => (
                  <Text key={b} style={[styles.num, text.small]}>
                    {b === 'Not yet due' ? 'Not due' : `${b} d`}
                  </Text>
                ))}
                <Text style={[styles.num, text.small, { fontWeight: '800' }]}>Total</Text>
              </View>
              {rows.slice(0, 300).map(([k, r]) => (
                <View key={k} style={styles.tr}>
                  <Text style={[styles.name, by === 'Customer' ? text.link : text.body]} numberOfLines={1} onPress={by === 'Customer' ? () => router.push({ pathname: '/erp/customer/[id]', params: { id: k } }) : undefined}>
                    {name(k)}
                  </Text>
                  {AGE_BANDS.map((b) => (
                    <Text key={b} style={[styles.num, text.body, r[b] > 0 && b !== 'Not yet due' && { color: colors.danger }]}>
                      {r[b] ? formatMoneyShort(r[b], cur) : '–'}
                    </Text>
                  ))}
                  <Text style={[styles.num, text.title]}>{money(r.total)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Card>
      ) : (
        <Empty icon="happy-outline" title="Nobody owes anything">Unpaid invoices show here by how long they are past their due date.</Empty>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', gap: space.sm, height: 150 },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 2 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  th: { backgroundColor: colors.sunken },
  name: { width: 200, paddingRight: space.sm },
  num: { width: 92, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
