import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { api, DEFAULT_PASSWORD, loadToken, saveToken } from '@/cloud/relay';
import { Banner, Button, Field, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

/** Change your own password (signed in). */
export default function PasswordScreen() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const save = async () => {
    setError(undefined);
    if (next.length < 8) return setError('Choose a password of at least 8 characters.');
    if (next === DEFAULT_PASSWORD) return setError('Choose a password other than 12345678.');
    if (next !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      const token = await loadToken();
      if (!token) throw new Error('Please sign in again.');
      const r = await api.changePassword(token, current, next);
      await saveToken(r.token);
      notify('Password changed', 'Use your new password the next time you sign in.');
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={[text.muted, { marginBottom: space.md }]}>You need an internet connection to change your password.</Text>
      {!!error && <Banner tone="danger">{error}</Banner>}
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="password" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" hint="At least 8 characters." />
      <Field label="Type the new password again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" onSubmitEditing={save} />
      <Button title={busy ? 'Saving…' : 'Change password'} icon="key-outline" onPress={save} disabled={busy} />
    </Screen>
  );
}
