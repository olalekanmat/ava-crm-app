import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { defaultServerUrl } from '@/data/api';
import { buildSeed } from '@/data/seed';
import { useStore } from '@/data/store';
import { ROLE_LABEL, type User } from '@/data/types';
import { mark } from '@/ui/Brand';
import { Avatar, Banner, Button, Field, text } from '@/ui/components';
import { colors, radius, shadow, space } from '@/ui/theme';

const DEMO_USERS: User[] = (() => {
  const users = buildSeed().users;
  const pickRole = (r: User['role']) => users.find((u) => u.role === r)!;
  return [pickRole('Rep'), pickRole('FLM'), pickRole('SLM'), pickRole('Admin')];
})();

const ROLE_BLURB: Record<User['role'], string> = {
  Rep: 'Today’s calls, call logging with check-in, cycle plan',
  FLM: 'Team view, plan approvals, check-in compliance',
  SLM: 'Region overview across first-line teams',
  Admin: 'Users, CSV import, exports, cycles and rules',
};

export default function SignInScreen() {
  const { signIn, signInDemo } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(defaultServerUrl());
  const [showServer, setShowServer] = useState(!defaultServerUrl());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!server.trim()) {
      setShowServer(true);
      setError('Enter the server address your administrator gave you, or explore the demo below.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await signIn(server, email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[colors.primaryDark, colors.primary, colors.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logoWrap}>
              <Image source={mark} style={{ width: 46, height: 92 }} contentFit="contain" />
            </View>
            <Text style={styles.name}>Ava</Text>
            <Text style={styles.tagline}>The field CRM your reps actually like using</Text>
          </View>

          <View style={styles.card}>
            <Text style={[text.h2, { marginBottom: space.md }]}>Sign in</Text>
            {!!error && <Banner tone="danger">{error}</Banner>}
            <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="name@company.com" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
            {showServer ? (
              <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" placeholder="https://ava.yourcompany.com" />
            ) : (
              <Pressable onPress={() => setShowServer(true)} style={{ marginBottom: space.md }}>
                <Text style={text.small}>Server: {server} · change</Text>
              </Pressable>
            )}
            {busy ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 12 }} /> : <Button title="Sign in" onPress={submit} disabled={!email || !password} />}
          </View>

          <View style={styles.card}>
            <Text style={text.h2}>Explore the demo</Text>
            <Text style={[text.muted, { marginBottom: space.md }]}>A fictional sales organisation, stored only on this device. Pick a role to see its view; you can switch any time under More.</Text>
            {DEMO_USERS.map((u) => (
              <Pressable key={u.id} onPress={() => signInDemo(u.id)} style={({ pressed }) => [styles.role, pressed && { opacity: 0.7 }]}>
                <Avatar name={u.name} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>
                    {ROLE_LABEL[u.role]} · {u.name}
                  </Text>
                  <Text style={text.muted}>{ROLE_BLURB[u.role]}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingTop: 56, paddingBottom: 48, width: '100%', maxWidth: 480, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: space.xl },
  logoWrap: { width: 112, height: 112, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  name: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: space.md },
  tagline: { color: 'rgba(255,255,255,0.88)', fontSize: 15, marginTop: 2, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg + 4, padding: space.lg, marginBottom: space.md, ...shadow },
  role: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, borderTopWidth: 1, borderTopColor: colors.border },
});
