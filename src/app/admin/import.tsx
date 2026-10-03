import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ACCOUNT_COLUMNS, importAccounts, importProducts, importUsers, PRODUCT_COLUMNS, TEMPLATES, USER_COLUMNS, type ImportResult } from '@/data/csv';
import { useMe, useStore } from '@/data/store';
import { Banner, Button, Card, Empty, Field, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { pickTextFile, saveTextFile } from '@/ui/files';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type Kind = 'accounts' | 'users' | 'products';

const HELP: Record<Kind, string> = {
  accounts: `Columns: ${ACCOUNT_COLUMNS.join(', ')}. Required: type (HCP/HCO), name, specialty, tier (A/B/C), city, owner_email (the rep). Rows with a matching id, or the same name and city, update the existing account.`,
  users: `Columns: ${USER_COLUMNS.join(', ')}. Role is Rep, FLM, SLM or Admin. A Rep reports to an FLM and an FLM to an SLM; list managers above their reports. Rows with an existing email update that user.`,
  products: `Columns: ${PRODUCT_COLUMNS.join(', ')}. Separate key messages with |. Rows with an existing product name update it.`,
};

export default function ImportScreen() {
  const me = useMe();
  const { data, run, session } = useStore();
  const [kind, setKind] = useState<Kind>('accounts');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string>();
  const [result, setResult] = useState<string>();

  const preview = useMemo((): ImportResult<unknown> | null => {
    if (!csv.trim()) return null;
    return kind === 'accounts' ? importAccounts(csv, data) : kind === 'users' ? importUsers(csv, data) : importProducts(csv, data);
  }, [csv, kind, data]);

  if (me.role !== 'Admin') return <Screen><Empty>Only administrators can import data.</Empty></Screen>;

  const pick = async () => {
    try {
      const f = await pickTextFile();
      if (!f) return;
      setFileName(f.name);
      setCsv(f.text);
      setResult(undefined);
    } catch (e) {
      notify('Could not read the file', e instanceof Error ? e.message : String(e));
    }
  };

  const commit = () => {
    if (!preview?.valid.length) return;
    try {
      if (kind === 'accounts') run({ type: 'import.accounts', accounts: importAccounts(csv, data).valid });
      else if (kind === 'users') run({ type: 'import.users', users: importUsers(csv, data).valid });
      else run({ type: 'import.products', products: importProducts(csv, data).valid });
      setResult(`Imported ${preview.valid.length} ${kind}.${preview.rows.length > preview.valid.length ? ` ${preview.rows.length - preview.valid.length} rows with errors were skipped.` : ''}${kind === 'users' && session?.mode === 'server' ? ' Set a password for new users under Users & roles so they can sign in.' : ''}`);
      setCsv('');
      setFileName(undefined);
    } catch (e) {
      notify('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const bad = preview?.rows.filter((r) => r.errors.length) ?? [];
  const updates = preview?.rows.filter((r) => r.item && !r.errors.length && r.update).length ?? 0;

  return (
    <Screen>
      <Segmented options={['accounts', 'users', 'products'] as Kind[]} value={kind} onChange={(k) => { setKind(k); setResult(undefined); }} labels={{ accounts: 'Accounts', users: 'Users', products: 'Products' }} />
      <Text style={[text.muted, { marginBottom: space.md }]}>{HELP[kind]}</Text>
      <Row style={{ marginBottom: space.md }}>
        <Button title="Choose CSV file" icon="document-attach-outline" onPress={pick} />
        <Button title="Template" icon="download-outline" variant="secondary" onPress={() => saveTextFile(`ava-${kind}-template.csv`, TEMPLATES[kind]).catch((e) => notify('Download failed', String(e)))} />
      </Row>
      {!!result && <Banner tone="success">{result}</Banner>}

      <Field
        label={fileName ? `Contents of ${fileName}` : 'Or paste CSV here'}
        value={csv}
        onChangeText={(t) => { setCsv(t); setFileName(undefined); setResult(undefined); }}
        multiline
        placeholder={TEMPLATES[kind].split('\r\n').slice(0, 2).join('\n')}
        style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 12 }}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {preview && (
        <>
          <SectionTitle>Preview</SectionTitle>
          {preview.missingColumns.length > 0 ? (
            <Banner tone="danger">Missing columns: {preview.missingColumns.join(', ')}. Download the template to see the expected header row.</Banner>
          ) : (
            <Card>
              <Row style={{ justifyContent: 'space-around' }}>
                <Stat label="Ready" value={preview.valid.length} color={colors.success} />
                <Stat label="New" value={preview.valid.length - updates} />
                <Stat label="Updates" value={updates} />
                <Stat label="Errors" value={bad.length} color={bad.length ? colors.danger : undefined} />
              </Row>
            </Card>
          )}
          {bad.slice(0, 25).map((r) => (
            <Text key={r.line} style={[text.muted, { color: colors.danger, marginBottom: 2 }]}>
              Line {r.line}: {r.errors.join('; ')}
            </Text>
          ))}
          {bad.length > 25 && <Text style={text.small}>…and {bad.length - 25} more rows with errors.</Text>}
          <View style={{ marginTop: space.md }}>
            <Button title={`Import ${preview.valid.length} ${kind}`} icon="cloud-upload-outline" disabled={!preview.valid.length} onPress={commit} />
          </View>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[text.h2, color ? { color } : null]}>{value}</Text>
      <Text style={text.small}>{label}</Text>
    </View>
  );
}
