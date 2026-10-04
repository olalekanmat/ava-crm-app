import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { signInWith } from '@/cloud/auth';
import { authFor, PROVIDER_LABEL } from '@/cloud/connect';
import { formatDate, formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Button, Card, Row, text } from './components';
import { notify } from './confirm';
import { colors, space } from './theme';

/** Sync status and the Sync button (cloud mode). */
export function SyncCard() {
  const { session, sync, syncNow, me, clearRejected } = useStore();
  const [busy, setBusy] = useState(false);
  if (session?.mode !== 'cloud') return null;

  const reauth = async () => {
    setBusy(true);
    try {
      const acc = await signInWith(authFor(session.folder.provider), session.email);
      if (acc && acc.email !== session.email) notify('Different account', `Sign in as ${session.email} to sync this company.`);
      else if (acc) await syncNow();
    } catch (e) {
      notify('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={text.title}>{sync.syncing ? 'Syncing…' : sync.pending ? `${sync.pending} change${sync.pending > 1 ? 's' : ''} waiting to upload` : 'Everything is uploaded'}</Text>
            <Text style={text.muted}>
              {PROVIDER_LABEL[session.folder.provider]}
              {session.folder.name ? ` · ${session.folder.name}` : ''}
            </Text>
            <Text style={text.small}>{sync.lastSync ? `Last synced ${formatDateTime(sync.lastSync)}` : 'Not synced yet'} · syncs on open and every hour</Text>
          </View>
          <Button small title="Sync" icon="sync-outline" onPress={() => syncNow(true)} disabled={sync.syncing} />
        </Row>
        {!!sync.error && <Text style={[text.muted, { color: colors.warn, marginTop: space.sm }]}>{sync.error}</Text>}
        {sync.needsSignIn && (
          <View style={{ marginTop: space.sm }}>
            <Button small variant="secondary" icon="log-in-outline" title={busy ? 'Signing in…' : `Sign in again as ${session.email}`} onPress={reauth} disabled={busy} />
          </View>
        )}
      </Card>
      {sync.rejected.length > 0 && (
        <>
          <Banner tone="danger">
            {sync.rejected.length} of your change{sync.rejected.length > 1 ? 's' : ''} could not be applied once merged with your team’s: {sync.rejected.slice(-3).join(' · ')}
          </Banner>
          <Button small title="Dismiss" variant="ghost" onPress={clearRejected} />
        </>
      )}
      {me?.role === 'Admin' && sync.warnings.length > 0 && <Banner tone="warn">Ignored in the company folder: {sync.warnings.join(' ')}</Banner>}
    </>
  );
}

/** Tells people when the company licence stops them from making changes. */
export function LicenseBanner() {
  const { session, license, me } = useStore();
  if (session?.mode !== 'cloud' || !me) return null;
  const admin = me.role === 'Admin';
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
