import { router } from 'expo-router';
import { Text } from 'react-native';
import { providerLabel } from '@/cloud/drive';
import { cycleCalls } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { Hero, HeroStat, heroText } from '@/ui/Brand';
import { Card, ListRow, Row, SectionTitle } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { LicenseBanner, SyncBar } from '@/ui/SyncCard';
import { colors, space } from '@/ui/theme';

export function AdminHome() {
  const me = useMe();
  const { data, cycle, session, syncNow, sync, company } = useStore();
  const reps = data.users.filter((u) => u.role === 'Rep' && u.active).length;
  const inCycle = cycle ? cycleCalls(data.calls, cycle).length : 0;
  return (
    <Screen onRefresh={syncNow} refreshing={sync.syncing}>
      <Hero>
        <Text style={heroText.eyebrow}>Administration</Text>
        <Text style={heroText.title}>{company.name}</Text>
        <Text style={heroText.body}>Signed in as {me.name}</Text>
        <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          <HeroStat label="Users" value={data.users.filter((u) => u.active).length} />
          <HeroStat label="Reps" value={reps} />
          <HeroStat label="Accounts" value={data.accounts.length} />
          <HeroStat label={`Calls ${cycle?.name ?? ''}`} value={inCycle} />
        </Row>
      </Hero>

      <SyncBar />
      <LicenseBanner />

      <SectionTitle>Manage</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="business-outline" tone={colors.primaryDark} title="Company & approval" subtitle={`Company code, logo, details, ${providerLabel(session?.folder.provider)} folder, licence`} onPress={() => router.push('/admin/company')} />
        <ListRow icon="people-outline" title="Users & roles" subtitle="Reps, FLMs, SLMs and admins; reporting lines" onPress={() => router.push('/admin/users')} />
        <ListRow icon="cloud-upload-outline" tone={colors.orange} title="Import CSV" subtitle="Accounts, users or products from a spreadsheet" onPress={() => router.push('/admin/import')} />
        <ListRow icon="download-outline" tone={colors.success} title="Export data" subtitle="Calls, accounts, plans and team KPIs as CSV" onPress={() => router.push('/export')} />
        <ListRow icon="layers-outline" tone={colors.orange} title="Tier names" subtitle="Tiering for each team (default ST, T1, T2, T3)" onPress={() => router.push('/admin/tiers')} />
        <ListRow icon="options-outline" tone={colors.crimson} title="Products & rules" subtitle="Product catalogue, check-in rules, planning cycles" onPress={() => router.push('/admin/settings')} />
        {<ListRow icon="document-lock-outline" tone={colors.muted} title="Audit log" subtitle="Every change, who made it and when" onPress={() => router.push('/admin/audit')} />}
      </Card>

      <SectionTitle>Insights</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="globe-outline" title="Organisation overview" subtitle="All teams, rep ranking and tier coverage" onPress={() => router.push('/overview')} />
      </Card>
    </Screen>
  );
}
