import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { isAdmin } from '@/data/access';
import { formatDate, formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Button, text } from './components';
import { colors, radius, space } from './theme';

const ago = (iso?: string) => {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : formatDateTime(iso);
};

/**
 * Compact save status, shown on every Home screen; the phone app adds a Sync button (the web
 * version saves automatically and only offers Retry after a failed save). Online, changes save
 * automatically a moment after they are made; offline they wait on the device until the next
 * sync (automatic when the connection returns, or by tapping Sync).
 */
export function SyncBar() {
  const { session, sync, syncNow, signOut } = useStore();
  if (!session) return null;
  const waiting = sync.pending > 0;
  const problem = !!sync.error;
  const tone = problem ? colors.warn : waiting ? colors.orange : colors.success;
  const icon = sync.syncing ? 'sync-outline' : problem ? 'cloud-offline-outline' : waiting ? 'cloud-upload-outline' : 'cloud-done-outline';
  const title = sync.syncing
    ? 'Saving to your company’s OneDrive…'
    : problem
      ? waiting
        ? `Offline · ${sync.pending} change${sync.pending > 1 ? 's' : ''} saved on this device`
        : 'Offline · showing data saved on this device'
      : waiting
        ? `${sync.pending} change${sync.pending > 1 ? 's' : ''} waiting to upload`
        : 'All changes saved';
  return (
    <View style={[styles.bar, { borderColor: `${tone}55`, backgroundColor: `${tone}12` }]}>
      <Ionicons name={icon} size={20} color={tone} />
      <View style={{ flex: 1 }}>
        <Text style={[text.title, { fontSize: 14 }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={text.small} numberOfLines={2}>
          {sync.needsSignIn ? 'Your sign-in has expired. Sign out and sign in again.' : problem ? sync.error : `Last synced ${ago(sync.lastSync)}`}
        </Text>
      </View>
      {sync.needsSignIn ? (
        <Button small variant="secondary" title="Sign in" icon="log-in-outline" onPress={signOut} />
      ) : Platform.OS === 'web' && !problem ? null : (
        <Button small variant={waiting || problem ? 'primary' : 'secondary'} title={sync.syncing ? 'Syncing' : Platform.OS === 'web' ? 'Retry' : 'Sync'} icon="sync-outline" onPress={() => syncNow(true)} disabled={sync.syncing} />
      )}
    </View>
  );
}

/** Sync status in detail (More tab): rejected changes and folder warnings. */
export function SyncCard() {
  const { session, sync, me, clearRejected } = useStore();
  if (!session) return null;
  return (
    <>
      <SyncBar />
      {sync.rejected.length > 0 && (
        <>
          <Banner tone="danger">
            {sync.rejected.length} of your change{sync.rejected.length > 1 ? 's' : ''} could not be applied once merged with your team’s: {sync.rejected.slice(-3).join(' · ')}
          </Banner>
          <Button small title="Dismiss" variant="ghost" onPress={clearRejected} />
        </>
      )}
      {isAdmin(me) && sync.warnings.length > 0 && <Banner tone="warn">Ignored in the company folder: {sync.warnings.join(' ')}</Banner>}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, marginBottom: space.md },
});

/** Tells people when the company licence stops them from making changes. */
export function LicenseBanner() {
  const { session, license, me } = useStore();
  if (session?.mode !== 'cloud' || !me) return null;
  const admin = isAdmin(me);
  const go = admin ? () => router.push('/admin/company') : undefined;
  const msg = (() => {
    switch (license.state) {
      case 'active':
        return license.daysLeft <= 14 ? { tone: 'warn' as const, text: `Your Ava CRM subscription ends on ${formatDate(license.payload.subscriptionEnd.slice(0, 10))}.${admin ? ' Contact Ava Healthcare to renew.' : ''}` } : null;
      case 'pending':
      case 'none':
        return { tone: 'info' as const, text: admin ? 'Waiting for Ava Healthcare to approve your company. You can set up users, accounts and products meanwhile.' : 'Your company is waiting for approval. You can look around; changes are off until then.' };
      case 'revoked':
        return { tone: 'danger' as const, text: 'Your company’s Ava CRM access was ended by Ava Healthcare. Data is read-only and stays in your drive.' };
      case 'expired':
        return { tone: 'danger' as const, text: 'Your company’s Ava CRM subscription has expired, or this device could not renew it for 14 days. Data is read-only until it syncs a valid licence.' };
      case 'invalid':
        return { tone: 'danger' as const, text: 'The licence in your company folder is not valid. Your administrator can request approval again.' };
      default:
        return null;
    }
  })();
  if (!msg) return null;
  return (
    <View>
      <Banner tone={msg.tone}>{msg.text}</Banner>
      {go && license.state !== 'active' && <Button small variant="ghost" title="Company & approval" icon="chevron-forward" onPress={go} />}
    </View>
  );
}
