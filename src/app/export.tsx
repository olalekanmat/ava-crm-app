import { useState } from 'react';
import { Text, View } from 'react-native';
import { exportAccounts, exportCalls, exportCyclePlans, exportTeamSummary, exportUsers } from '@/data/csv';
import { todayKey } from '@/data/dates';
import { isAdmin } from '@/data/access';
import { useMe, useStore } from '@/data/store';
import { Banner, Button, Card, Row, text, type IconName } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { saveTextFile } from '@/ui/files';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function ExportScreen() {
  const me = useMe();
  const { data, cycle } = useStore();
  const [done, setDone] = useState<string>();
  const stamp = todayKey();

  const items: { key: string; icon: IconName; title: string; desc: string; count: string; build: () => string; show: boolean }[] = [
    { key: 'calls', icon: 'chatbubbles-outline', title: 'Calls', desc: 'Every call with products, key messages, notes and check-in location', count: `${data.calls.length} rows`, build: () => exportCalls(data), show: true },
    { key: 'accounts', icon: 'business-outline', title: 'Accounts', desc: 'Same columns as the import template, so it can be edited and re-imported', count: `${data.accounts.length} rows`, build: () => exportAccounts(data), show: true },
    { key: 'plans', icon: 'calendar-outline', title: `Cycle plans (${cycle?.name ?? '–'})`, desc: 'Planned vs done per rep and account', count: `${data.plans.filter((p) => p.cycleId === cycle?.id).length} plans`, build: () => (cycle ? exportCyclePlans(data, cycle) : ''), show: !!cycle },
    { key: 'team', icon: 'stats-chart-outline', title: `Team KPIs (${cycle?.name ?? '–'})`, desc: 'Attainment, reach, geo-verified share and drafts per rep', count: `${data.users.filter((u) => u.role === 'Rep').length} reps`, build: () => (cycle ? exportTeamSummary(data, cycle) : ''), show: !!cycle && me.role !== 'Rep' },
    { key: 'users', icon: 'people-outline', title: 'Users', desc: 'Same columns as the user import template', count: `${data.users.length} rows`, build: () => exportUsers(data), show: isAdmin(me) },
  ];

  const run = async (key: string, build: () => string) => {
    try {
      const name = `ava-${key}-${stamp}.csv`;
      await saveTextFile(name, build());
      setDone(name);
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Text style={[text.muted, { marginBottom: space.md }]}>
        {isAdmin(me) ? 'Exports include the whole organisation.' : me.role === 'Rep' ? 'Exports include your own data.' : 'Exports include your team’s data.'} Files are UTF-8 CSV and open in Excel, Google Sheets or Power BI.
      </Text>
      {!!done && <Banner tone="success">{done} is ready.</Banner>}
      {items
        .filter((i) => i.show)
        .map((i) => (
          <Card key={i.key}>
            <Row gap={space.md}>
              <Ionicons name={i.icon} size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={text.title}>{i.title}</Text>
                <Text style={text.muted}>{i.desc}</Text>
                <Text style={text.small}>{i.count}</Text>
              </View>
              <Button small title="CSV" icon="download-outline" onPress={() => run(i.key, i.build)} />
            </Row>
          </Card>
        ))}
    </Screen>
  );
}
