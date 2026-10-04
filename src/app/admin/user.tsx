import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api, DEFAULT_PASSWORD, loadToken } from '@/cloud/relay';
import { Text, View } from 'react-native';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { ROLES, type Role } from '@/data/types';
import { Banner, Button, Chip, Empty, Field, Label, Segmented, ToggleRow, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

const MANAGER_ROLE: Partial<Record<Role, Role>> = { Rep: 'FLM', FLM: 'SLM' };

export default function UserEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const me = useMe();
  const { data, getUser, run, session } = useStore();
  const existing = id ? getUser(id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<Role>(existing?.role ?? 'Rep');
  const [managerId, setManagerId] = useState(existing?.managerId);
  const [territory, setTerritory] = useState(existing?.territory ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [resetting, setResetting] = useState(false);
  if (me.role !== 'Admin') return <Screen><Empty>Only administrators can manage users.</Empty></Screen>;

  const wantManager = MANAGER_ROLE[role];
  const managers = wantManager ? data.users.filter((u) => u.role === wantManager && u.active) : [];
  const code = session?.companyCode;
  const resetPassword = () =>
    confirm(
      'Reset password?',
      `${existing?.name} will sign in with ${DEFAULT_PASSWORD} next time and must choose a new password.`,
      async () => {
        setResetting(true);
        try {
          const token = await loadToken();
          if (!token) throw new Error('Please sign in again.');
          await api.resetPassword(token, existing!.email);
          notify('Password reset', `${existing?.name} can now sign in with ${DEFAULT_PASSWORD}${code ? ` and company code ${code}` : ''}, then choose a new password.`);
        } catch (e) {
          notify('Not reset', e instanceof Error ? e.message : String(e));
        } finally {
          setResetting(false);
        }
      },
      'Reset',
    );

  const save = () => {
    try {
      run({
        type: 'user.upsert',
        user: {
          id: existing?.id ?? newId('usr'),
          name,
          email,
          role,
          managerId: wantManager && managers.some((m) => m.id === managerId) ? managerId : undefined,
          territory: territory.trim() || undefined,
          active,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        },
      });
      router.back();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit user' : 'Add user' }} />
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Label>Role</Label>
      <Segmented options={ROLES} value={role} onChange={setRole} />
      {wantManager && (
        <>
          <Label>Reports to ({wantManager})</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
            {managers.map((m) => (
              <Chip key={m.id} label={`${m.name}${m.territory ? ` · ${m.territory}` : ''}`} selected={managerId === m.id} onPress={() => setManagerId(m.id)} />
            ))}
            {!managers.length && <Text style={text.muted}>Add an {wantManager} first.</Text>}
          </View>
        </>
      )}
      <Field label={role === 'Rep' ? 'Territory' : role === 'FLM' ? 'Team / district' : role === 'SLM' ? 'Region' : 'Department'} value={territory} onChangeText={setTerritory} />
      <ToggleRow label="Active" value={active} onChange={setActive} hint="Inactive users cannot sign in or make changes. Their history is kept." />
      <Banner icon="key-outline">
        {existing
          ? `${existing.name} signs in with company code ${code ?? '(see Company & approval)'}, the email above and their own password.`
          : `After saving, ${name.trim().split(' ')[0] || 'they'} can sign in with company code ${code ?? '(see Company & approval)'}, this email and the starting password ${DEFAULT_PASSWORD}. They choose their own password at first sign-in.`}
      </Banner>
      {existing && existing.id !== me.id && <Button title={resetting ? 'Resetting…' : 'Reset password'} variant="secondary" icon="refresh-outline" onPress={resetPassword} disabled={resetting} />}
      <View style={{ marginTop: space.md }}>
        <Button title="Save" onPress={save} />
      </View>
    </Screen>
  );
}
