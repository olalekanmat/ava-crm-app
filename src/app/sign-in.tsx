import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, DEFAULT_PASSWORD, saveToken, type LoginResult } from '@/cloud/relay';
import { normalizeProvider, providerLabel } from '@/cloud/drive';
import { openCompany } from '@/cloud/setup';
import { loadJson, saveJson } from '@/data/storage';
import { useStore } from '@/data/store';
import { mark } from '@/ui/Brand';
import { Banner, Button, Field, text } from '@/ui/components';
import { colors, radius, shadow, space } from '@/ui/theme';

const REMEMBER = 'ava.signin';
const SETUP_URL = 'https://avahealthcareltd.com/AvaCRM/app/setup';

/** Sign in with the company code, work email and password. First sign-in asks for a new password. */
export default function SignInScreen() {
  const { enterCloud } = useStore();
  const params = useLocalSearchParams<{ company?: string; email?: string; setup?: string; provider?: string }>();
  const [code, setCode] = useState(params.company ?? '');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<LoginResult | null>(null);
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (params.company) return;
    loadJson<{ code: string; email: string }>(REMEMBER).then((r) => {
      if (r) {
        setCode((c) => c || r.code);
        setEmail((e) => e || r.email);
      }
    });
  }, [params.company]);

  const attempt = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const finish = async (login: LoginResult) => {
    await saveToken(login.token);
    await saveJson(REMEMBER, { code: login.companyCode, email: login.user.email });
    setBusy(`Opening ${login.companyName || 'your company'}…`);
    const { session, cache } = await openCompany(login);
    await enterCloud(session, cache);
  };

  const signIn = () =>
    attempt('Signing in…', async () => {
      if (!code.trim() || !email.trim() || !password) throw new Error('Enter your company code, email and password.');
      const r = await api.login(code, email, password);
      if (r.mustChange) {
        setPending({ ...r });
        setNext('');
        setConfirmNext('');
        return;
      }
      await finish(r);
    });

  const changePassword = () =>
    attempt('Saving your new password…', async () => {
      if (!pending) return;
      if (next.length < 8) throw new Error('Choose a password of at least 8 characters.');
      if (next === DEFAULT_PASSWORD) throw new Error('Choose a password other than 12345678.');
      if (next !== confirmNext) throw new Error('The two passwords do not match.');
      const { token } = await api.changePassword(pending.token, password, next);
      setPassword('');
      await finish({ ...pending, token, mustChange: false });
    });

  const setUp = () => {
    if (Platform.OS === 'web') router.push('/setup');
    else WebBrowser.openBrowserAsync(SETUP_URL);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[colors.primaryDark, colors.primary, colors.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logoWrap}>
              <Image source={mark} style={{ width: 38, height: 76 }} contentFit="contain" />
            </View>
            <Text style={styles.name}>Ava CRM</Text>
            <Text style={styles.tagline}>Field CRM for pharma sales teams</Text>
          </View>

          <View style={styles.card}>
            {params.setup === 'done' && !pending && <Banner tone="success">Your company is set up and {providerLabel(normalizeProvider(params.provider))} is linked. Sign in with the password you chose. Your company code is {params.company}.</Banner>}
            {!!error && <Banner tone="danger">{error}</Banner>}

            {!pending ? (
              <>
                <Text style={[text.h2, { marginBottom: space.md }]}>Sign in</Text>
                <Field label="Company code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. 7KQ2MD" maxLength={6} hint="The 6-character code from your administrator." />
                <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="name@company.com" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" onSubmitEditing={signIn} returnKeyType="go" hint="First time? Use 12345678, then choose your own password." />
                <Button title="Sign in" icon="log-in-outline" onPress={signIn} disabled={!!busy} />
              </>
            ) : (
              <>
                <View style={styles.pwHead}>
                  <Ionicons name="key-outline" size={22} color={colors.primary} />
                  <Text style={text.h2}>Choose your password</Text>
                </View>
                <Text style={[text.muted, { marginBottom: space.md }]}>
                  Welcome, {pending.user.name.split(' ')[0]}. Before you start, replace the starting password with one only you know (at least 8 characters).
                </Text>
                <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
                <Field label="Type it again" value={confirmNext} onChangeText={setConfirmNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" onSubmitEditing={changePassword} returnKeyType="go" />
                <Button title="Save password and continue" icon="checkmark-circle-outline" onPress={changePassword} disabled={!!busy} />
                <Button title="Back" variant="ghost" onPress={() => setPending(null)} disabled={!!busy} />
              </>
            )}

            {!!busy && (
              <View style={styles.busy}>
                <ActivityIndicator color={colors.primary} />
                <Text style={text.muted}>{busy}</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={text.title}>New to Ava CRM?</Text>
            <Text style={[text.muted, { marginBottom: space.sm }]}>Company administrators set up the company once and link the company’s OneDrive or Google Drive, where all of its data is kept. Everyone else just signs in.</Text>
            <Button title="Set up a new company" variant="secondary" icon="business-outline" onPress={setUp} disabled={!!busy} />
          </View>
          <Text style={styles.footer}>Ava CRM by Ava Healthcare Limited · avahealthcareltd.com</Text>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingTop: 48, paddingBottom: 40, width: '100%', maxWidth: 460, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: space.lg },
  logoWrap: { width: 92, height: 92, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  name: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.8, marginTop: space.md },
  tagline: { color: 'rgba(255,255,255,0.88)', fontSize: 15, marginTop: 2, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg + 4, padding: space.lg, marginBottom: space.md, ...shadow },
  pwHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 4 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  footer: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center', marginTop: space.sm },
});
