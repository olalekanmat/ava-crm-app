import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { isAdmin } from '@/data/access';
import { useStore } from '@/data/store';
import { ROLE_LABEL, ROLES, type Role, type User } from '@/data/types';
import { Badge, Button, Card, Chip, Empty, Row, SearchBox, SectionTitle, Segmented, UserAvatar, text } from '@/ui/components';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type RoleFilter = 'All' | Role;
type Status = 'Active' | 'Inactive' | 'All';

const NEEDS_MANAGER: Partial<Record<Role, boolean>> = { Rep: true, FLM: true };

export default function UsersScreen() {
  const { data, getUser, admin, syncNow, sync } = useStore();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleFilter>('All');
  const [status, setStatus] = useState<Status>('Active');
  const [noManager, setNoManager] = useState(false);

  const inStatus = useMemo(() => data.users.filter((u) => status === 'All' || (status === 'Active' ? u.active : !u.active)), [data.users, status]);
  const hasRole = (u: User, r: RoleFilter) => r === 'All' || u.role === r || (r === 'Admin' && isAdmin(u));
  const match = useMemo(() => {
    const query = q.trim().toLowerCase();
    return inStatus.filter(
      (u) =>
        hasRole(u, role) &&
        (!noManager || (NEEDS_MANAGER[u.role] && !u.managerId)) &&
        (!query || [u.name, u.email, u.employeeId, u.territory, u.territoryId].some((v) => v?.toLowerCase().includes(query))),
    );
  }, [inStatus, role, noManager, q]);

  if (!admin) return <Screen><Empty>Only administrators can manage users.</Empty></Screen>;
  const unmanaged = inStatus.filter((u) => NEEDS_MANAGER[u.role] && !u.managerId).length;

  return (
    <Screen wide onRefresh={() => syncNow()} refreshing={sync.syncing}>
      <SearchBox value={q} onChangeText={setQ} placeholder="Search name, email, user ID or territory" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(['All', ...ROLES] as RoleFilter[]).map((r) => (
          <Chip key={r} label={`${r === 'All' ? 'Everyone' : r === 'Admin' ? 'Admins' : `${r}s`} ${inStatus.filter((u) => hasRole(u, r)).length}`} selected={role === r} onPress={() => setRole(r)} />
        ))}
        {(unmanaged > 0 || noManager) && <Chip label={`No manager ${unmanaged}`} icon="git-network-outline" selected={noManager} onPress={() => setNoManager(!noManager)} />}
      </View>
      <Segmented options={['Active', 'Inactive', 'All'] as Status[]} value={status} onChange={setStatus} labels={{ All: 'All statuses' }} />
      <Row style={{ marginBottom: space.sm }}>
        <Button title="Add user" icon="person-add-outline" onPress={() => router.push('/admin/user')} />
        <Button title="Import CSV" icon="cloud-upload-outline" variant="secondary" onPress={() => router.push({ pathname: '/admin/import', params: { kind: 'users' } })} />
      </Row>
      {!match.length && <Empty icon="search-outline">No one matches these filters.</Empty>}
      {ROLES.map((r: Role) => {
        const people = match.filter((u) => u.role === r).sort((a, b) => a.name.localeCompare(b.name));
        if (!people.length) return null;
        return (
          <View key={r}>
            <SectionTitle>
              {ROLE_LABEL[r]}s ({people.length})
            </SectionTitle>
            <Grid>
              {people.map((u) => (
                <Card key={u.id} onPress={() => router.push({ pathname: '/admin/user', params: { id: u.id } })}>
                  <Row gap={space.md}>
                    <UserAvatar user={u} />
                    <View style={{ flex: 1 }}>
                      <Row>
                        <Text style={[text.title, { flexShrink: 1 }]} numberOfLines={1}>
                          {u.name}
                        </Text>
                        {u.role !== 'Admin' && u.admin && <Badge label="Admin" icon="shield-checkmark-outline" fg={colors.primaryDark} bg={colors.primarySoft} />}
                        {!u.active && <Badge label="Inactive" fg={colors.muted} bg={colors.bg} />}
                      </Row>
                      <Text style={text.muted} numberOfLines={1}>
                        {u.email}
                      </Text>
                      <Text style={text.small} numberOfLines={1}>
                        {[u.employeeId && `ID ${u.employeeId}`, [u.territory, u.territoryId && `(${u.territoryId})`].filter(Boolean).join(' '), u.managerId && `reports to ${getUser(u.managerId)?.name ?? '?'}`].filter(Boolean).join(' · ') ||
                          (NEEDS_MANAGER[u.role] ? 'No manager yet' : ' ')}
                      </Text>
                    </View>
                  </Row>
                </Card>
              ))}
            </Grid>
          </View>
        );
      })}
    </Screen>
  );
}
