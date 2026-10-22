import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, APP_VERSION, DEFAULT_PASSWORD, loadTrust, saveToken, saveTrust, type LoginResult, type TwoStepPending } from '@/cloud/relay';
import { normalizeProvider, providerLabel } from '@/cloud/drive';
import { openCompany } from '@/cloud/setup';
import { loadJson, saveJson } from '@/data/storage';
import { DEMO_ROLES } from '@/data/demo';
import { useStore } from '@/data/store';
import { mark } from '@/ui/Brand';
import { Banner, Button, Field, ListRow, ToggleRow, text } from '@/ui/components';
import { colors, radius, shadow, space } from '@/ui/theme';
import { SEEN_VERSION_KEY } from '@/ui/WhatsNewCheck';

const REMEMBER = 'ava.signin';

function checkNewPassword(next: string, again: string) {
  if (next.length < 8) throw new Error('Choose a password of at least 8 characters.');
  if (next === DEFAULT_PASSWORD) throw new Error('Choose a password other than 12345678.');
  if (next !== again) throw new Error('The two passwords do not match.');
}
const SETUP_URL = 'https://avahealthcareltd.com/AvaCRM/app/setup';

/** Sign in with the company code, work email and password. First sign-in asks for a new password. */
export default function SignInScreen() {
  const { enterCloud, enterDemo } = useStore();
  const [demo, setDemo] = useState(false);
  /** Someone who signed in on this device before sees the sign-in form first, not the demo. */
  const [returning, setReturning] = useState(false);
  const params = useLocalSearchParams<{ company?: string; email?: string; setup?: string; provider?: string; trial?: string }>();
  const [code, setCode] = useState(params.company ?? '');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<LoginResult | null>(null);
  const [twoStep, setTwoStep] = useState<TwoStepPending | null>(null);
  const [otp, setOtp] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  /** Forgot password: 'ask' for the email, then 'reset' with the emailed code. */
  const [forgot, setForgot] = useState<'ask' | 'reset' | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();

  useEffect(() => {
    if (params.company) return;
    loadJson<{ code: string; email: string }>(REMEMBER).then((r) => {
      if (r) {
        setReturning(true);
        setCode((c) => c || r.code);
        setEmail((e) => e || r.email);
      }
    });
  }, [params.company]);

  const attempt = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(undefined);
    setInfo(undefined);
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
    if (login.trust) await saveTrust(login.trust).catch(() => {});
    await saveJson(REMEMBER, { code: login.companyCode, email: login.user.email });
    // A fresh sign-in is not an update: What's new waits for the next version.
    await saveJson(SEEN_VERSION_KEY, APP_VERSION);
    setBusy(`Opening ${login.companyName || 'your company'}…`);
    const { session, cache } = await openCompany(login);
    await enterCloud(session, cache);
  };

  /** After the password (and, for administrators who need one, the emailed code). */
  const signedIn = async (r: LoginResult) => {
    if (r.mustChange) {
      setPending({ ...r });
      setNext('');
      setConfirmNext('');
      return;
    }
    await finish(r);
  };

  const signIn = () =>
    attempt('Signing in…', async () => {
      if (!code.trim() || !email.trim() || !password) throw new Error('Enter your company code, email and password.');
      const r = await api.login(code, email, password, await loadTrust());
      if ('twoStep' in r) {
        setTwoStep(r);
        setOtp('');
        return;
      }
      await signedIn(r);
    });

  const verify = () =>
    attempt('Checking the code…', async () => {
      if (!twoStep) return;
      if (!/^\d{6}$/.test(otp.trim())) throw new Error('Enter the 6-digit code from the email.');
      const r = await api.verifySignIn(twoStep.ticket, otp, trustDevice);
      setTwoStep(null);
      await signedIn(r);
    });

  const changePassword = () =>
    attempt('Saving your new password…', async () => {
      if (!pending) return;
      checkNewPassword(next, confirmNext);
      const { token } = await api.changePassword(pending.token, password, next);
      setPassword('');
      await finish({ ...pending, token, mustChange: false });
    });

  const sendResetCode = () =>
    attempt('Sending a code…', async () => {
      if (!code.trim() || !email.trim()) throw new Error('Enter your company code and work email.');
      const r = await api.forgotPassword(code, email);
      setSentTo(r.sentTo);
      setForgot('reset');
      setOtp('');
      setNext('');
      setConfirmNext('');
    });

  const resetPassword = () =>
    attempt('Saving your new password…', async () => {
      if (!/^\d{6}$/.test(otp.trim())) throw new Error('Enter the 6-digit code from the email.');
      checkNewPassword(next, confirmNext);
      await api.resetWithCode(code, email, otp, next);
      setForgot(null);
      setPassword(next);
      setOtp('');
      setInfo('Your password is changed. Signing you in…');
      const r = await api.login(code, email, next, await loadTrust());
      if ('twoStep' in r) {
        setTwoStep(r);
        return;
      }
      await signedIn(r);
    });

  const setUp = () => {
    if (Platform.OS === 'web') router.push({ pathname: '/setup', params: { trial: '1' } });
    else WebBrowser.openBrowserAsync(`${SETUP_URL}?trial=1`);
  };

  const demoCard = (
    <View style={styles.card}>
      <Text style={text.title}>Just looking?</Text>
      <Text style={[text.muted, { marginBottom: space.sm }]}>Try Ava CRM with a demo company. No sign-in needed.</Text>
      <Button title="Try the demo" icon="sparkles-outline" onPress={() => setDemo((x) => !x)} disabled={!!busy} />
      {demo && (
        <View style={{ marginTop: space.sm }}>
          <Text style={[text.muted, { marginBottom: space.xs }]}>Look around with made-up data. Nothing is saved. Choose whose view to see:</Text>
          {DEMO_ROLES.map((r) => (
            <ListRow
              key={r.key}
              icon={r.key === 'rep' ? 'walk-outline' : r.key === 'admin' ? 'settings-outline' : 'people-outline'}
              title={r.label}
              subtitle={r.hint}
              onPress={() => {
                enterDemo(r.userId);
                setTimeout(() => router.push('/tour'), 400);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[colors.primaryDark, colors.primary, colors.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logoWrap}>
              <Image source={mark} style={{ width: 38, height: 76 }} contentFit="contain" />
            </View>
            <Text style={styles.name}>Ava CRM</Text>
            <Text style={styles.tagline}>by Ava Healthcare Limited</Text>
          </View>

          {!returning && !params.company && demoCard}

          <View style={styles.card}>
            {params.setup === 'done' && !pending && <Banner tone="success">Your company is set up and {providerLabel(normalizeProvider(params.provider))} is linked. Sign in with the password you chose. Your company code is {params.company}.</Banner>}
            {params.setup === 'done' && !pending && params.trial === 'started' && <Banner tone="info" icon="hourglass-outline">Your free trial has started. Sign in and add your team.</Banner>}
            {params.setup === 'done' && !pending && params.trial === 'used' && <Banner tone="warn">This email has already had a free trial, so your company is waiting for Ava Healthcare’s approval. You can subscribe online in Company & approval after signing in.</Banner>}
            {!!error && <Banner tone="danger">{error}</Banner>}
            {!!info && !error && <Banner tone="success">{info}</Banner>}

            {twoStep ? (
              <>
                <View style={styles.pwHead}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
                  <Text style={text.h2}>Check your email</Text>
                </View>
                <Text style={[text.muted, { marginBottom: space.md }]}>Administrators confirm each sign-in. We sent a 6-digit code to {twoStep.sentTo}. It works for 15 minutes.</Text>
                <Field label="Code" value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, ''))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} onSubmitEditing={verify} returnKeyType="go" />
                <ToggleRow label="Trust this device for 30 days" value={trustDevice} onChange={setTrustDevice} hint="Skip the code on this device. Leave it off on a shared computer." />
                <Button title="Confirm and sign in" icon="checkmark-circle-outline" onPress={verify} disabled={!!busy} />
                <Button title="Send a new code" variant="ghost" onPress={signIn} disabled={!!busy} />
                <Button title="Back" variant="ghost" onPress={() => setTwoStep(null)} disabled={!!busy} />
              </>
            ) : forgot === 'ask' ? (
              <>
                <View style={styles.pwHead}>
                  <Ionicons name="mail-outline" size={22} color={colors.primary} />
                  <Text style={text.h2}>Forgot your password?</Text>
                </View>
                <Text style={[text.muted, { marginBottom: space.md }]}>We email a code to your work email. You then choose a new password.</Text>
                <Field label="Company code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. 7KQ2MD" maxLength={6} />
                <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="name@company.com" onSubmitEditing={sendResetCode} returnKeyType="send" />
                <Button title="Email me a code" icon="paper-plane-outline" onPress={sendResetCode} disabled={!!busy} />
                <Button title="Back to sign in" variant="ghost" onPress={() => setForgot(null)} disabled={!!busy} />
              </>
            ) : forgot === 'reset' ? (
              <>
                <View style={styles.pwHead}>
                  <Ionicons name="key-outline" size={22} color={colors.primary} />
                  <Text style={text.h2}>Choose a new password</Text>
                </View>
                <Text style={[text.muted, { marginBottom: space.md }]}>If {sentTo} signs in to this company, a 6-digit code is on its way. It works for 15 minutes; check the spam folder too.</Text>
                <Field label="Code from the email" value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, ''))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
                <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
                <Field label="Type it again" value={confirmNext} onChangeText={setConfirmNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" onSubmitEditing={resetPassword} returnKeyType="go" />
                <Button title="Save and sign in" icon="checkmark-circle-outline" onPress={resetPassword} disabled={!!busy} />
                <Button title="Send a new code" variant="ghost" onPress={sendResetCode} disabled={!!busy} />
                <Button title="Back to sign in" variant="ghost" onPress={() => setForgot(null)} disabled={!!busy} />
              </>
            ) : !pending ? (
              <>
                <Text style={[text.h2, { marginBottom: space.md }]}>Sign in</Text>
                <Field label="Company code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. 7KQ2MD" maxLength={6} hint="The 6-character code from your administrator." />
                <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="name@company.com" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" onSubmitEditing={signIn} returnKeyType="go" />
                <Button title="Sign in" icon="log-in-outline" onPress={signIn} disabled={!!busy} />
                <Button title="Forgot password?" variant="ghost" onPress={() => { setError(undefined); setForgot('ask'); }} disabled={!!busy} />
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
            <Button title="Start a free trial" variant="secondary" icon="rocket-outline" onPress={setUp} disabled={!!busy} />
            <Text style={[text.small, { marginTop: space.xs, textAlign: 'center' }]}>Sets up your company. No card needed.</Text>
          </View>

          {(returning || !!params.company) && demoCard}
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
});
