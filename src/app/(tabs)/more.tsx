import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, Platform, Text, View } from 'react-native';
import { providerLabel } from '@/cloud/drive';
import { APP_VERSION } from '@/cloud/relay';
import { roleLabel } from '@/data/access';
import { canViewReports } from '@/data/reports';
import { feedbackMail, PLAY_URL } from '@/data/reviewPrompt';
import { useMe, useStore } from '@/data/store';
import { BrandTitle } from '@/ui/Brand';
import { Button, Card, ListRow, Row, SectionTitle, UserAvatar, text } from '@/ui/components';
import { TrialBadge } from '@/ui/TrialBadge';
import { confirm } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { SyncCard } from '@/ui/SyncCard';
import { colors, space } from '@/ui/theme';

export default function MoreScreen() {
  const me = useMe();
  const { session, sync, signOut, getUser, company, admin, erp } = useStore();
  const manager = getUser(me.managerId);
  const drive = providerLabel(session?.folder.provider);

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
            <TrialBadge />
            <Text style={text.small}>
              {me.email}
              {manager ? ` · reports to ${manager.name}` : ''}
            </Text>
            <Text style={[text.link, { fontSize: 13, marginTop: 2 }]}>{me.photo ? 'View profile' : 'Add a profile photo'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Row>
      </Card>

      {session?.mode === 'cloud' && !session.demo && (
        <>
          <SectionTitle>Sync</SectionTitle>
          <SyncCard />
        </>
      )}

      {erp && (
        <>
          <SectionTitle>Ava ERP</SectionTitle>
          <Card style={{ padding: 0 }}>
            <ListRow icon="add-circle-outline" title="New sale" subtitle="Sell and invoice in a few taps" onPress={() => router.push('/erp/sale')} />
            <ListRow icon="stats-chart-outline" tone={colors.success} title="Sales & invoices" subtitle="What was sold, collected and is owed" onPress={() => router.push('/erp')} />
            <ListRow icon="people-outline" tone={colors.primaryInk} title="Customers & balances" subtitle="Who owes what, statements" onPress={() => router.push('/erp/customers')} />
            <ListRow icon="cube-outline" tone={colors.orange} title="Stock" subtitle={me.role === 'Rep' ? 'What you hold' : 'Warehouse and team stock'} onPress={() => router.push('/erp/stock')} />
          </Card>
        </>
      )}

      <SectionTitle>Field work</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="checkbox-outline" title="Tasks & reminders" subtitle="Follow-ups and to-dos, with phone reminders" onPress={() => router.push('/tasks')} />
        {me.role !== 'Admin' && <ListRow icon="map-outline" tone={colors.success} title="Today’s route" subtitle="Today’s visits in the best order" onPress={() => router.push('/route')} />}
        <ListRow icon="earth-outline" tone={colors.sky} title="Accounts map" subtitle="Accounts by tier, with overdue ones ringed in red" onPress={() => router.push('/map')} />
        {me.role !== 'Rep' && <ListRow icon="trending-up-outline" tone={colors.primary} title="Tier review" subtitle="Ava’s suggested tier changes for your team" onPress={() => router.push('/tier-review')} />}
        <ListRow icon="airplane-outline" tone={colors.orange} title="Leave" subtitle={me.role === 'Rep' ? 'Ask for leave; your plan adjusts' : 'Ask for leave and approve your team’s'} onPress={() => router.push('/leave')} />
        <ListRow icon="medkit-outline" tone={colors.crimson} title="Samples" subtitle={me.role === 'Rep' ? 'Your stock and what you handed out' : 'Issue samples and see team stock'} onPress={() => router.push('/samples')} />
        <ListRow icon="school-outline" tone={colors.primaryInk} title="Coaching" subtitle={me.role === 'Rep' ? 'Feedback from coached visits' : 'Score coached visits'} onPress={() => router.push('/coaching')} />
        <ListRow icon="people-circle-outline" tone={colors.sky} title="Events" subtitle="CMEs, round tables and meetings: invites, attendance, budget" onPress={() => router.push('/events')} />
        <ListRow icon="checkmark-done-outline" tone={colors.success} title="Approvals" subtitle={me.role === 'Rep' ? 'Corrections and new accounts you sent' : 'Account corrections and new accounts to check'} onPress={() => router.push('/approvals')} />
        {me.role !== 'Rep' && <ListRow icon="newspaper-outline" tone={colors.orange} title="Weekly summary" subtitle="Your team’s week, with coaching tips" onPress={() => router.push('/weekly')} />}
      </Card>

      <SectionTitle>Display & help</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="contrast-outline" title="Display & calendar" subtitle="Dark mode, text size, phone calendar" onPress={() => router.push('/appearance')} />
        <ListRow icon="sparkles-outline" tone={colors.orange} title="What’s new" subtitle="What changed in this version" onPress={() => router.push('/whats-new')} />
        <ListRow icon="compass-outline" tone={colors.primary} title="Take the tour" subtitle="A quick look at what Ava can do" onPress={() => router.push('/tour')} />
        {Platform.OS !== 'ios' && <ListRow icon="star-outline" tone={colors.orange} title="Rate Ava CRM" subtitle="Tell others what you think on Google Play" onPress={() => Linking.openURL(PLAY_URL)} />}
        <ListRow icon="chatbubble-ellipses-outline" tone={colors.success} title="Send feedback" subtitle="Ideas or problems? Tell us directly" onPress={() => Linking.openURL(feedbackMail(APP_VERSION, Platform.OS))} />
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="key-outline" title="Change password" subtitle={session?.companyCode ? `Company code ${session.companyCode}` : undefined} onPress={() => router.push('/password')} />
        {admin && <ListRow icon="trash-outline" title="Delete my account" tone={colors.danger} onPress={() => router.push('/delete-account')} />}
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="download-outline" tone={colors.success} title="Export data" subtitle="CSV files you can open in Excel or Sheets" onPress={() => router.push('/export')} />
        {canViewReports(me) && <ListRow icon="bar-chart-outline" tone={colors.primary} title="Reports" subtitle={admin ? 'Build, save and export reports' : 'Your team’s reports, as tables and CSV'} onPress={() => router.push('/reports')} />}
        {admin && <ListRow icon="cloud-upload-outline" tone={colors.orange} title="Import CSV" subtitle="Accounts, users, products" onPress={() => router.push('/admin/import')} />}
        {admin && <ListRow icon="business-outline" tone={colors.primaryInk} title="Company & approval" subtitle={`${company.name} · company code, logo, ${drive} folder, licence`} onPress={() => router.push('/admin/company')} />}
        {admin && <ListRow icon="people-outline" title="Users & roles" onPress={() => router.push('/admin/users')} />}
        {admin && <ListRow icon="grid-outline" tone={colors.success} title="Edit in a grid" subtitle="Change many accounts or users at once, with undo" onPress={() => router.push('/admin/grid')} />}
        {admin && <ListRow icon="swap-horizontal-outline" tone={colors.orange} title="Hand over work" subtitle="Move a leaver’s accounts, plans and stock to someone else" onPress={() => router.push('/admin/handover')} />}
        {admin && <ListRow icon="shield-checkmark-outline" tone={colors.primaryInk} title="Sign-in & app versions" subtitle="Two-step sign-in, app versions, who signed in as whom" onPress={() => router.push('/admin/security')} />}
        {admin && <ListRow icon="layers-outline" tone={colors.orange} title="Tier names" subtitle="Tiering for each team (default ST, T1, T2, T3)" onPress={() => router.push('/admin/tiers')} />}
        {admin && <ListRow icon="options-outline" tone={colors.crimson} title="Products & rules" subtitle="Product catalogue, check-in rules, planning cycles" onPress={() => router.push('/admin/settings')} />}
        {admin && <ListRow icon="git-merge-outline" tone={colors.primaryInk} title="Duplicates" subtitle="Find and merge duplicate doctors and hospitals" onPress={() => router.push('/admin/duplicates')} />}
        {admin && <ListRow icon="link-outline" tone={colors.success} title="Live data for Excel" subtitle="Tables Excel and Power BI refresh from your drive" onPress={() => router.push('/admin/live-data')} />}
        {admin && <ListRow icon="document-lock-outline" tone={colors.muted} title="Audit log" subtitle="Every change, who made it and when" onPress={() => router.push('/admin/audit')} />}
        {(me.role === 'SLM' || admin) && <ListRow icon="globe-outline" title="Organisation overview" onPress={() => router.push('/overview')} />}
      </Card>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={() => confirm('Sign out?', sync.pending ? `${sync.pending} change(s) have not been uploaded yet and will be lost. Connect to the internet and tap Sync first.` : `Your data stays in your company’s ${drive}. Sign in again with your email and password.`, signOut, 'Sign out')} />
      </View>

      <View style={{ alignItems: 'center', marginTop: space.xxl, gap: 4 }}>
        <BrandTitle size={22} />
        <Text style={text.small}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </View>
    </Screen>
  );
}
