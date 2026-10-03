import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMe, useStore } from '@/data/store';
import { ROLE_LABEL, ROLES, type Role } from '@/data/types';
import { Avatar, Badge, Button, Card, Empty, Row, SearchBox, SectionTitle, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

export default function UsersScreen() {
  const me = useMe();
  const { data, getUser } = useStore();
  const [q, setQ] = useState('');
  if (me.role !== 'Admin') return <Screen><Empty>Only administrators can manage users.</Empty></Screen>;
  const query = q.trim().toLowerCase();
  const match = data.users.filter((u) => !query || [u.name, u.email, u.territory ?? ''].some((v) => v.toLowerCase().includes(query)));

  return (
    <Screen>
      <Row style={{ marginBottom: space.md }}>
        <View style={{ flex: 1 }}>
          <SearchBox value={q} onChangeText={setQ} placeholder="Search people" />
        </View>
      </Row>
      <Button title="Add user" icon="person-add-outline" onPress={() => router.push('/admin/user')} />
      {ROLES.map((role: Role) => {
        const people = match.filter((u) => u.role === role).sort((a, b) => a.name.localeCompare(b.name));
        if (!people.length) return null;
        return (
          <View key={role}>
            <SectionTitle>
              {ROLE_LABEL[role]}s ({people.length})
            </SectionTitle>
            {people.map((u) => (
              <Card key={u.id} onPress={() => router.push({ pathname: '/admin/user', params: { id: u.id } })}>
                <Row gap={space.md}>
                  <Avatar name={u.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{u.name}</Text>
                    <Text style={text.muted} numberOfLines={1}>
                      {u.email}
                      {u.territory ? ` · ${u.territory}` : ''}
                    </Text>
                    {u.managerId && <Text style={text.small}>Reports to {getUser(u.managerId)?.name}</Text>}
                  </View>
                  {!u.active && <Badge label="Inactive" fg={colors.muted} bg={colors.bg} />}
                </Row>
              </Card>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}
