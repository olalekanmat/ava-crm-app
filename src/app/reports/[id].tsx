import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  allReports, canBuildReports, canViewReports, DATASET_LABEL, DATE_LABEL, isTemplateId, MAX_ROWS_SHOWN, reportCsv, reportFileName, runReport,
} from '@/data/reports';
import { useMe, useStore } from '@/data/store';
import type { ReportDatePreset } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Row, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { saveTextFile } from '@/ui/files';
import { ReportBars, ReportTable } from '@/ui/ReportTable';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

const QUICK_DATES: ReportDatePreset[] = ['thisCycle', 'lastCycle', 'thisMonth', 'lastMonth', 'all'];

/** One report: the table, a bar chart when grouped, a quick date switch and CSV export. */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { data, withDeleted } = useStore();
  const def = allReports(data.settings.reports).find((r) => r.id === id);
  // Trying other dates here does not change the saved report.
  const [date, setDate] = useState<ReportDatePreset | undefined>();
  const [saved, setSaved] = useState<string>();
  const active = useMemo(() => (def && date ? { ...def, filters: { ...def.filters, date } } : def), [def, date]);
  const result = useMemo(() => (active && canViewReports(me) ? runReport(withDeleted, active, me, new Date(), MAX_ROWS_SHOWN) : undefined), [active, withDeleted, me]);

  if (!canViewReports(me)) return <Screen><Empty icon="bar-chart-outline">Reports are for managers and administrators.</Empty></Screen>;
  if (!def || !active || !result) return <Screen><Empty icon="bar-chart-outline">This report was not found. It may have been deleted.</Empty></Screen>;

  const exportCsv = async () => {
    try {
      const now = new Date();
      const name = reportFileName(def.name, now);
      await saveTextFile(name, reportCsv(runReport(withDeleted, active, me, now)));
      setSaved(name);
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : String(e));
    }
  };
  const builder = canBuildReports(me);
  const preset = active.filters.date ?? 'thisCycle';

  return (
    <Screen wide>
      <Stack.Screen options={{ title: def.name }} />
      <Text style={text.h2}>{def.name}</Text>
      <Text style={text.muted}>
        {DATASET_LABEL[def.dataset]} · {result.range.label} · {result.total} {result.grouped ? (result.total === 1 ? 'group' : 'groups') : result.total === 1 ? 'row' : 'rows'}
        {builder ? '' : ' · your team only'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: space.sm }}>
        {QUICK_DATES.map((d) => (
          <Chip key={d} label={DATE_LABEL[d]} selected={preset === d} onPress={() => setDate(d)} />
        ))}
        {def.filters.date === 'custom' && <Chip label={DATE_LABEL.custom} selected={preset === 'custom'} onPress={() => setDate('custom')} />}
      </ScrollView>

      <Row style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
        <Button small icon="download-outline" title="Export CSV" onPress={exportCsv} />
        {builder && <Button small variant="secondary" icon={isTemplateId(def.id) ? 'copy-outline' : 'create-outline'} title={isTemplateId(def.id) ? 'Customise' : 'Edit'} onPress={() => router.push({ pathname: '/reports/builder', params: isTemplateId(def.id) ? { from: def.id } : { id: def.id } })} />}
      </Row>
      {!!saved && <Banner tone="success">{saved} is ready.</Banner>}

      {result.grouped && !!result.chart?.length && (
        <>
          <SectionTitle>Chart</SectionTitle>
          <Card>
            <ReportBars result={result} />
            {result.total > (result.chart?.length ?? 0) && <Text style={text.small}>Showing the first {result.chart?.length} groups.</Text>}
          </Card>
        </>
      )}

      <SectionTitle>Table</SectionTitle>
      <View>
        <ReportTable result={result} />
        {result.total > result.rows.length && (
          <Text style={[text.small, { marginTop: space.sm }]}>
            Showing {result.rows.length} of {result.total} rows. The CSV export has all of them.
          </Text>
        )}
      </View>
    </Screen>
  );
}
