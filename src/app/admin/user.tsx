import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, DEFAULT_PASSWORD, loadToken } from '@/cloud/relay';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { ROLES, type Role } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, Segmented, ToggleRow, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { PhotoEditor } from '@/ui/PhotoEditor';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const MANAGER_ROLE: Partial<Record<Role, Role>> = { Rep: 'FLM', FLM: 'SLM' };

export default function UserEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const me = useMe();
  const { data, getUser, run, session, admin: canManage } = useStore();
  const existing = id ? getUser(id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<Role>(existing?.role ?? 'Rep');
  const [alsoAdmin, setAlsoAdmin] = useState(!!existing?.admin);
  const [employeeId, setEmployeeId] = useState(existing?.employeeId ?? '');
  const [managerId, setManagerId] = useState(existing?.managerId);
  const [territory, setTerritory] = useState(existing?.territory ?? '');
  const [territoryId, setTerritoryId] = useState(existing?.territoryId ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successor, setSuccessor] = useState<string>();
  if (!canManage) return <Screen><Empty>Only administrators can manage users.</Empty></Screen>;
  if (id && (!existing || existing.deletedAt)) return <Screen><Empty>This person was deleted.</Empty></Screen>;

  const wantManager = MANAGER_ROLE[role];
  const managers = wantManager ? data.users.filter((u) => u.role === wantManager && u.active && u.id !== existing?.id) : [];
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
          // Sent even when empty or off, so clearing them is saved (a missing field keeps the old value).
          admin: role !== 'Admin' && alsoAdmin,
          employeeId: employeeId.trim(),
          managerId: wantManager && managers.some((m) => m.id === managerId) ? managerId : undefined,
          territory: territory.trim() || undefined,
          territoryId: territoryId.trim(),
          active,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        },
      });
      router.back();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  // ----- deleting -----
  const owned = existing ? data.accounts.filter((a) => a.ownerId === existing.id).length : 0;
  const reports = existing ? data.users.filter((u) => u.managerId === existing.id) : [];
  const openCalls = existing ? data.calls.filter((c) => c.ownerId === existing.id && c.status !== 'Submitted').length : 0;
  const successors = existing ? data.users.filter((u) => u.role === existing.role && u.active && u.id !== existing.id) : [];
  const needsSuccessor = owned > 0;
  const remove = () => {
    if (!existing) return;
    if (needsSuccessor && !successor) return notify('Choose who takes over', `${existing.name}'s ${owned} account${owned > 1 ? 's' : ''} need a new owner.`);
    const to = getUser(successor);
    confirm(
      `Delete ${existing.name}?`,
      [
        `${existing.name} will no longer be able to sign in and disappears from lists.`,
        to ? `Their ${owned ? `${owned} account${owned > 1 ? 's' : ''}` : ''}${owned && reports.length ? ' and ' : ''}${reports.length ? `${reports.length} direct report${reports.length > 1 ? 's' : ''}` : ''} move to ${to.name}.` : reports.length ? `Their ${reports.length} direct report${reports.length > 1 ? 's' : ''} will have no manager until you choose one.` : '',
        openCalls ? `${openCalls} planned or draft call${openCalls > 1 ? 's' : ''} and their plans are removed.` : '',
        'Submitted calls stay in the history. This cannot be undone.',
      ]
        .filter(Boolean)
        .join(' '),
      async () => {
        try {
          // Switch them off first: older app versions do not know about deleting and still honour this.
          if (existing.active) {
            try {
              run({ type: 'user.upsert', user: { ...existing, active: false } });
            } catch {
              // Their record may no longer pass today's rules (e.g. a manager changed role); deleting still works.
            }
          }
          run({ type: 'user.delete', users: [{ id: existing.id, transferTo: to?.id }] });
          router.back();
        } catch (e) {
          notify('Not deleted', e instanceof Error ? e.message : String(e));
        }
      },
      'Delete',
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit user' : 'Add user' }} />
      {existing && (
        <Card>
          <PhotoEditor user={existing} />
        </Card>
      )}
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="User ID" value={employeeId} onChangeText={setEmployeeId} autoCapitalize="characters" placeholder="e.g. EMP-0042" hint="Your company’s own ID for this person (optional, must be unique)." />
      <Label>Role</Label>
      <Segmented options={ROLES} value={role} onChange={setRole} />
      {role !== 'Admin' && (
        <ToggleRow label="Also an administrator" value={alsoAdmin} onChange={setAlsoAdmin} hint={`Dual role: works as ${role === 'Rep' ? 'a rep' : `an ${role}`} and can also manage users, accounts, products and settings.`} />
      )}
      {wantManager && (
        <>
          <Label>Reports to ({wantManager})</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
            {managers.map((m) => (
              <Chip key={m.id} label={`${m.name}${m.territory ? ` · ${m.territory}` : ''}`} selected={managerId === m.id} onPress={() => setManagerId(managerId === m.id ? undefined : m.id)} />
            ))}
            {!managers.length && <Text style={text.muted}>Add an {wantManager} first.</Text>}
          </View>
        </>
      )}
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 3 }}>
          <Field label={role === 'Rep' ? 'Territory' : role === 'FLM' ? 'Team / district' : role === 'SLM' ? 'Region' : 'Department'} value={territory} onChangeText={setTerritory} />
        </View>
        <View style={{ flex: 2 }}>
          <Field label={role === 'Rep' ? 'Territory ID' : role === 'FLM' ? 'Team ID' : role === 'SLM' ? 'Region ID' : 'Department ID'} value={territoryId} onChangeText={setTerritoryId} autoCapitalize="characters" placeholder="e.g. LAG-IKJ-01" />
        </View>
      </Row>
      <ToggleRow label="Active" value={active} onChange={setActive} hint="Inactive users cannot sign in or make changes. Their history is kept." />
      <Banner icon="key-outline">
        {existing
          ? `${existing.name} signs in with company code ${code ?? '(see Company & approval)'}, the email above and their own password.`
          : `After saving, ${name.trim().split(' ')[0] || 'they'} can sign in with company code ${code ?? '(see Company & approval)'}, this email and the starting password ${DEFAULT_PASSWORD}. They choose their own password at first sign-in.`}
      </Banner>
      <View style={{ marginTop: space.sm, gap: space.sm }}>
        <Button title="Save" onPress={save} />
        {existing && existing.id !== me.id && <Button title={resetting ? 'Resetting…' : 'Reset password'} variant="secondary" icon="refresh-outline" onPress={resetPassword} disabled={resetting} />}
      </View>

      {existing && existing.id !== me.id && (
        <>
          <SectionTitle>Delete</SectionTitle>
          {!deleting ? (
            <Button title="Delete user" variant="danger" icon="trash-outline" onPress={() => setDeleting(true)} />
          ) : (
            <Card style={{ borderColor: colors.danger }}>
              <Text style={[text.title, { marginBottom: space.xs }]}>Delete {existing.name}</Text>
              <Text style={[text.muted, { marginBottom: space.sm }]}>
                {owned || reports.length
                  ? `${existing.name} has ${[owned && `${owned} account${owned > 1 ? 's' : ''}`, reports.length && `${reports.length} direct report${reports.length > 1 ? 's' : ''}`].filter(Boolean).join(' and ')}. Choose another ${existing.role} to take ${owned + reports.length > 1 ? 'them' : 'it'} over${needsSuccessor ? '' : ' (optional)'}.`
                  : 'Nothing needs to move. To keep them but stop sign-in, switch off Active instead.'}
              </Text>
              {(owned > 0 || reports.length > 0) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {successors.map((u) => (
                    <Chip key={u.id} label={`${u.name}${u.territory ? ` · ${u.territory}` : ''}`} selected={successor === u.id} onPress={() => setSuccessor(successor === u.id ? undefined : u.id)} />
                  ))}
                  {!successors.length && <Text style={[text.muted, { color: colors.danger }]}>Add another {existing.role} first, or move the accounts with a CSV import.</Text>}
                </View>
              )}
              <Row style={{ marginTop: space.sm }}>
                <Button title="Cancel" variant="ghost" onPress={() => setDeleting(false)} />
                <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} disabled={needsSuccessor && !successor} />
              </Row>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
