import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { ROLES, type Role } from '@/data/types';
import { Banner, Button, Chip, Empty, Field, Label, Segmented, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
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
  if (me.role !== 'Admin') return <Screen><Empty>Only administrators can manage users.</Empty></Screen>;

  const wantManager = MANAGER_ROLE[role];
  const managers = wantManager ? data.users.filter((u) => u.role === wantManager && u.active) : [];
  const cloud = session?.mode === 'cloud';

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
      <ToggleRow label="Active" value={active} onChange={setActive} hint="Inactive users cannot make changes. Their history is kept. Also remove them from the drive folder." />
      <Banner>
        {cloud
          ? 'This person signs in with this email’s Google or Microsoft account; Ava stores no passwords. After saving, use Share folder with team under Company & approval so they can open the company folder.'
          : 'In a real company, people sign in with their work Google or Microsoft account. Ava stores no passwords.'}
      </Banner>
      <View style={{ marginTop: space.md }}>
        <Button title="Save" onPress={save} />
      </View>
    </Screen>
  );
}
