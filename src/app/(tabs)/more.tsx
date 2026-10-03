import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { useMe, useStore } from '@/data/store';
import { ROLE_LABEL, ROLES } from '@/data/types';
import { BrandTitle } from '@/ui/Brand';
import { Avatar, Banner, Button, Card, ListRow, Row, SectionTitle, text } from '@/ui/components';
import { confirm } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

export default function MoreScreen() {
  const me = useMe();
  const { session, demoUsers, sync, syncNow, signOut, signInDemo, resetDemoData, getUser, clearRejected } = useStore();
  const demo = session?.mode === 'demo';
  const manager = getUser(me.managerId);

  return (
    <Screen>
      <Card>
        <Row gap={space.md}>
          <Avatar name={me.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={text.h2}>{me.name}</Text>
            <Text style={text.muted}>
              {ROLE_LABEL[me.role]}
              {me.territory ? ` · ${me.territory}` : ''}
            </Text>
            <Text style={text.small}>
              {me.email}
              {manager ? ` · reports to ${manager.name}` : ''}
            </Text>
          </View>
        </Row>
      </Card>

      {session?.mode === 'server' && (
        <>
          <SectionTitle>Sync</SectionTitle>
          <Card>
            <Text style={text.title}>{sync.syncing ? 'Syncing…' : sync.pending ? `${sync.pending} change${sync.pending > 1 ? 's' : ''} waiting to sync` : 'All changes synced'}</Text>
            <Text style={text.muted}>
              {session.serverUrl}
              {sync.lastSync ? ` · last synced ${formatDateTime(sync.lastSync)}` : ''}
            </Text>
            {!!sync.error && <Text style={[text.muted, { color: colors.warn, marginTop: 4 }]}>{sync.error} Your work is saved on this device and will sync when the server is reachable.</Text>}
            <View style={{ marginTop: space.md }}>
              <Button small title="Sync now" icon="sync-outline" variant="secondary" onPress={syncNow} />
            </View>
          </Card>
          {sync.rejected.length > 0 && (
            <>
              <Banner tone="danger">The server refused {sync.rejected.length} change{sync.rejected.length > 1 ? 's' : ''}: {sync.rejected.join(' · ')}</Banner>
              <Button small title="Dismiss" variant="ghost" onPress={clearRejected} />
            </>
          )}
        </>
      )}

      {demo && (
        <>
          <SectionTitle>Demo: switch role</SectionTitle>
          <Card style={{ padding: 0 }}>
            {ROLES.flatMap((r) => demoUsers.filter((u) => u.role === r && u.active))
              .slice(0, 12)
              .map((u) => (
                <ListRow
                  key={u.id}
                  title={u.name}
                  subtitle={`${ROLE_LABEL[u.role]}${u.territory ? ` · ${u.territory}` : ''}`}
                  icon={u.role === 'Rep' ? 'person-outline' : u.role === 'Admin' ? 'shield-checkmark-outline' : 'people-outline'}
                  onPress={u.id === me.id ? undefined : () => signInDemo(u.id).then(() => router.navigate('/'))}
                  right={u.id === me.id ? <Text style={text.small}>Current</Text> : undefined}
                />
              ))}
          </Card>
        </>
      )}

      <SectionTitle>Data</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="download-outline" tone={colors.success} title="Export data" subtitle="CSV files you can open in Excel or Sheets" onPress={() => router.push('/export')} />
        {me.role === 'Admin' && <ListRow icon="cloud-upload-outline" tone={colors.orange} title="Import CSV" subtitle="Accounts, users, products" onPress={() => router.push('/admin/import')} />}
        {me.role === 'Admin' && <ListRow icon="people-outline" title="Users & roles" onPress={() => router.push('/admin/users')} />}
        {me.role === 'Admin' && <ListRow icon="options-outline" tone={colors.crimson} title="Cycles, products & rules" onPress={() => router.push('/admin/settings')} />}
        {(me.role === 'SLM' || me.role === 'Admin') && <ListRow icon="globe-outline" title="Organisation overview" onPress={() => router.push('/overview')} />}
      </Card>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        {demo && (
          <Button
            title="Reset demo data"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => confirm('Reset demo data?', 'Everything you changed in the demo is replaced with the original sample data.', resetDemoData, 'Reset')}
          />
        )}
        <Button title={demo ? 'Leave demo' : 'Sign out'} variant="danger" icon="log-out-outline" onPress={() => (demo ? signOut() : confirm('Sign out?', sync.pending ? `${sync.pending} change(s) have not synced yet and will be lost.` : 'You will need your password to sign in again.', signOut, 'Sign out'))} />
      </View>

      <View style={{ alignItems: 'center', marginTop: space.xxl, gap: 4 }}>
        <BrandTitle size={22} />
        <Text style={text.small}>
          Version {Constants.expoConfig?.version ?? '1.0.0'} · {demo ? 'Demo mode, data on this device' : 'Connected to server'}
        </Text>
      </View>
    </Screen>
  );
}
