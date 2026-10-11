import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAiAvailable } from '@/ai/client';
import { AI_CONSENT_TEXT, hasAiConsent, setAiConsent } from '@/ai/consent';
import { roleLabel } from '@/data/access';
import { formatDate } from '@/data/dates';
import { useMe, useStore } from '@/data/store';
import { Card, ListRow, Row, SectionTitle, text, ToggleRow } from '@/ui/components';
import { PhotoEditor } from '@/ui/PhotoEditor';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** The signed-in person's own profile: photo, details from the administrator, password. */
export default function ProfileScreen() {
  const me = useMe();
  const { getUser, session, company, admin } = useStore();
  const manager = getUser(me.managerId);
  const ai = useAiAvailable();
  const [aiOk, setAiOk] = useState(false);
  useEffect(() => {
    hasAiConsent().then(setAiOk);
  }, []);
  const rows: [string, string | undefined][] = [
    ['Name', me.name],
    ['Role', roleLabel(me)],
    ['Email', me.email],
    ['User ID', me.employeeId],
    [me.role === 'Rep' ? 'Territory' : me.role === 'FLM' ? 'Team' : me.role === 'SLM' ? 'Region' : 'Department', [me.territory, me.territoryId && `(${me.territoryId})`].filter(Boolean).join(' ') || undefined],
    ['Reports to', manager?.name],
    ['Company', [company.name, session?.companyCode && `code ${session.companyCode}`].filter(Boolean).join(' · ')],
    ['Member since', formatDate(me.createdAt)],
  ];
  return (
    <Screen>
      <Card>
        <PhotoEditor user={me} />
      </Card>
      <SectionTitle>Details</SectionTitle>
      <Card>
        {rows
          .filter(([, v]) => !!v)
          .map(([label, value], i) => (
            <Row key={label} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, alignItems: 'flex-start' }}>
              <Text style={[text.muted, { width: 112 }]}>{label}</Text>
              <Text style={[text.body, { flex: 1 }]} selectable>
                {value}
              </Text>
            </Row>
          ))}
        <Text style={[text.small, { marginTop: space.sm }]}>{admin ? 'Change these in Users & roles.' : 'Your administrator keeps these details up to date.'}</Text>
      </Card>
      {ai && (
        <>
          <SectionTitle>Ava AI</SectionTitle>
          <Card>
            <ToggleRow
              label="Allow Ava AI on this device"
              value={aiOk}
              onChange={(on) => setAiConsent(on).then(() => setAiOk(on))}
              hint={aiOk ? 'Turn off to stop sending anything to Ava AI. You will be asked again the next time you use an Ava AI feature.' : 'You will be asked before anything is sent to Ava AI.'}
            />
            <Text style={[text.small, { marginTop: space.sm }]}>{AI_CONSENT_TEXT}</Text>
          </Card>
        </>
      )}
      <SectionTitle>Security</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListRow icon="key-outline" title="Change password" onPress={() => router.push('/password')} />
        {admin ? (
          <ListRow icon="trash-outline" title="Delete my account" subtitle="Remove your sign-in from Ava CRM" tone={colors.danger} onPress={() => router.push('/delete-account')} />
        ) : (
          <ListRow icon="person-remove-outline" title="Delete my account" subtitle="Your administrator manages your account. Ask them to remove you." tone={colors.muted} />
        )}
      </Card>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}
