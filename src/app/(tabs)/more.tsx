import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { roleLabel } from '@/data/access';
import { useMe, useStore } from '@/data/store';
import { BrandTitle } from '@/ui/Brand';
import { Button, Card, ListRow, Row, SectionTitle, UserAvatar, text } from '@/ui/components';
import { confirm } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { SyncCard } from '@/ui/SyncCard';
import { colors, space } from '@/ui/theme';

export default function MoreScreen() {
  const me = useMe();
  const { session, sync, signOut, getUser, company, admin } = useStore();
  const manager = getUser(me.managerId);

  return (
    <Screen>
      <Card onPress={() => router.push('/profile')}>
        <Row gap={space.md}>
          <UserAvatar user={me} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={text.h2}>{me.name}</Text>
            <Text style={text.muted}>
              {roleLabel(me)}
              {me.territory ? ` · ${me.territory}` : ''}
            </Text>
            <Text style={text.small}>
              {me.email}
              {manager ? ` · reports to ${manager.name}` : ''}
            </Text>
            <Text style={[text.link, { fontSize: 13, marginTop: 2 }]}>{me.photo ? 'View profile' : 'Add a profile photo'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Row>
      </Card>

      {session?.mode === 'cloud' && (
        <>
          <SectionTitle>Sync</SectionTitle>
          <SyncCard />
        </>
      )}

      <SectionTitle>Account</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="key-outline" title="Change password" subtitle={session?.companyCode ? `Company code ${session.companyCode}` : undefined} onPress={() => router.push('/password')} />
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="download-outline" tone={colors.success} title="Export data" subtitle="CSV files you can open in Excel or Sheets" onPress={() => router.push('/export')} />
        {admin && <ListRow icon="cloud-upload-outline" tone={colors.orange} title="Import CSV" subtitle="Accounts, users, products" onPress={() => router.push('/admin/import')} />}
        {admin && <ListRow icon="business-outline" tone={colors.primaryDark} title="Company & approval" subtitle={`${company.name} · company code, logo, OneDrive folder, licence`} onPress={() => router.push('/admin/company')} />}
        {admin && <ListRow icon="people-outline" title="Users & roles" onPress={() => router.push('/admin/users')} />}
        {admin && <ListRow icon="layers-outline" tone={colors.orange} title="Tier names" subtitle="Tiering for each team (default ST, T1, T2, T3)" onPress={() => router.push('/admin/tiers')} />}
        {admin && <ListRow icon="options-outline" tone={colors.crimson} title="Products & rules" subtitle="Product catalogue, check-in rules, quarterly cycles" onPress={() => router.push('/admin/settings')} />}
        {admin && <ListRow icon="document-lock-outline" tone={colors.muted} title="Audit log" subtitle="Every change, who made it and when" onPress={() => router.push('/admin/audit')} />}
        {(me.role === 'SLM' || admin) && <ListRow icon="globe-outline" title="Organisation overview" onPress={() => router.push('/overview')} />}
      </Card>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={() => confirm('Sign out?', sync.pending ? `${sync.pending} change(s) have not been uploaded yet and will be lost. Connect to the internet and tap Sync first.` : 'Your data stays in your company’s OneDrive. Sign in again with your email and password.', signOut, 'Sign out')} />
      </View>

      <View style={{ alignItems: 'center', marginTop: space.xxl, gap: 4 }}>
        <BrandTitle size={22} />
        <Text style={text.small}>
          Version {Constants.expoConfig?.version ?? '1.0.0'} · {company.name} · data in your company’s OneDrive
        </Text>
      </View>
    </Screen>
  );
}
