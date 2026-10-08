import { router } from 'expo-router';
import { Text } from 'react-native';
import { allReports, canBuildReports, canViewReports, DATASET_LABEL, DATE_LABEL, GROUP_LABEL, isTemplateId } from '@/data/reports';
import { useMe, useStore } from '@/data/store';
import type { ReportDataset, ReportDef } from '@/data/types';
import { Button, Card, Empty, ListRow, SectionTitle, text, type IconName } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const ICON: Record<ReportDataset, IconName> = { calls: 'chatbubbles-outline', accounts: 'business-outline', plans: 'calendar-outline', activity: 'pulse-outline' };

const summary = (r: ReportDef) =>
  [DATASET_LABEL[r.dataset], DATE_LABEL[r.filters.date ?? 'thisCycle'], r.groupBy !== 'none' ? `by ${GROUP_LABEL[r.groupBy].toLowerCase()}` : undefined].filter(Boolean).join(' · ');

/** Reports: the company's saved reports and the built-in templates. */
export default function ReportsScreen() {
  const me = useMe();
  const { data } = useStore();
  if (!canViewReports(me)) return <Screen><Empty icon="bar-chart-outline">Reports are for managers and administrators.</Empty></Screen>;
  const builder = canBuildReports(me);
  const reports = allReports(data.settings.reports);
  const saved = reports.filter((r) => !isTemplateId(r.id));
  const templates = reports.filter((r) => isTemplateId(r.id));
  const open = (r: ReportDef) => router.push({ pathname: '/reports/[id]', params: { id: r.id } });

  return (
    <Screen>
      <Text style={[text.muted, { marginBottom: space.md }]}>
        {builder
          ? 'Build reports on calls, accounts, plans and team activity, then export them as CSV. Saved reports are shared with your managers, who see them for their own teams.'
          : 'Reports set up by your administrators, showing your own team’s data. Export any of them as CSV.'}
      </Text>
      {builder && <Button title="New report" icon="add" onPress={() => router.push('/reports/builder')} />}

      <SectionTitle>Saved reports ({saved.length})</SectionTitle>
      {saved.length ? (
        <Card style={{ padding: 0 }}>
          {saved.map((r) => (
            <ListRow key={r.id} icon={ICON[r.dataset]} title={r.name} subtitle={summary(r)} onPress={() => open(r)} />
          ))}
        </Card>
      ) : (
        <Empty icon="bar-chart-outline">{builder ? 'No saved reports yet. Start from a template below or build a new one.' : 'No saved reports yet. The templates below are ready to use.'}</Empty>
      )}

      <SectionTitle>Templates</SectionTitle>
      <Card style={{ padding: 0 }}>
        {templates.map((r) => (
          <ListRow key={r.id} icon={ICON[r.dataset]} tone={colors.orange} title={r.name} subtitle={summary(r)} onPress={() => open(r)} />
        ))}
      </Card>
    </Screen>
  );
}
