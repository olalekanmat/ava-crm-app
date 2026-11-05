import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { newId } from '@/data/ids';
import { can, holdersOf } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import { SAFETY_KINDS, type SafetyKind } from '@/data/types';
import { Banner, Button, Card, Chip, Field, Label, SectionTitle, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { notifyPerson } from '@/ui/notify';
import { SafetyCard, useAttempt } from '@/ui/opsCards';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

const SEXES = ['Female', 'Male', 'Unknown'] as const;

/**
 * 2.15 pharmacovigilance: report an adverse event, a product complaint or a medical question (from a
 * call or the More tab). Medical/Compliance gets an email at once and works the reports here.
 */
export default function SafetyScreen() {
  const params = useLocalSearchParams<{ accountId?: string; callId?: string; product?: string }>();
  const me = useMe();
  const { data, products, getAccount } = useStore();
  const attempt = useAttempt();
  const [kind, setKind] = useState<SafetyKind>('Adverse event');
  const [product, setProduct] = useState(params.product ?? '');
  const [description, setDescription] = useState('');
  const [serious, setSerious] = useState(false);
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<(typeof SEXES)[number]>('Unknown');
  const [onset, setOnset] = useState('');
  const [batch, setBatch] = useState('');
  const medical = can(me, 'medical');
  const reports = (data.safetyReports ?? []).filter((r) => medical || r.byId === me.id).sort((a, b) => (a.status === 'Closed' ? 1 : 0) - (b.status === 'Closed' ? 1 : 0) || b.at.localeCompare(a.at));
  const account = params.accountId ? getAccount(params.accountId) : undefined;

  const send = () =>
    attempt(
      { type: 'safety.report', report: { id: newId('pv'), kind, product, accountId: params.accountId, callId: params.callId, description: description.trim(), serious: kind === 'Adverse event' ? serious : undefined, patientAge: age.trim() || undefined, patientSex: kind === 'Adverse event' ? sex : undefined, onset: onset.trim() || undefined, batch: batch.trim() || undefined, byId: me.id, at: '', status: 'New' } },
      () => {
        const to = holdersOf(data.users, 'medical');
        for (const u of to) notifyPerson(u, `${serious ? 'SERIOUS ' : ''}${kind}: ${product}`, `${me.name} reported a ${kind.toLowerCase()} about ${product}${account ? ` at ${account.name}` : ''}${batch.trim() ? ` (batch ${batch.trim()})` : ''}:\n\n${description.trim()}${age.trim() ? `\n\nPatient age: ${age.trim()}` : ''}${onset.trim() ? `\nOnset: ${onset.trim()}` : ''}`);
        notify('Reported', 'Medical/Compliance has been told. Thank you: reporting within 24 hours keeps patients safe.');
        if (params.callId) router.back();
        setDescription('');
      },
    );

  return (
    <Screen wide>
      <Card>
        <Text style={text.title}>New report{account ? ` · ${account.name}` : ''}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs }}>
          {SAFETY_KINDS.map((k) => (
            <Chip key={k} label={k} selected={k === kind} onPress={() => setKind(k)} />
          ))}
        </View>
        <Label>Product</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {products.filter((p) => p.active).map((p) => (
            <Chip key={p.name} label={p.name} selected={p.name === product} onPress={() => setProduct(p.name)} />
          ))}
        </View>
        <Field label={kind === 'Medical question' ? 'The question' : 'What happened'} value={description} onChangeText={setDescription} multiline placeholder={kind === 'Adverse event' ? 'Symptoms, when they started, what the patient was taking, outcome' : ''} />
        {kind === 'Adverse event' && (
          <>
            <ToggleRow label="Serious" value={serious} onChange={setSerious} hint="Death, life-threatening, hospital stay, disability, or birth defect" />
            <Field label="Patient age" value={age} onChangeText={setAge} keyboardType="numeric" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {SEXES.map((x) => (
                <Chip key={x} label={x} selected={x === sex} onPress={() => setSex(x)} />
              ))}
            </View>
            <Field label="Onset (YYYY-MM-DD)" value={onset} onChangeText={setOnset} />
          </>
        )}
        {kind !== 'Medical question' && <Field label="Batch number (if known)" value={batch} onChangeText={setBatch} />}
        <Banner tone="warn">Do not write the patient’s name. Initials, age and sex are enough.</Banner>
        <Button title="Send to Medical" icon="medkit-outline" disabled={!product || !description.trim()} onPress={send} />
      </Card>

      {reports.length > 0 && (
        <>
          <SectionTitle>{medical ? 'All reports' : 'Your reports'}</SectionTitle>
          {reports.map((r) => (
            <SafetyCard key={r.id} r={r} />
          ))}
        </>
      )}
    </Screen>
  );
}
