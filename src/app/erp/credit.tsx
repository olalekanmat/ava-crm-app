import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { creditDaysOf, creditLimitOf, creditTermsLabel, owedBy } from '@/data/erp';
import { parseCsv } from '@/data/csv';
import { newId } from '@/data/ids';
import { holdersOf } from '@/data/roles';
import { Banner, Button, Card, Chip, Empty, Field, Row, SearchBox, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { CreditCard } from '@/ui/financeCards';
import { pickTextFile } from '@/ui/files';
import { Grid } from '@/ui/layout';
import { notifyPerson } from '@/ui/notify';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/**
 * 2.13: credit limits and days. Finance picks one or many customers (or uploads a CSV) and asks for a
 * change; it applies only when a credit approver (the country manager or named person) approves it.
 */
export default function CreditScreen() {
  const { request } = useLocalSearchParams<{ request?: string }>();
  const { me, data, erp, run, money, settings, finance, getUser } = useErp();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState('');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [onlyRequest, setOnlyRequest] = useState(request);
  const focus = onlyRequest ? (data.creditRequests ?? []).find((r) => r.id === onlyRequest) : undefined;
  const customers = useMemo(() => data.accounts.filter((a) => a.type === 'HCO' || a.creditLimit !== undefined || a.creditDays !== undefined).sort((a, b) => a.name.localeCompare(b.name)), [data.accounts]);
  const needle = q.trim().toLowerCase();
  const shown = customers.filter((a) => (focus ? focus.accountIds.includes(a.id) : !needle || `${a.name} ${a.city} ${a.segment ?? ''} ${getUser(a.ownerId)?.name ?? ''} ${getUser(a.ownerId)?.territory ?? ''}`.toLowerCase().includes(needle)));
  const requests = [...(data.creditRequests ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  if (!erp) return <ErpOff />;

  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const approvers = () => holdersOf(data.users, 'creditApprover').filter((u) => u.id !== me.id);

  const ask = () => {
    const l = limit.trim() === '' ? undefined : Number(limit);
    const d = days.trim() === '' ? undefined : Number(days);
    try {
      run({ type: 'credit.request', request: { id: newId('crq'), accountIds: [...picked], limit: l, days: d, reason: reason.trim(), byId: me.id, at: '', status: 'Pending' } });
      for (const a of approvers()) notifyPerson(a, 'Credit change to approve', `${me.name} asks to set ${[l !== undefined ? `a credit limit of ${money(l)}` : '', d !== undefined ? creditTermsLabel(d).toLowerCase() : ''].filter(Boolean).join(' and ')} for ${picked.size} customer${picked.size === 1 ? '' : 's'}: ${reason.trim()}`);
      setPicked(new Set());
      setLimit('');
      setDays('');
      setReason('');
      notify('Sent for approval', 'Nothing changes until a credit approver approves it.');
    } catch (e) {
      notify('Not sent', e instanceof Error ? e.message : String(e));
    }
  };

  /** CSV: customer (name or id), credit_limit, credit_days, reason. One request per distinct change. */
  const upload = async () => {
    try {
      const f = await pickTextFile();
      if (!f) return;
      const [head, ...rows] = parseCsv(f.text);
      const col = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n);
      const ci = Math.max(col('id'), col('account_id'), col('customer'), col('name'));
      const li = col('credit_limit');
      const di = col('credit_days');
      const ri = col('reason');
      if (ci < 0 || (li < 0 && di < 0)) throw new Error('The CSV needs a customer (name or id) column and credit_limit and/or credit_days.');
      const groups = new Map<string, { ids: string[]; limit?: number; days?: number; reason: string }>();
      const missing: string[] = [];
      for (const r of rows) {
        const key = (r[ci] ?? '').trim();
        if (!key) continue;
        const a = data.accounts.find((x) => x.id === key) ?? data.accounts.find((x) => x.name.toLowerCase() === key.toLowerCase());
        if (!a) {
          missing.push(key);
          continue;
        }
        const l = li >= 0 && r[li]?.trim() ? Number(r[li].replace(/[, ]/g, '')) : undefined;
        const d = di >= 0 && r[di]?.trim() ? Number(r[di]) : undefined;
        const why = (ri >= 0 ? r[ri]?.trim() : '') || reason.trim() || `Bulk upload ${f.name}`;
        const g = `${l}|${d}|${why}`;
        const cur = groups.get(g) ?? { ids: [], limit: l, days: d, reason: why };
        cur.ids.push(a.id);
        groups.set(g, cur);
      }
      for (const g of groups.values()) run({ type: 'credit.request', request: { id: newId('crq'), accountIds: g.ids, limit: g.limit, days: g.days, reason: g.reason, byId: me.id, at: '', status: 'Pending' } });
      const n = [...groups.values()].reduce((t, g) => t + g.ids.length, 0);
      for (const a of approvers()) notifyPerson(a, 'Credit changes to approve', `${me.name} uploaded credit changes for ${n} customers.`);
      notify('Sent for approval', `${n} customer${n === 1 ? '' : 's'} in ${groups.size} request${groups.size === 1 ? '' : 's'}.${missing.length ? ` Not found: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}.` : ''}`);
    } catch (e) {
      notify('Upload failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen wide>
      <Banner tone="info" icon="information-circle-outline">
        Every customer starts at {money(settings.defaultCreditLimit ?? 0)} and {creditTermsLabel(settings.defaultCreditDays ?? 0).toLowerCase()}. Changes need a credit approver{holdersOf(data.users, 'creditApprover').length ? ` (${holdersOf(data.users, 'creditApprover').map((u) => u.name).join(', ')})` : ''}.
      </Banner>

      {requests.some((r) => r.status === 'Pending') && (
        <>
          <SectionTitle>Waiting for approval</SectionTitle>
          <Grid>
            {requests.filter((r) => r.status === 'Pending').map((r) => (
              <CreditCard key={r.id} r={r} />
            ))}
          </Grid>
        </>
      )}

      <SectionTitle right={finance ? <Button small variant="ghost" icon="cloud-upload-outline" title="Upload CSV" onPress={upload} /> : undefined}>{focus ? 'Customers in this request' : 'Customers'}</SectionTitle>
      {focus ? <Button small variant="ghost" title="Show all customers" onPress={() => setOnlyRequest(undefined)} /> : <SearchBox placeholder="Customer, city, rep or territory" value={q} onChangeText={setQ} />}
      {finance && !focus && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm }}>
          <Chip label={`Select all shown (${shown.length})`} onPress={() => setPicked(new Set(shown.map((a) => a.id)))} />
          {picked.size > 0 && <Chip label={`Clear ${picked.size}`} onPress={() => setPicked(new Set())} />}
        </View>
      )}
      {shown.length ? (
        <Card style={{ padding: 0 }}>
          {shown.slice(0, 200).map((a) => {
            const on = picked.has(a.id);
            const l = creditLimitOf(a, settings);
            return (
              <Pressable key={a.id} disabled={!finance || !!focus} onPress={() => toggle(a.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.hairline, backgroundColor: on ? colors.primarySoft : undefined }}>
                {finance && !focus && <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary : colors.faint} />}
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>{a.name}</Text>
                  <Text style={text.muted}>
                    {a.city} · {getUser(a.ownerId)?.name ?? ''}
                    {a.creditLimit === undefined && a.creditDays === undefined ? ' · company default' : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={text.body}>{l !== undefined ? money(l) : 'No limit'}</Text>
                  <Text style={text.small}>
                    {creditTermsLabel(creditDaysOf(a, settings))} · owes {money(owedBy(data, a.id))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <Empty icon="business-outline" title="No customers">Business accounts (HCOs) show here.</Empty>
      )}

      {finance && picked.size > 0 && (
        <>
          <SectionTitle>Change {picked.size} customer{picked.size === 1 ? '' : 's'}</SectionTitle>
          <Card>
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                <Field label="New credit limit" value={limit} onChangeText={(v) => setLimit(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Leave empty to keep" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="New credit days" value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0 = cash and carry" />
              </View>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[0, 7, 14, 30, 45, 60].map((d) => (
                <Chip key={d} label={d ? `${d} days` : 'Cash and carry'} selected={days === String(d)} onPress={() => setDays(String(d))} />
              ))}
            </View>
            <Field label="Why?" value={reason} onChangeText={setReason} placeholder="The approver sees this, e.g. Paid on time for 6 months" multiline />
            <Button title="Send for approval" icon="paper-plane-outline" onPress={ask} disabled={!reason.trim() || (limit.trim() === '' && days.trim() === '')} />
          </Card>
        </>
      )}

      {requests.some((r) => r.status !== 'Pending') && (
        <>
          <SectionTitle>History</SectionTitle>
          <Grid>
            {requests.filter((r) => r.status !== 'Pending').slice(0, 30).map((r) => (
              <CreditCard key={r.id} r={r} />
            ))}
          </Grid>
        </>
      )}
    </Screen>
  );
}
