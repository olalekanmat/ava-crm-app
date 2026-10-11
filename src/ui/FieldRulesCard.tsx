import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Mutation } from '@/data/mutations';
import { objectiveChoices } from '@/data/objectives';
import { useStore } from '@/data/store';
import { DEFAULT_OBJECTIVES, type SignatureRule } from '@/data/types';
import { Button, Card, Field, Label, Segmented, SectionTitle, ToggleRow, text } from './components';
import { space } from './theme';

const SIGN_LABELS: Record<SignatureRule, string> = { optional: 'Offered', required: 'Required', off: 'Not used' };

/** Administrator rules for field work added in 2.7: objectives, account review, sample signatures. */
export function FieldRulesCard({ attempt }: { attempt: (m: Mutation) => void }) {
  const { data } = useStore();
  const s = data.settings;
  const [list, setList] = useState(objectiveChoices(s).join('\n'));
  const current = objectiveChoices(s).join('\n');

  return (
    <>
      <SectionTitle>Field rules</SectionTitle>
      <Card>
        <ToggleRow
          label="Confirm new accounts from reps"
          value={!!s.reviewNewAccounts}
          onChange={(v) => attempt({ type: 'settings.update', settings: { reviewNewAccounts: v } })}
          hint="Reps can still log calls to a new account; it shows as waiting until their manager or an administrator confirms it. Changes to existing details always go to the manager."
        />
        <Label>Doctor’s signature for samples</Label>
        <Segmented<SignatureRule> options={['optional', 'required', 'off']} labels={SIGN_LABELS} value={s.sampleSignature ?? 'optional'} onChange={(v) => attempt({ type: 'settings.update', settings: { sampleSignature: v } })} />
        <Text style={[text.small, { marginTop: 4, marginBottom: space.md }]}>
          {(s.sampleSignature ?? 'optional') === 'required' ? 'A call with samples cannot be submitted until the doctor signs on the rep’s screen.' : (s.sampleSignature ?? 'optional') === 'off' ? 'Reps are not asked for signatures.' : 'Reps can ask the doctor to sign on screen when they hand over samples.'}
        </Text>
        <View>
          <Field
            label="Ready-made call objectives"
            value={list}
            onChangeText={setList}
            multiline
            hint="One per line, up to 20. Reps pick from these or write their own."
          />
          {list !== current && (
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Button small title="Save objectives" onPress={() => attempt({ type: 'settings.update', settings: { objectives: list.split('\n').map((x) => x.trim()).filter(Boolean) } })} />
              <Button small variant="ghost" title="Use the defaults" onPress={() => setList(DEFAULT_OBJECTIVES.join('\n'))} />
            </View>
          )}
        </View>
      </Card>
    </>
  );
}
