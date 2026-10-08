import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { normalizeProvider, type SetupProvider } from '@/cloud/drive';
import { api, DEFAULT_PASSWORD } from '@/cloud/relay';
import type { Company } from '@/data/types';
import { BrandTitle } from '@/ui/Brand';
import { Banner, Button, Field, text, type IconName } from '@/ui/components';
import { cleanCompany, CompanyForm } from '@/ui/CompanyForm';
import { colors, radius, shadow, space } from '@/ui/theme';

/** The drives a company can keep its data in. OneDrive stays the default. */
const PROVIDERS: { key: SetupProvider; title: string; icon: IconName; account: string; drive: string; desc: string }[] = [
  {
    key: 'onedrive',
    title: 'Microsoft OneDrive / SharePoint',
    icon: 'logo-windows',
    account: 'Microsoft',
    drive: 'OneDrive',
    desc: 'For companies on Microsoft 365. Sign in with your work Microsoft account; the data folder is created in your OneDrive.',
  },
  {
    key: 'google',
    title: 'Google Drive',
    icon: 'logo-google',
    account: 'Google',
    drive: 'Google Drive',
    desc: 'For companies on Google Workspace or Gmail. Sign in with your Google account; the data folder is created in your Google Drive.',
  },
];

/**
 * First run for a company administrator: company details, the admin's own sign-in, then
 * Microsoft or Google sign-in to link the drive where all of the company's data will be kept.
 */
export default function SetupScreen() {
  const params = useLocalSearchParams<{ error?: string }>();
  const [company, setCompany] = useState<Company>({ name: '' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string | undefined>(params.error);
  const [provider, setProvider] = useState<SetupProvider>('onedrive');
  const choice = PROVIDERS.find((p) => p.key === provider)!;

  const submit = async () => {
    setTried(true);
    setError(undefined);
    if (!company.name.trim()) return setError('Enter the company name.');
    if (!name.trim()) return setError('Enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter your work email address.');
    if (password.length < 8 || password === DEFAULT_PASSWORD) return setError('Choose a password of at least 8 characters (not 12345678).');
    if (password !== confirmPw) return setError('The two passwords do not match.');
    try {
      setBusy(`Preparing the ${choice.drive} link…`);
      const r = await api.startSetup(cleanCompany(company), { name: name.trim(), email: email.trim().toLowerCase(), password }, provider);
      // A server that does not know Google Drive yet would link OneDrive instead: say so rather than surprise.
      if (r.provider && normalizeProvider(r.provider) !== provider) throw new Error(`${choice.drive} cannot be linked right now. Choose ${provider === 'google' ? 'Microsoft OneDrive' : 'Google Drive'} or try again later.`);
      const { authorizeUrl } = r;
      if (Platform.OS === 'web') window.location.assign(authorizeUrl);
      else await WebBrowser.openBrowserAsync(authorizeUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(undefined);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: space.lg }}>
          <BrandTitle size={30} />
          <Text style={[text.h2, { marginTop: space.md }]}>Set up your company</Text>
          <Text style={[text.muted, { textAlign: 'center' }]}>You will be the company’s first administrator. It takes about two minutes.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>1 · Company</Text>
          <CompanyForm value={company} onChange={setCompany} tried={tried} />
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>2 · Your sign-in</Text>
          <Text style={[text.muted, { marginBottom: space.md }]}>You will sign in to Ava CRM with this email and password, on the web and on your phone.</Text>
          <Field label="Your full name *" value={name} onChangeText={setName} autoComplete="name" />
          <Field label="Your work email *" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
          <Field label="Choose a password *" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" hint="At least 8 characters." />
          <Field label="Type it again *" value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>3 · Where to keep your data</Text>
          <Text style={[text.muted, { marginBottom: space.md }]}>Choose the drive your company already uses. Your team does not need an account there: they just sign in to Ava CRM.</Text>
          <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
            {PROVIDERS.map((p) => {
              const on = p.key === provider;
              return (
                <Pressable
                  key={p.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setProvider(p.key)}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <Ionicons name={p.icon} size={24} color={on ? colors.primary : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{p.title}</Text>
                    <Text style={text.muted}>{p.desc}</Text>
                  </View>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.faint} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>4 · Link your {choice.drive}</Text>
          <Text style={text.muted}>
            Next, {choice.account} asks you to sign in and allow Ava CRM to use your {choice.drive}. Ava CRM creates a folder named “Ava CRM - {company.name.trim() || 'your company'}” and keeps all of your company’s data there: accounts, calls, plans and users. Ava Healthcare does not store it.
          </Text>
          <Text style={[text.muted, { marginTop: space.sm }]}>Your company name and your name and email are also sent to Ava Healthcare to approve your subscription. Only you link {choice.drive}; your team just signs in.</Text>
        </View>

        {!!error && <Banner tone="danger">{error}</Banner>}
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.primary} />
            <Text style={text.muted}>{busy}</Text>
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Button title={`Continue to ${choice.account} sign-in`} icon={choice.icon} onPress={submit} />
            <Button title="Back to sign in" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingTop: 40, paddingBottom: 48, width: '100%', maxWidth: 600, alignSelf: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg + 4, padding: space.lg, marginBottom: space.md, ...shadow },
  step: { fontSize: 13, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
  busy: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', padding: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
