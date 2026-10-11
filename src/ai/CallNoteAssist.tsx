import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { todayKey } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Button, Row, ToggleRow } from '@/ui/components';
import { colors, space } from '@/ui/theme';
import { AiError, aiErrorMessage, runAi, useAiAvailable } from './client';
import { mergeCallNote, type CallNoteFields } from './logic';
import { MicButton } from './MicButton';
import { appendText } from './useDictation';

/**
 * Above the call notes: dictate (appends to the notes, works offline) and "Tidy with AI", which
 * fills notes, products, key messages, next step, follow-up and attendees from what was said.
 * Nothing is saved: the rep reviews the form and saves or submits it as usual.
 */
export function CallNoteAssist({
  accountName,
  fields,
  onChange,
  tidy = true,
  tidyLater,
  onTidyLater,
}: {
  accountName?: string;
  fields: CallNoteFields;
  onChange: (next: CallNoteFields) => void;
  tidy?: boolean;
  /** Offline: AI tidies the draft once the phone is back online. */
  tidyLater?: boolean;
  onTidyLater?: (on: boolean) => void;
}) {
  const { products } = useStore();
  const ai = useAiAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [offline, setOffline] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(undefined);
    setDone(false);
    setOffline(false);
    try {
      const today = todayKey();
      const r = await runAi('call_note', {
        transcript: fields.notes,
        accountName: accountName ?? '',
        products: products.map((p) => ({ name: p.name, keyMessages: p.keyMessages })),
        today,
      });
      onChange(mergeCallNote(fields, r, products, today));
      setDone(true);
    } catch (e) {
      const off = e instanceof AiError && e.code === 'offline';
      setOffline(off);
      if (off && onTidyLater) onTidyLater(true);
      else setError(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: space.sm }}>
      <Row style={{ flexWrap: 'wrap' }}>
        <MicButton label="Dictate notes" size={34} onText={(t) => onChange({ ...fields, notes: appendText(fields.notes, t) })} />
        {ai && tidy && (busy ? <ActivityIndicator color={colors.primary} /> : <Button small variant="ghost" icon="sparkles-outline" title="Tidy with AI" onPress={run} disabled={!fields.notes.trim()} />)}
      </Row>
      {ai && tidy && !fields.notes.trim() && <Text style={styles.hint}>Say or type what happened in the call, then let AI fill in the form for you to check.</Text>}
      {done && <Banner tone="success" icon="sparkles">AI filled in the form from your notes. Check everything before saving.</Banner>}
      {!!error && <Banner tone="warn">{error}</Banner>}
      {(offline || tidyLater) && onTidyLater && (
        <ToggleRow label="Tidy with AI when back online" value={!!tidyLater} onChange={onTidyLater} hint="Save as a draft now. AI fills in the draft once you are online, and you check it before submitting." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.faint, marginTop: 4 },
});
