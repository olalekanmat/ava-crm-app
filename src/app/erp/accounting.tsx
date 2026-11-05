import { useState } from 'react';
import { Text } from 'react-native';
import { todayIso } from '@/data/erp';
import { accountingCsv } from '@/data/growth';
import { can } from '@/data/roles';
import { Banner, Button, Card, Empty, Field, Row, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { saveTextFile } from '@/ui/files';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 2.15: invoices, receipts and credit notes for a period as one CSV, for the accountant's package. */
export default function AccountingExport() {
  const { me, data, erp } = useErp();
  const today = todayIso();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  if (!erp) return <ErpOff />;
  if (!can(me, 'finance') && !me.functions?.includes('viewer')) return <Screen><Empty icon="lock-closed-outline">Finance and administrators export the books.</Empty></Screen>;
  const ok = DAY.test(from) && DAY.test(to) && from <= to;
  const csv = ok ? accountingCsv(data, from, to) : '';
  const lines = csv ? csv.trim().split('\n').length - 1 : 0;
  const save = () => saveTextFile(`ava-accounting-${from}-to-${to}.csv`, csv).catch((e) => notify('Not saved', e instanceof Error ? e.message : String(e)));
  return (
    <Screen>
      <Card>
        <Row gap={space.sm}>
          <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
          <Field label="To" value={to} onChangeText={setTo} />
        </Row>
        <Text style={[text.muted, { marginBottom: space.sm }]}>{ok ? `${lines} line${lines === 1 ? '' : 's'}: invoices, receipts and credit notes` : 'Enter two dates, the first before the second.'}</Text>
        <Button title="Download CSV" icon="download-outline" disabled={!ok || !lines} onPress={save} />
      </Card>
      <Banner tone="info">Columns: date, type, number, customer, net, VAT, total, method, reference and note. Import it into QuickBooks, Sage, Zoho Books or Excel. Credit notes are negative; cancelled invoices show 0.</Banner>
    </Screen>
  );
}
