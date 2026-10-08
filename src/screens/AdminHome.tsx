import { router } from 'expo-router';
import { Text } from 'react-native';
import { cycleCalls } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { Card, ListRow, SectionTitle } from '@/ui/components';
import { Grid } from '@/ui/layout';
import { StatSplit, Tile } from '@/ui/Tiles';
import { Screen } from '@/ui/Screen';
import { LicenseBanner } from '@/ui/SyncCard';
import { colors, tone } from '@/ui/theme';
import { CompanyTile, HeroButton, HomeHeader, SyncTile } from './HomeTiles';

export function AdminHome() {
  const me = useMe();
  const { data, cycle, syncNow, sync, company } = useStore();
  const reps = data.users.filter((u) => u.role === 'Rep' && u.active).length;
  const inCycle = cycle ? cycleCalls(data.calls, cycle).length : 0;
  return (
    <Screen wide onRefresh={syncNow} refreshing={sync.syncing}>
      <LicenseBanner />
      <HomeHeader
        eyebrow="Administration"
        title={company.name}
        summary={`Signed in as ${me.name}`}
        actions={
          <>
            <HeroButton title="Users" icon="people-outline" onPress={() => router.push('/admin/users')} />
            <HeroButton title="Export" icon="download-outline" onPress={() => router.push('/export')} />
          </>
        }
      />

      <Grid min={290} max={3}>
        <CompanyTile key="company" cycle={cycle} />
        <Tile key="org" title="Organisation" icon="people-outline" onPress={() => router.push('/admin/users')}>
          <StatSplit
            items={[
              { value: data.users.filter((u) => u.active).length, label: 'Users', color: tone.normal },
              { value: reps, label: 'Reps', color: tone.normal },
              { value: data.accounts.length, label: 'Accounts', color: tone.normal },
            ]}
          />
          <Text style={{ marginTop: 12, textAlign: 'center', color: colors.faint, fontSize: 12 }}>{inCycle} calls submitted in {cycle?.name ?? 'this cycle'}</Text>
        </Tile>
        <SyncTile key="sync" />
      </Grid>

      <SectionTitle>Manage</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="business-outline" tone={colors.primaryDark} title="Company & approval" subtitle="Company code, logo, details, OneDrive folder, licence" onPress={() => router.push('/admin/company')} />
        <ListRow icon="people-outline" title="Users & roles" subtitle="Reps, FLMs, SLMs and admins; reporting lines" onPress={() => router.push('/admin/users')} />
        <ListRow icon="cloud-upload-outline" tone={colors.orange} title="Import CSV" subtitle="Accounts, users or products from a spreadsheet" onPress={() => router.push('/admin/import')} />
        <ListRow icon="download-outline" tone={colors.success} title="Export data" subtitle="Calls, accounts, plans and team KPIs as CSV" onPress={() => router.push('/export')} />
        <ListRow icon="layers-outline" tone={colors.orange} title="Tier names" subtitle="Tiering for each team (default ST, T1, T2, T3)" onPress={() => router.push('/admin/tiers')} />
        <ListRow icon="options-outline" tone={colors.crimson} title="Products & rules" subtitle="Product catalogue, check-in rules, quarterly cycles" onPress={() => router.push('/admin/settings')} />
        {<ListRow icon="document-lock-outline" tone={colors.muted} title="Audit log" subtitle="Every change, who made it and when" onPress={() => router.push('/admin/audit')} />}
      </Card>

      <SectionTitle>Insights</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="globe-outline" title="Organisation overview" subtitle="All teams, rep ranking and tier coverage" onPress={() => router.push('/overview')} />
      </Card>
    </Screen>
  );
}
