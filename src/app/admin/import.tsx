import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ACCOUNT_COLUMNS, importAccounts, importProducts, importUsers, PRODUCT_COLUMNS, TEMPLATES, USER_COLUMNS, type ImportResult } from '@/data/csv';
import { isAdmin } from '@/data/access';
import { applyMutation, type Mutation } from '@/data/mutations';
import { sanitizeMutation } from '@/data/sanitize';
import type { User } from '@/data/types';
import { useMe, useStore } from '@/data/store';
import { Banner, Button, Card, Empty, Field, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { pickTextFile, saveTextFile } from '@/ui/files';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type Kind = 'accounts' | 'users' | 'products';

const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const HELP: Record<Kind, string> = {
  accounts: `Columns: ${ACCOUNT_COLUMNS.join(', ')}. Required: type (HCP/HCO), name, specialty, tier (a name from the rep's team scheme, by default ST, T1, T2 or T3), city, and the rep as owner_email or as their territory_id. Rows with a matching id, or the same name and city, update the existing account.`,
  users: `Columns: ${USER_COLUMNS.join(', ')}. Role is Rep, FLM, SLM or Admin; put yes in admin to make a Rep, FLM or SLM an administrator too. user_id is your own staff ID (unique). A Rep reports to an FLM and an FLM to an SLM; list managers above their reports. Rows with an existing email update that user.`,
  products: `Columns: ${PRODUCT_COLUMNS.join(', ')}. Separate key messages with |. Rows with an existing product name update it.`,
};

/** How the action column deletes, per kind. */
const DELETE_HELP: Record<Kind, string> = {
  accounts: 'To delete accounts, put delete in the action column with the account id (from an export), or its name and city. Planned calls are removed; submitted calls stay in the history.',
  users: 'To delete people, put delete in the action column with their email. If they own accounts or manage people, add transfer_to_email: another person with the same role who takes them over.',
  products: 'To delete products, put delete in the action column with the product name. Past calls keep the product name.',
};

export default function ImportScreen() {
  const me = useMe();
  const { kind: initialKind } = useLocalSearchParams<{ kind?: Kind }>();
  // Deleted records stay in, so a row naming one gets its own error instead of failing the whole import.
  const { withDeleted: data, run, session } = useStore();
  const [kind, setKind] = useState<Kind>(initialKind && initialKind in HELP ? initialKind : 'accounts');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string>();
  const [result, setResult] = useState<string>();

  const preview = useMemo((): ImportResult<unknown> | null => {
    if (!csv.trim()) return null;
    return kind === 'accounts' ? importAccounts(csv, data) : kind === 'users' ? importUsers(csv, data, me.id) : importProducts(csv, data);
  }, [csv, kind, data, me.id]);

  if (!isAdmin(me)) return <Screen><Empty>Only administrators can import data.</Empty></Screen>;

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

  const total = (preview?.valid.length ?? 0) + (preview?.deletes.length ?? 0);
  const apply = () => {
    if (!preview || !total) return;
    try {
      // Adds and updates first (a new manager may take over from someone deleted), then deletes.
      const changes: Mutation[] = [];
      if (kind === 'accounts') {
        const r = importAccounts(csv, data);
        for (const accounts of chunks(r.valid, 20000)) changes.push({ type: 'import.accounts', accounts });
        for (const d of chunks(r.deletes, 20000)) changes.push({ type: 'account.delete', ids: d.map((x) => x.id) });
      } else if (kind === 'users') {
        const r = importUsers(csv, data, me.id);
        for (const users of chunks(r.valid, 5000)) changes.push({ type: 'import.users', users });
        // Switch people off before deleting them: older app versions do not know about deleting.
        const off = r.deletes.map((d) => data.users.find((u) => u.id === d.id)).filter((u): u is User => !!u && u.active).map((u) => ({ ...u, active: false }));
        for (const users of chunks(off, 5000)) changes.push({ type: 'import.users', users });
        for (const users of chunks(r.deletes, 5000)) changes.push({ type: 'user.delete', users });
      } else {
        const r = importProducts(csv, data);
        for (const products of chunks(r.valid, 1000)) changes.push({ type: 'import.products', products });
        for (const d of chunks(r.deletes, 20000)) changes.push({ type: 'product.delete', ids: d.map((x) => x.id) });
      }
      // Try every change first, so nothing is saved unless all of it works.
      changes.reduce((s, m) => applyMutation(s, sanitizeMutation(JSON.parse(JSON.stringify(m)), new Date()), me, new Date()), data);
      for (const m of changes) run(m);
      const done = [preview.valid.length && `imported ${preview.valid.length}`, preview.deletes.length && `deleted ${preview.deletes.length}`].filter(Boolean).join(' and ');
      setResult(
        `${done[0].toUpperCase()}${done.slice(1)} ${kind}.${preview.rows.length > total ? ` ${preview.rows.length - total} rows with errors were skipped.` : ''}${kind === 'users' && preview.valid.length ? ` New users sign in with company code ${session?.companyCode ?? ''}, their email and the starting password 12345678.` : ''}`,
      );
      setCsv('');
      setFileName(undefined);
    } catch (e) {
      notify('Import failed', e instanceof Error ? e.message : String(e));
    }
  };
  const commit = () => {
    if (!preview?.deletes.length) return apply();
    const names = preview.rows.filter((r) => r.remove && !r.errors.length).map((r) => r.remove!.label);
    confirm(
      `Delete ${names.length} ${kind}?`,
      `${names.slice(0, 8).join(', ')}${names.length > 8 ? ` and ${names.length - 8} more` : ''} will be deleted. This cannot be undone.`,
      apply,
      'Import and delete',
    );
  };

  const bad = preview?.rows.filter((r) => r.errors.length) ?? [];
  const updates = preview?.rows.filter((r) => r.item && !r.errors.length && r.update).length ?? 0;

  return (
    <Screen>
      <Segmented options={['accounts', 'users', 'products'] as Kind[]} value={kind} onChange={(k) => { setKind(k); setResult(undefined); }} labels={{ accounts: 'Accounts', users: 'Users', products: 'Products' }} />
      <Text style={[text.muted, { marginBottom: space.sm }]}>{HELP[kind]}</Text>
      <Text style={[text.muted, { marginBottom: space.md }]}>
        <Text style={{ fontWeight: '700', color: colors.danger }}>Deleting: </Text>
        {DELETE_HELP[kind]}
      </Text>
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
                <Stat label="Ready" value={total} color={colors.success} />
                <Stat label="New" value={preview.valid.length - updates} />
                <Stat label="Updates" value={updates} />
                <Stat label="Deletes" value={preview.deletes.length} color={preview.deletes.length ? colors.danger : undefined} />
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
            <Button
              title={preview.deletes.length ? `Import ${preview.valid.length}, delete ${preview.deletes.length}` : `Import ${preview.valid.length} ${kind}`}
              icon="cloud-upload-outline"
              disabled={!total}
              onPress={commit}
            />
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
