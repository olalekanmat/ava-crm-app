import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { ApiError, api, loadToken } from '@/cloud/relay';
import { isAdmin } from '@/data/access';
import { useMe, useStore } from '@/data/store';
import { Banner, Button, Card, Field, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/**
 * Delete your own account (administrators only since 2.6; others ask an administrator): the sign-in and profile photo go at once, and the work
 * the person recorded stays with the company for an administrator to reassign. The company's only
 * administrator closes the whole company instead (the server forgets it; the folder stays theirs).
 */
export default function DeleteAccountScreen() {
  const me = useMe();
  const { data, run, uploadNow, signOut, company } = useStore();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const lastAdmin = isAdmin(me) && !data.users.some((u) => u.id !== me.id && u.active && isAdmin(u));
  if (!isAdmin(me)) {
    return (
      <Screen>
        <Banner tone="info">Your administrator manages your Ava CRM account. To have it deleted, ask them to remove you in Users &amp; roles.</Banner>
      </Screen>
    );
  }

  const finish = async (title: string, message: string, folderUrl?: string) => {
    await signOut();
    notify(title, message);
    if (folderUrl) Linking.openURL(folderUrl).catch(() => {});
  };

  const remove = async () => {
    setError(undefined);
    if (!password) return setError('Enter your password to confirm.');
    setBusy(true);
    try {
      const token = await loadToken();
      if (!token) throw new Error('Please sign in again.');
      if (lastAdmin) {
        const r = await api.deleteAccount(token, password, true);
        return await finish(
          'Company closed',
          `Ava CRM no longer holds ${company.name}'s sign-ins, company code or licence. The data folder stays in your ${r.provider === 'google' ? 'Google Drive' : 'OneDrive'}; delete it there if you no longer need it.`,
        );
      }
      // Record it in the company data first, so administrators see who left, then remove the sign-in.
      try {
        run({ type: 'user.leave' });
        await uploadNow();
      } catch {
        // The server still blocks the sign-in below.
      }
      await api.deleteAccount(token, password);
      await finish('Account deleted', 'Your sign-in and profile photo are gone. The calls and plans you recorded stay with your company, which owns that data.');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'last_admin') setError('You are now the only administrator. Make someone else an administrator first, or try again to close the company.');
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ask = () =>
    confirm(
      lastAdmin ? 'Close the company?' : 'Delete your account?',
      lastAdmin ? `Everyone at ${company.name} will lose access to Ava CRM. This cannot be undone.` : 'You will be signed out and cannot sign in again. This cannot be undone.',
      remove,
      lastAdmin ? 'Close company' : 'Delete',
    );

  return (
    <Screen>
      <Card>
        <Text style={[text.title, { marginBottom: space.sm }]}>{lastAdmin ? 'Delete your account and close the company' : 'Delete your account'}</Text>
        {lastAdmin ? (
          <>
            <Text style={[text.body, { marginBottom: space.sm }]}>You are {company.name}&apos;s only administrator, so deleting your account closes the company on Ava CRM:</Text>
            <Bullet>Nobody at {company.name} can sign in any more.</Bullet>
            <Bullet>Ava CRM forgets your company code, everyone&apos;s passwords, the link to your company folder and your licence.</Bullet>
            <Bullet>The company folder in your drive stays yours. Delete it there if you no longer need the data.</Bullet>
            <Text style={[text.small, { marginTop: space.sm }]}>To keep the company running, make someone else an administrator in Users & roles first; then deleting your account removes only you.</Text>
          </>
        ) : (
          <>
            <Bullet>Your sign-in and profile photo are deleted, and you are signed out on this device.</Bullet>
            <Bullet>The calls, plans and accounts you recorded belong to {company.name || 'your company'} and stay with it, so your manager can hand them to someone else.</Bullet>
            <Bullet>Your administrator can restore your access later with a password reset.</Bullet>
          </>
        )}
      </Card>
      {!!error && <Banner tone="danger">{error}</Banner>}
      <Field label="Your password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" onSubmitEditing={ask} />
      <Button title={busy ? 'Deleting…' : lastAdmin ? 'Delete account and close company' : 'Delete my account'} icon="trash-outline" variant="danger" onPress={ask} disabled={busy} />
      <View style={{ height: space.md }} />
      <Button title="Keep my account" variant="secondary" onPress={() => router.back()} disabled={busy} />
      <Text style={[text.small, { marginTop: space.md, color: colors.muted }]}>You need an internet connection to delete your account.</Text>
    </Screen>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
      <Text style={text.body}>•</Text>
      <Text style={[text.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}
