import { useState } from 'react';
import { Text, View } from 'react-native';
import { todayIso } from '@/data/erp';
import { parseSecondaryCsv, SECONDARY_COLUMNS, sellInOut } from '@/data/growth';
import { newId } from '@/data/ids';
import { can, distributorUser } from '@/data/roles';
import { Banner, Button, Card, Chip, Empty, Field, Row, SectionTitle, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { pickTextFile, saveTextFile } from '@/ui/files';
import { useAttempt } from '@/ui/opsCards';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const prevMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return todayIso(d).slice(0, 7);
};

/** 2.15 secondary sales: distributors upload what they sold on each month; compare with what we sold them. */
export default function SecondarySales() {
  const { me, data, erp, products, accounts } = useErp();
  const attempt = useAttempt();
  const own = distributorUser(me) ? me.distributorId : undefined;
  const list = (data.distributors ?? []).filter((d) => d.active && (!own || d.id === own));
  const [dist, setDist] = useState(own ?? list[0]?.id ?? '');
  const [month, setMonth] = useState(prevMonth());
  const [preview, setPreview] = useState<ReturnType<typeof parseSecondaryCsv> | null>(null);
  if (!erp) return <ErpOff />;
  if (!list.length) return <Screen><Empty icon="git-network-outline" title="No distributors yet">Add distributors under Finance desk › Distributors first.</Empty></Screen>;
  const canUpload = !!own || can(me, 'finance') || can(me, 'marketing') || me.role !== 'Rep';
  const okMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const rows = okMonth ? sellInOut(data, dist, month) : [];
  const uploads = [...new Map((data.secondarySales ?? []).filter((x) => x.distributorId === dist).map((x) => [x.uploadId, x])).values()].sort((a, b) => b.month.localeCompare(a.month));

  const pick = async () => {
    const f = await pickTextFile().catch((e) => notify('Not read', e instanceof Error ? e.message : String(e)));
    if (f) setPreview(parseSecondaryCsv(f.text, products, accounts));
  };
  const upload = () => {
    if (!preview) return;
    const send = () => attempt({ type: 'secondary.upload', uploadId: newId('sec'), distributorId: dist, month, rows: preview.rows }, () => setPreview(null));
    if (uploads.some((u) => u.month === month)) confirm(`Replace ${month}?`, 'The rows already uploaded for this month are replaced by this file.', send, 'Replace');
    else send();
  };

  return (
    <Screen wide>
      {!own && (
        <Row style={{ flexWrap: 'wrap' }}>
          {list.map((d) => (
            <Chip key={d.id} label={d.name} selected={d.id === dist} onPress={() => setDist(d.id)} />
          ))}
        </Row>
      )}
      <Field label="Month (YYYY-MM)" value={month} onChangeText={setMonth} />

      {canUpload && (
        <Card>
          <Text style={text.title}>Upload the month’s sales</Text>
          <Text style={[text.muted, { marginBottom: space.sm }]}>A CSV with the columns {SECONDARY_COLUMNS.join(', ')} (product and qty needed). Product names must match the product list.</Text>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            <Button small variant="ghost" title="Template" icon="document-outline" onPress={() => saveTextFile('secondary-sales-template.csv', `${SECONDARY_COLUMNS.join(',')}\n${products[0]?.name ?? 'Product'},120,240000,40,Ikeja,\n`)} />
            <Button small title="Choose file" icon="cloud-upload-outline" onPress={pick} />
          </Row>
          {preview && (
            <View style={{ marginTop: space.sm }}>
              {preview.errors.slice(0, 5).map((e) => (
                <Text key={e} style={[text.small, { color: colors.danger }]}>
                  {e}
                </Text>
              ))}
              <Text style={text.muted}>
                {preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} ready · {preview.rows.reduce((n, r) => n + r.qty, 0)} units
              </Text>
              <Button title={`Upload for ${month}`} disabled={!preview.rows.length || !okMonth} onPress={upload} />
            </View>
          )}
        </Card>
      )}

      <SectionTitle>Sell-in and sell-out · {month}</SectionTitle>
      {rows.length ? (
        <Card style={{ padding: 0 }}>
          <Row style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <Text style={[text.small, { flex: 2 }]}>Product</Text>
            <Text style={[text.small, { flex: 1, textAlign: 'right' }]}>Sold to them</Text>
            <Text style={[text.small, { flex: 1, textAlign: 'right' }]}>They sold on</Text>
            <Text style={[text.small, { flex: 1, textAlign: 'right' }]}>Their stock</Text>
          </Row>
          {rows.map((r) => (
            <Row key={r.product} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <Text style={[text.title, { flex: 2 }]}>{r.product}</Text>
              <Text style={[text.body, { flex: 1, textAlign: 'right' }]}>{r.sellIn}</Text>
              <Text style={[text.body, { flex: 1, textAlign: 'right', color: r.sellOut < r.sellIn * 0.5 ? colors.danger : colors.text }]}>{r.sellOut}</Text>
              <Text style={[text.body, { flex: 1, textAlign: 'right' }]}>{r.stock ?? '–'}</Text>
            </Row>
          ))}
        </Card>
      ) : (
        <Empty icon="bar-chart-outline">Nothing sold to or reported by this distributor for {month} yet.</Empty>
      )}

      {uploads.length > 0 && (
        <>
          <SectionTitle>Uploads</SectionTitle>
          <Card style={{ padding: 0 }}>
            {uploads.map((u) => (
              <Row key={u.uploadId} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <Text style={[text.title, { flex: 1 }]}>{u.month}</Text>
                <Text style={text.small}>{new Date(u.at).toLocaleDateString()}</Text>
                {(own || can(me, 'finance')) && <Button small variant="ghost" title="Delete" onPress={() => confirm(`Delete the ${u.month} upload?`, 'Its rows are removed.', () => attempt({ type: 'secondary.delete', uploadId: u.uploadId }), 'Delete')} />}
              </Row>
            ))}
          </Card>
        </>
      )}
      <Banner tone="info">Sell-out well below sell-in means stock is building up at the distributor.</Banner>
    </Screen>
  );
}
