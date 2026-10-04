import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { currentAccount, loadAuthConfig, providerConfigured, restoreAuth, signInWith, signOutAuth, type AuthProvider, type CloudAccount } from '@/cloud/auth';
import { findCompanies, folderFromLink, PROVIDER_LABEL } from '@/cloud/connect';
import type { FolderRef } from '@/cloud/drive';
import type { CompanyFile } from '@/cloud/journal';
import { joinCompany } from '@/cloud/setup';
import { buildSeed } from '@/data/seed';
import { useStore } from '@/data/store';
import { ROLE_LABEL, type User } from '@/data/types';
import { mark } from '@/ui/Brand';
import { Avatar, Banner, Button, Field, text } from '@/ui/components';
import { colors, radius, shadow, space } from '@/ui/theme';

const DEMO_USERS: User[] = (() => {
  const users = buildSeed().users;
  const pickRole = (r: User['role']) => users.find((u) => u.role === r)!;
  return [pickRole('Rep'), pickRole('FLM'), pickRole('SLM'), pickRole('Admin')];
})();

const ROLE_BLURB: Record<User['role'], string> = {
  Rep: 'Today’s calls, call logging with check-in, cycle plan',
  FLM: 'Team view, plan approvals, check-in compliance',
  SLM: 'Region overview across first-line teams',
  Admin: 'Users, CSV import, exports, cycles and rules',
};

export default function SignInScreen() {
  const { signInDemo, enterCloud } = useStore();
  const [account, setAccount] = useState<CloudAccount | null>(currentAccount());
  const [companies, setCompanies] = useState<{ folder: FolderRef; company: CompanyFile }[]>();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const attempt = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const look = (acc: CloudAccount) =>
    attempt('Looking for your company…', async () => {
      setCompanies(await findCompanies(acc.provider));
    });

  // On the web a page reload keeps the sign-in for this tab.
  const [, setConfigLoaded] = useState(false);
  useEffect(() => {
    loadAuthConfig().finally(() => setConfigLoaded(true));
    if (!account) restoreAuth().then((acc) => acc && setAccount(acc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (account && !companies) look(account);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const signIn = (p: AuthProvider) =>
    attempt('Waiting for sign-in…', async () => {
      const acc = await signInWith(p);
      if (acc) {
        setCompanies(undefined);
        setAccount(acc);
      }
    });

  const open = (folder: FolderRef) =>
    attempt('Opening your company…', async () => {
      const { session, cache } = await joinCompany(account!, folder);
      await enterCloud(session, cache);
    });

  const openLink = () =>
    attempt('Opening the folder…', async () => {
      const provider = account!.provider === 'google' ? 'google' : /sharepoint\.com/i.test(link) ? 'sharepoint' : 'onedrive';
      const folder = await folderFromLink(provider, link);
      const { session, cache } = await joinCompany(account!, folder);
      await enterCloud(session, cache);
    });

  const switchAccount = async () => {
    await signOutAuth();
    setAccount(null);
    setCompanies(undefined);
    setError(undefined);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[colors.primaryDark, colors.primary, colors.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logoWrap}>
              <Image source={mark} style={{ width: 46, height: 92 }} contentFit="contain" />
            </View>
            <Text style={styles.name}>Ava CRM</Text>
            <Text style={styles.tagline}>The field CRM your reps actually like using</Text>
          </View>

          <View style={styles.card}>
            {!!error && <Banner tone="danger">{error}</Banner>}
            {!account ? (
              <>
                <Text style={[text.h2, { marginBottom: 4 }]}>Sign in</Text>
                <Text style={[text.muted, { marginBottom: space.md }]}>Use your work Microsoft or Google account. Your company’s data stays in its own OneDrive, SharePoint or Google Drive.</Text>
                <View style={{ gap: space.sm }}>
                  <Button title="Sign in with Microsoft" icon="logo-windows" onPress={() => signIn('microsoft')} disabled={!!busy} />
                  <Button title="Sign in with Google" icon="logo-google" variant="secondary" onPress={() => signIn('google')} disabled={!!busy} />
                </View>
                {(!providerConfigured('microsoft') || !providerConfigured('google')) && (
                  <Text style={[text.small, { marginTop: space.sm }]}>
                    {!providerConfigured('microsoft') && !providerConfigured('google') ? 'Sign-in is not connected in this test build yet; use the demo below.' : `${providerConfigured('google') ? 'Microsoft' : 'Google'} sign-in is not connected in this build yet.`}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={text.h2}>Choose your company</Text>
                <Text style={[text.muted, { marginBottom: space.md }]}>
                  Signed in as {account.email} ({account.provider === 'google' ? 'Google' : 'Microsoft'}).{' '}
                  <Text style={text.link} onPress={switchAccount}>
                    Use another account
                  </Text>
                </Text>
                {companies?.map(({ folder, company }) => (
                  <Pressable key={folder.id} onPress={() => open(folder)} style={({ pressed }) => [styles.role, pressed && { opacity: 0.7 }]} disabled={!!busy}>
                    <Ionicons name="business" size={26} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={text.title}>{company.company.name}</Text>
                      <Text style={text.muted}>{PROVIDER_LABEL[company.provider]} · {folder.name}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                  </Pressable>
                ))}
                {companies?.length === 0 && <Text style={[text.muted, { marginBottom: space.sm }]}>No company folder is shared with this account yet.</Text>}
                <View style={{ marginTop: space.md }}>
                  <Field label="Or paste the company folder link" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder={account.provider === 'google' ? 'https://drive.google.com/drive/folders/…' : 'https://…sharepoint.com/… or OneDrive link'} hint="Your administrator can send you this link." />
                  <Button title="Open folder" variant="secondary" icon="folder-open-outline" onPress={openLink} disabled={!link.trim() || !!busy} />
                </View>
                <View style={[styles.divider]} />
                <Text style={text.title}>Setting up Ava CRM for your company?</Text>
                <Text style={[text.muted, { marginBottom: space.sm }]}>Company administrators enter the company details, logo and storage folder, then request approval.</Text>
                <Button title="Set up a new company" icon="add-circle-outline" onPress={() => router.push('/setup')} disabled={!!busy} />
              </>
            )}
            {!!busy && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={text.muted}>{busy}</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={text.h2}>Explore the demo</Text>
            <Text style={[text.muted, { marginBottom: space.md }]}>A fictional sales organisation, stored only on this device. Pick a role to see its view; you can switch any time under More.</Text>
            {DEMO_USERS.map((u) => (
              <Pressable key={u.id} onPress={() => signInDemo(u.id)} style={({ pressed }) => [styles.role, pressed && { opacity: 0.7 }]}>
                <Avatar name={u.name} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>
                    {ROLE_LABEL[u.role]} · {u.name}
                  </Text>
                  <Text style={text.muted}>{ROLE_BLURB[u.role]}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingTop: 56, paddingBottom: 48, width: '100%', maxWidth: 480, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: space.xl },
  logoWrap: { width: 112, height: 112, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  name: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: space.md },
  tagline: { color: 'rgba(255,255,255,0.88)', fontSize: 15, marginTop: 2, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg + 4, padding: space.lg, marginBottom: space.md, ...shadow },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.lg },
  role: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, borderTopWidth: 1, borderTopColor: colors.border },
});
