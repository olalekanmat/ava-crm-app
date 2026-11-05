import { router } from 'expo-router';
import { providerLabel } from '@/cloud/drive';
import { useStore } from '@/data/store';
import { Card, Empty, ListRow, SectionTitle } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors } from '@/ui/theme';

/** 2.14: the administrator's settings in one place, so the More tab stays short. */
export default function AdminIndex() {
  const { admin, company, session } = useStore();
  const drive = providerLabel(session?.folder.provider);
  if (!admin) return <Screen><Empty icon="lock-closed-outline">Only administrators see these settings.</Empty></Screen>;
  return (
    <Screen>
      <SectionTitle>Company and people</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="business-outline" tone={colors.primaryInk} title="Company & approval" subtitle={`${company.name} · company code, logo, ${drive} folder, licence`} onPress={() => router.push('/admin/company')} />
        <ListRow icon="people-outline" title="Users & roles" subtitle="Line roles plus Finance, Marketing, Medical, Warehouse, key accounts, viewers and distributors" onPress={() => router.push('/admin/users')} />
        <ListRow icon="swap-horizontal-outline" tone={colors.orange} title="Hand over work" subtitle="Move a leaver’s accounts, plans and stock to someone else" onPress={() => router.push('/admin/handover')} />
        <ListRow icon="shield-checkmark-outline" tone={colors.primaryInk} title="Sign-in & app versions" subtitle="Two-step sign-in, app versions, who signed in as whom" onPress={() => router.push('/admin/security')} />
      </Card>
      <SectionTitle>Products and rules</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="options-outline" tone={colors.crimson} title="Products & rules" subtitle="Product catalogue, check-in rules, planning cycles" onPress={() => router.push('/admin/settings')} />
        <ListRow icon="layers-outline" tone={colors.orange} title="Tier names" subtitle="Tiering for each team (default ST, T1, T2, T3)" onPress={() => router.push('/admin/tiers')} />
      </Card>
      <SectionTitle>Data</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="cloud-upload-outline" tone={colors.orange} title="Import CSV" subtitle="Accounts, users, products" onPress={() => router.push('/admin/import')} />
        <ListRow icon="grid-outline" tone={colors.success} title="Edit in a grid" subtitle="Change many accounts or users at once, with undo" onPress={() => router.push('/admin/grid')} />
        <ListRow icon="git-merge-outline" tone={colors.primaryInk} title="Duplicates" subtitle="Find and merge duplicate doctors and hospitals" onPress={() => router.push('/admin/duplicates')} />
        <ListRow icon="link-outline" tone={colors.success} title="Live data for Excel" subtitle="Tables Excel and Power BI refresh from your drive" onPress={() => router.push('/admin/live-data')} />
        <ListRow icon="document-lock-outline" tone={colors.muted} title="Audit log" subtitle="Every change, who made it and when" onPress={() => router.push('/admin/audit')} />
      </Card>
    </Screen>
  );
}
