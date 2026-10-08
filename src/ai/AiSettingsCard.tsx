import { Text } from 'react-native';
import { useStore } from '@/data/store';
import { Card, SectionTitle, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { space } from '@/ui/theme';

/** Admin settings: turn the AI features on or off for the whole company. */
export function AiSettingsCard() {
  const { data, run, admin } = useStore();
  if (!admin) return null;
  const on = data.settings.aiEnabled !== false;
  const set = (v: boolean) => {
    try {
      run({ type: 'settings.update', settings: { aiEnabled: v } });
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <SectionTitle>AI assistant</SectionTitle>
      <Card>
        <ToggleRow
          label="AI features"
          value={on}
          onChange={set}
          hint="Tidy dictated call notes, plan visits by voice, suggest cycle plans, pre-call briefs and Ask Ava. Voice dictation into text fields works either way."
        />
        <Text style={[text.small, { marginTop: space.sm }]}>
          Text you send to AI is processed by Anthropic to produce the answer and is not stored by Ava CRM. Only data the person can already see in the app is sent, and only when they use an AI feature.
        </Text>
      </Card>
    </>
  );
}
