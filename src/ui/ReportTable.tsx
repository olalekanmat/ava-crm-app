import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatCell, type CellKind, type ReportResult } from '@/data/reports';
import { text } from './components';
import { colors, radius, space } from './theme';

const WIDTH: Record<CellKind, number> = { text: 170, number: 96, pct: 104, date: 110 };
const isNumeric = (k: CellKind) => k === 'number' || k === 'pct';

/** The report as a table that scrolls sideways on a phone, with a totals row. */
export function ReportTable({ result }: { result: ReportResult }) {
  const { columns, rows, totals } = result;
  if (!rows.length) return <Text style={[text.muted, { paddingVertical: space.md }]}>No rows match these filters.</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.table}>
        <View style={[styles.row, styles.head]}>
          {columns.map((c) => (
            <Text key={c.key} style={[styles.cell, styles.headText, { width: WIDTH[c.kind] }, isNumeric(c.kind) && styles.right]} numberOfLines={2}>
              {c.label}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[styles.row, i % 2 === 1 && styles.zebra]}>
            {r.map((v, j) => (
              <Text key={columns[j].key} style={[styles.cell, { width: WIDTH[columns[j].kind] }, isNumeric(columns[j].kind) && styles.right]} numberOfLines={2} selectable>
                {formatCell(v, columns[j].kind)}
              </Text>
            ))}
          </View>
        ))}
        <View style={[styles.row, styles.total]}>
          {totals.map((v, j) => (
            <Text key={columns[j].key} style={[styles.cell, styles.totalText, { width: WIDTH[columns[j].kind] }, isNumeric(columns[j].kind) && styles.right]} numberOfLines={1}>
              {formatCell(v, columns[j].kind)}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/** Horizontal bars for a grouped report: one per group, scaled to the largest (or to 100%). */
export function ReportBars({ result }: { result: ReportResult }) {
  const bars = result.chart ?? [];
  if (!bars.length) return null;
  const pct = bars[0].kind === 'pct';
  const max = pct ? 1 : Math.max(1, ...bars.map((b) => b.value));
  const metric = result.columns[1]?.label ?? '';
  return (
    <View accessibilityLabel={`Bar chart of ${metric} by ${result.columns[0]?.label ?? 'group'}`}>
      <Text style={[text.small, { marginBottom: space.sm }]}>{metric}</Text>
      {bars.map((b, i) => (
        <View key={`${b.label}-${i}`} style={styles.barRow}>
          <Text style={[text.muted, styles.barLabel]} numberOfLines={1}>
            {b.label}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${Math.max(0, Math.min(1, b.value / max)) * 100}%` }]} />
          </View>
          <Text style={[text.muted, styles.barValue]}>{formatCell(b.value, b.kind)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.card },
  row: { flexDirection: 'row' },
  head: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  zebra: { backgroundColor: colors.bg },
  cell: { paddingHorizontal: space.sm, paddingVertical: 7, fontSize: 13, color: colors.text },
  headText: { fontWeight: '700', color: colors.muted, fontSize: 12 },
  right: { textAlign: 'right' },
  total: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  totalText: { fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 6 },
  barLabel: { width: 110 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.border, overflow: 'hidden' },
  bar: { height: 14, borderRadius: 7, backgroundColor: colors.primary },
  barValue: { width: 52, textAlign: 'right' },
});
