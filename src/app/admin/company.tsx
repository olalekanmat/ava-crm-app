import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ActivityIndicator, Platform, Share, Text, View } from 'react-native';
import { adapterFor, PROVIDER_LABEL } from '@/cloud/connect';
import { refreshLicense } from '@/cloud/license';
import { requestApproval } from '@/cloud/setup';
import { formatDate, formatDateTime } from '@/data/dates';
import { useMe, useStore } from '@/data/store';
import type { Company } from '@/data/types';
import { Badge, Banner, Button, Card, Empty, ListRow, Row, SectionTitle, text } from '@/ui/components';
import { cleanCompany, CompanyForm } from '@/ui/CompanyForm';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const STATE_LABEL = { active: 'Approved', pending: 'Waiting for approval', none: 'Not requested', expired: 'Expired', revoked: 'Revoked', invalid: 'Not valid', demo: 'Demo' } as const;

/** Admin: company profile, licence and approval, and the drive folder the team shares. */
export default function CompanyScreen() {
  const me = useMe();
  const { company, run, session, license, licenseFile, saveLicense, data, syncNow } = useStore();
  const [draft, setDraft] = useState<Company>(company);
  const [busy, setBusy] = useState<string>();
  if (me.role !== 'Admin') return <Screen><Empty>Only administrators can change the company.</Empty></Screen>;
  const cloud = session?.mode === 'cloud' ? session : undefined;

  const task = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const saveProfile = () => {
    try {
      run({ type: 'company.update', company: { ...cleanCompany(draft), logo: draft.logo } });
      notify('Saved', cloud ? 'Saved on this device. It reaches your team with the next sync.' : 'Company details saved.');
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  const checkNow = () =>
    task('Checking with the approval server…', async () => {
      if (!licenseFile) throw new Error('No approval request has been made for this company.');
      const next = await refreshLicense(licenseFile);
      await saveLicense(next);
      notify('Approval status', STATE_LABEL[next.status === 'active' ? 'active' : next.status === 'unknown' ? 'none' : next.status]);
    });

  const resend = () =>
    task('Sending the approval request…', async () => {
      if (!licenseFile || !cloud) throw new Error('This company has no licence file.');
      const r = await requestApproval(licenseFile, company, me, cloud.folder);
      await saveLicense({ ...licenseFile, status: r.status, updatedAt: new Date().toISOString() });
      notify('Request sent', 'Ava Healthcare will review it. This page shows the result after the next check.');
    });

  const members = data.users.filter((u) => u.active && u.id !== me.id);
  const shareAll = () =>
    confirm(
      'Share the folder with your team?',
      `${members.length} people get edit access to the company folder and an email from ${cloud ? PROVIDER_LABEL[cloud.folder.provider] : 'the drive'}. People who already have access are not affected.`,
      () =>
        task('Sharing the folder…', async () => {
          const drive = adapterFor(cloud!.folder);
          const failed: string[] = [];
          for (const u of members) await drive.share(u.email).catch(() => failed.push(u.email));
          notify('Folder shared', failed.length ? `Shared with ${members.length - failed.length}. Could not share with: ${failed.join(', ')} (check the email, or whether your organisation allows sharing outside it).` : `Shared with ${members.length} people.`);
        }),
      'Share',
    );

  const invite = () => {
    const msg = `You have been added to ${company.name} on Ava CRM.\n\n1. Install Ava CRM: https://avahealthcareltd.com/AvaCRM\n2. Sign in with your work ${cloud?.folder.provider === 'google' ? 'Google' : 'Microsoft'} account.\n3. Choose ${company.name}, or paste this folder link: ${cloud?.folder.webUrl ?? ''}`;
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(msg).then(() => notify('Copied', 'The invitation is on your clipboard. Paste it into an email or chat.'), () => notify('Invitation', msg));
    } else Share.share({ message: msg });
  };

  const lic = license.state;
  const tone = lic === 'active' ? colors.success : lic === 'pending' || lic === 'none' ? colors.warn : lic === 'demo' ? colors.muted : colors.danger;

  return (
    <Screen>
      {!!busy && (
        <Banner icon="hourglass-outline">
          {busy}
        </Banner>
      )}
      <SectionTitle>Approval</SectionTitle>
      <Card>
        <Row>
          <Text style={[text.title, { flex: 1 }]}>Ava CRM licence</Text>
          <Badge label={STATE_LABEL[lic]} fg={tone} bg={colors.bg} />
        </Row>
        {license.state === 'active' && <Text style={text.muted}>Subscription until {formatDate(license.payload.subscriptionEnd.slice(0, 10))} ({license.daysLeft} days)</Text>}
        {licenseFile && (
          <Text style={text.small}>
            Server {licenseFile.server} · requested {formatDate(licenseFile.requestedAt.slice(0, 10))} · last checked {formatDateTime(licenseFile.updatedAt)}
          </Text>
        )}
        {lic === 'demo' && <Text style={text.muted}>The demo does not need approval.</Text>}
        {cloud && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            <Button small icon="refresh-outline" title="Check now" onPress={checkNow} disabled={!!busy} />
            {lic !== 'active' && <Button small variant="secondary" icon="send-outline" title="Send request again" onPress={resend} disabled={!!busy} />}
          </View>
        )}
      </Card>

      {cloud && (
        <>
          <SectionTitle>Company folder</SectionTitle>
          <Card style={{ padding: 0 }}>
            <ListRow icon="folder-outline" title={cloud.folder.name ?? 'Company folder'} subtitle={`${PROVIDER_LABEL[cloud.folder.provider]} · tap to open`} onPress={cloud.folder.webUrl ? () => Linking.openURL(cloud.folder.webUrl!) : undefined} />
            <ListRow icon="people-outline" tone={colors.orange} title="Share folder with team" subtitle={`Give the ${members.length} users edit access so they can sign in`} onPress={members.length ? shareAll : undefined} />
            <ListRow icon="mail-outline" tone={colors.success} title="Invitation message" subtitle="Install link, sign-in steps and the folder link" onPress={invite} />
            <ListRow icon="sync-outline" title="Sync now" subtitle="Upload changes and refresh the CSV copies in the folder" onPress={() => syncNow(true)} />
          </Card>
          <Text style={[text.small, { marginBottom: space.md }]}>
            The folder holds one file per person and device with their changes, plus CSV copies of calls, accounts, plans and users that open in Excel. Anyone with access to the folder can read these files, so share it only with your team.
          </Text>
        </>
      )}

      <SectionTitle>Company details</SectionTitle>
      <Card>
        <CompanyForm value={draft} onChange={setDraft} tried />
        {busy ? <ActivityIndicator color={colors.primary} /> : <Button title="Save company details" icon="checkmark" onPress={saveProfile} />}
      </Card>
    </Screen>
  );
}
