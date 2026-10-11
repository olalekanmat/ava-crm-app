import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { providerLabel } from '@/cloud/drive';
import { DATA_MODEL, DATA_MODEL_FILES } from '@/data/csv';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Button, Card, Empty, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type Tool = 'excel' | 'powerbi';

function Steps({ items }: { items: string[] }) {
  return (
    <View style={{ gap: space.xs }}>
      {items.map((s, i) => (
        <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <Text style={[text.title, { width: 20, color: colors.primary }]}>{i + 1}.</Text>
          <Text style={[text.body, { flex: 1 }]}>{s}</Text>
        </Row>
      ))}
    </View>
  );
}

/** Admins: the read-only CSV tables in the company folder, and how to connect Excel or Power BI to them. */
export default function LiveDataScreen() {
  const { admin, session, sync, syncNow } = useStore();
  const provider = session?.folder.provider;
  const [tool, setTool] = useState<Tool>('excel');
  const google = provider === 'google';
  const folderUrl = session?.folder.webUrl;

  if (!admin) {
    return (
      <Screen>
        <Empty icon="lock-closed-outline">Only administrators can set up live data for Excel and Power BI.</Empty>
      </Screen>
    );
  }

  const open = () => {
    if (folderUrl) Linking.openURL(folderUrl).catch((e) => notify('Could not open the folder', e instanceof Error ? e.message : String(e)));
  };

  const drive = providerLabel(provider);
  const microsoftExcel = [
    `Open the company folder in ${drive} in your browser and copy the start of its address: for OneDrive, up to and including /personal/your_name/ (for example https://contoso-my.sharepoint.com/personal/ada_contoso_com/); for SharePoint, the site address (…/sites/site-name/).`,
    'In Excel (Microsoft 365, Windows): Data › Get Data › From File › From SharePoint Folder, paste that address and sign in with your work account.',
    'Choose Transform Data, filter the Name column to the "Ava CRM - …" files you want, and click Binary next to each file to open it as a table. Rename each query after its file (calls, accounts and so on).',
    'Close & Load. Data › Refresh All brings in the latest copies; in Query Properties you can also tick "Refresh data when opening the file" or "Refresh every 60 minutes".',
    'Prefer the OneDrive app on your computer? Use Data › Get Data › From File › From Text/CSV (or From Folder) on the synced folder instead.',
  ];
  const googleExcel = [
    'Install Google Drive for desktop and sign in with the account that owns the company folder; the folder then appears on your computer (for example G:\\My Drive\\…).',
    'In Excel: Data › Get Data › From File › From Text/CSV, and pick an "Ava CRM - …" file in that folder. Repeat for each table you need, or use From Folder and filter to the files you want.',
    'Data › Refresh All brings in the latest copies. Without Drive for desktop, download the files from the folder and open them in Excel, though they will not refresh by themselves.',
  ];
  const microsoftPbi = [
    `In Power BI Desktop: Get data › SharePoint folder, paste the start of the folder’s address (OneDrive: up to and including /personal/your_name/; SharePoint: the site address) and sign in with your work (organisational) account.`,
    'Choose Transform Data, filter Name to the "Ava CRM - …" files, and click Binary next to each one to make it a table. Rename each query after its file.',
    'In Model view, join the tables on their ids as listed in "Ava CRM - data model.csv" (for example calls.call_id to call products.call_id, accounts.id to calls.account_id, users.id to calls.rep_id).',
    'Publish to the Power BI service. In the semantic model’s Settings, enter the data source credentials (OAuth2, your work account) and turn on Scheduled refresh, for example every few hours during the working day. No gateway is needed for OneDrive for Business or SharePoint.',
    'Alternative: Get data › Folder on the OneDrive folder synced to your computer. Scheduled refresh in the service then needs an on-premises data gateway on that computer.',
  ];
  const googlePbi = [
    'Install Google Drive for desktop so the company folder appears on your computer.',
    'In Power BI Desktop: Get data › Folder (or Text/CSV for a single file), choose that folder, then Transform Data, filter Name to the "Ava CRM - …" files and click Binary next to each to make it a table.',
    'In Model view, join the tables on their ids as listed in "Ava CRM - data model.csv".',
    'Publish to the Power BI service. Because the files are on your computer, scheduled refresh needs an on-premises data gateway (personal mode is fine) installed on a computer that stays on with Drive for desktop running. Then turn on Scheduled refresh in the semantic model’s Settings.',
  ];
  const steps = tool === 'excel' ? (google ? googleExcel : microsoftExcel) : google ? googlePbi : microsoftPbi;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Live data for Excel & Power BI' }} />
      <Text style={[text.body, { marginBottom: space.md }]}>
        Ava CRM keeps a read-only copy of your company’s data as CSV tables in the company folder in {drive}. Excel and Power BI can connect to these files and refresh from them, so your reports stay up to date
        without exporting by hand.
      </Text>
      <Banner tone="info" icon="time-outline">
        The files refresh automatically about once an hour while an administrator has Ava CRM open, and straight away when an administrator presses Sync or Refresh now. Changes made in the files are overwritten, so
        keep your own work in a separate workbook or report.
      </Banner>

      <SectionTitle>Company folder</SectionTitle>
      <Card>
        <Row gap={space.md}>
          <Ionicons name="folder-open-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={text.title}>{session?.folder.name || `Ava CRM folder in ${drive}`}</Text>
            {folderUrl ? (
              <Text style={text.small} selectable numberOfLines={2}>
                {folderUrl}
              </Text>
            ) : (
              <Text style={text.small}>The folder link is not available on this device. Open the folder from {drive} instead.</Text>
            )}
          </View>
        </Row>
        <Text style={[text.small, { marginTop: space.sm }]}>
          {sync.syncing ? 'Syncing now…' : sync.lastSync ? `Last synced ${formatDateTime(sync.lastSync)}. ` : ''}
          {!sync.syncing && 'The refresh time of the tables is in the first row of "Ava CRM - data model.csv".'}
        </Text>
        {!!sync.error && <Banner tone="warn">{sync.error}</Banner>}
        <Row style={{ marginTop: space.md }}>
          {!!folderUrl && <Button variant="secondary" icon="open-outline" title="Open folder" onPress={open} />}
          <Button icon="refresh-outline" title={sync.syncing ? 'Refreshing…' : 'Refresh now'} disabled={sync.syncing} onPress={() => void syncNow(true)} />
        </Row>
      </Card>

      <SectionTitle>Files</SectionTitle>
      <Card style={{ padding: 0 }}>
        {[
          { name: DATA_MODEL_FILES.model, about: 'What each file and column means, how the tables join, and when they were last refreshed' },
          ...DATA_MODEL.map((m) => ({ name: DATA_MODEL_FILES[m.file], about: m.about })),
        ].map((f, i) => (
          <View key={f.name} style={{ paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
            <Text style={text.title}>{f.name}</Text>
            <Text style={text.muted}>{f.about}</Text>
          </View>
        ))}
      </Card>
      <Text style={[text.small, { marginTop: -space.xs }]}>
        Every file has a header row, dates in ISO format (YYYY-MM-DD, times in UTC) and ids for joining: call_id, account_id (accounts.id), rep_id (users.id) and event_id. Deleted people and accounts are left out of the
        users and accounts files; their past calls stay in the history.
      </Text>

      <SectionTitle>Connect</SectionTitle>
      <Segmented<Tool> options={['excel', 'powerbi']} value={tool} onChange={setTool} labels={{ excel: 'Excel', powerbi: 'Power BI' }} />
      <Card>
        <Text style={[text.small, { marginBottom: space.sm }]}>For a company folder in {google ? 'Google Drive' : 'OneDrive for Business'}:</Text>
        <Steps items={steps} />
      </Card>
      <Text style={text.small}>Anyone you give access to the folder can read these files, so share it only with people allowed to see all company data.</Text>
    </Screen>
  );
}
