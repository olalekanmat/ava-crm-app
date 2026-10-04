import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { currentAccount, restoreAuth } from '@/cloud/auth';
import { createFolder, folderFromLink, PROVIDER_LABEL } from '@/cloud/connect';
import type { Provider } from '@/cloud/journal';
import { DEFAULT_LICENSE_SERVER } from '@/cloud/license';
import { setUpCompany } from '@/cloud/setup';
import { useStore } from '@/data/store';
import type { Company } from '@/data/types';
import { BrandTitle } from '@/ui/Brand';
import { Banner, Button, Field, Label, Segmented, text, ToggleRow } from '@/ui/components';
import { cleanCompany, CompanyForm } from '@/ui/CompanyForm';
import { notify } from '@/ui/confirm';
import { colors, radius, shadow, space } from '@/ui/theme';

/** First run for a company administrator: company details, storage folder, approval request. */
export default function SetupScreen() {
  const { enterCloud } = useStore();
  const [account, setAccount] = useState(currentAccount());
  const [checked, setChecked] = useState(!!account);
  useEffect(() => {
    if (!account) restoreAuth().then((a) => (setAccount(a), setChecked(true)));
  }, [account]);
  const [company, setCompany] = useState<Company>({ name: '' });
  const [msKind, setMsKind] = useState<'onedrive' | 'sharepoint'>('onedrive');
  const [newFolder, setNewFolder] = useState(false);
  const [link, setLink] = useState('');
  const [server, setServer] = useState(DEFAULT_LICENSE_SERVER);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  if (!account) return checked ? <Redirect href="/sign-in" /> : <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  const provider: Provider = account.provider === 'google' ? 'google' : msKind;
  const canCreate = provider !== 'sharepoint';

  const submit = async () => {
    setTried(true);
    setError(undefined);
    if (!company.name.trim()) return setError('Enter the company name.');
    if (!(newFolder && canCreate) && !link.trim()) return setError('Paste the link to the folder where Ava CRM should keep your data, or create a new folder.');
    if (!/^https:\/\//.test(server.trim())) return setError('The approval server address must start with https://');
    try {
      setBusy('Preparing the folder…');
      const folder = newFolder && canCreate ? await createFolder(provider, `Ava CRM - ${company.name.trim()}`) : await folderFromLink(provider, link);
      setBusy('Creating your company and requesting approval…');
      const r = await setUpCompany({ account, provider, folder: { ...folder, provider }, company: cleanCompany(company), server });
      await enterCloud(r.session, r.cache);
      router.replace('/');
      if (r.registerError) notify('Approval request not sent', `Your company is set up, but the approval server could not be reached: ${r.registerError} You can send the request again under Company & approval.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: space.lg }}>
          <BrandTitle size={30} />
          <Text style={[text.h2, { marginTop: space.md }]}>Set up your company</Text>
          <Text style={[text.muted, { textAlign: 'center' }]}>Signed in as {account.email}. You will be the company’s first administrator.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>1 · Company</Text>
          <CompanyForm value={company} onChange={setCompany} tried={tried} />
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>2 · Where your data is kept</Text>
          <Text style={[text.muted, { marginBottom: space.md }]}>
            Everything your team records (accounts, calls, plans, users) is stored in this folder in your company’s {account.provider === 'google' ? 'Google Drive' : 'Microsoft 365'}, not on Ava’s servers. Each phone uploads its changes when it syncs.
          </Text>
          {account.provider === 'microsoft' && (
            <>
              <Label>Storage</Label>
              <Segmented options={['onedrive', 'sharepoint']} value={msKind} onChange={setMsKind} labels={{ onedrive: 'OneDrive', sharepoint: 'SharePoint' }} />
            </>
          )}
          {canCreate && <ToggleRow label={`Create a new folder in my ${PROVIDER_LABEL[provider]}`} value={newFolder} onChange={setNewFolder} hint={`Named “Ava CRM - ${company.name.trim() || 'your company'}”.`} />}
          {!(newFolder && canCreate) && (
            <Field
              label="Folder link *"
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              keyboardType="url"
              placeholder={provider === 'google' ? 'https://drive.google.com/drive/folders/…' : provider === 'sharepoint' ? 'https://yourcompany.sharepoint.com/…' : 'https://onedrive.live.com/… or https://…-my.sharepoint.com/…'}
              hint={provider === 'sharepoint' ? 'In SharePoint, open the document library folder, choose Share > Copy link, and paste it here.' : 'Use an empty folder. Open it and copy the link from the address bar or Share > Copy link.'}
            />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>3 · Approval</Text>
          <Text style={[text.muted, { marginBottom: space.md }]}>Ava Healthcare approves each company before its team can start. Your company name, your name and email, and the folder link are sent to the approval server; your data is not.</Text>
          <Field label="Approval server address" value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" hint="Leave as it is unless Ava Healthcare gave you another address." />
        </View>

        {!!error && <Banner tone="danger">{error}</Banner>}
        {busy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', padding: space.md }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={text.muted}>{busy}</Text>
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Button title="Create company and request approval" icon="checkmark-circle-outline" onPress={submit} />
            <Button title="Back" variant="ghost" onPress={() => router.back()} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingTop: 48, paddingBottom: 48, width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg + 4, padding: space.lg, marginBottom: space.md, ...shadow },
  step: { fontSize: 13, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
});
