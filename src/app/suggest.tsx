import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, APP_VERSION, loadToken } from '@/cloud/relay';
import { useStore } from '@/data/store';
import { Banner, Button, Card, Field, Row, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { pickDocPhoto } from '@/ui/photo';
import { Screen } from '@/ui/Screen';
import { radius, space } from '@/ui/theme';

/** 2.13: company administrators suggest a feature; it is emailed to the Ava CRM team (IT@avahealthcareltd.com). */
export default function SuggestScreen() {
  const { admin, session } = useStore();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [shot, setShot] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!admin) return <Screen><Banner tone="info">Your administrator can suggest features for your company.</Banner></Screen>;

  const pick = async () => {
    try {
      const p = await pickDocPhoto('library', 600_000);
      if (p) setShot(p);
    } catch (e) {
      notify('No picture', e instanceof Error ? e.message : String(e));
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      if (session?.demo) throw new Error('Suggestions are sent from a real company, not the demo.');
      const token = await loadToken();
      if (!token) throw new Error('Sign in again, then try once more.');
      await api.suggestFeature(token, { title: title.trim(), details: details.trim(), screenshot: shot, appVersion: APP_VERSION });
      notify('Thank you', 'Your idea is with the Ava CRM team. They may email you about it.');
      router.back();
    } catch (e) {
      notify('Not sent', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={[text.muted, { marginBottom: space.md }]}>Tell us what would make Ava CRM better for your company. It goes to IT@avahealthcareltd.com with your name and email, so we can reply.</Text>
      <Card>
        <Field label="Your idea in a few words" value={title} onChangeText={setTitle} placeholder="e.g. Show stock at each pharmacy" maxLength={120} />
        <Field label="What would it help with?" value={details} onChangeText={setDetails} placeholder="Who would use it, and what they do today instead" multiline maxLength={4000} />
        {shot ? (
          <View style={{ gap: space.sm }}>
            <Image source={{ uri: shot }} style={{ width: '100%', height: 220, borderRadius: radius.md }} contentFit="contain" />
            <Button small variant="ghost" title="Remove picture" onPress={() => setShot(undefined)} />
          </View>
        ) : (
          <Row>
            <Button small variant="ghost" icon="image-outline" title="Add a screenshot (optional)" onPress={pick} />
          </Row>
        )}
      </Card>
      <Button title={busy ? 'Sending…' : 'Send idea'} icon="paper-plane-outline" onPress={send} disabled={busy || title.trim().length < 3 || details.trim().length < 5} />
    </Screen>
  );
}
