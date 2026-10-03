import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { api } from '@/data/api';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Card, Empty, Row, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors } from '@/ui/theme';

interface Entry {
  id: number;
  at: string;
  user_id: string;
  type: string;
  summary: string;
  ok: number;
  error?: string;
}

/** Server mode only: the last 500 changes, accepted and refused. */
export default function AuditScreen() {
  const { session, getUser } = useStore();
  const [entries, setEntries] = useState<Entry[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (session?.mode !== 'server') return;
    api.audit(session.serverUrl, session.token).then((r) => setEntries(r.entries as Entry[]), (e) => setError(String(e?.message ?? e)));
  }, [session]);

  if (session?.mode !== 'server') return <Screen><Empty>The audit log is kept on the server. It is not available in demo mode.</Empty></Screen>;
  return (
    <Screen>
      {!!error && <Banner tone="danger">{error}</Banner>}
      {!entries && !error && <ActivityIndicator color={colors.primary} />}
      {entries?.length === 0 && <Empty>No changes yet.</Empty>}
      {entries?.map((e) => (
        <Card key={e.id}>
          <Row>
            <Text style={[text.title, { flex: 1 }]}>{e.summary}</Text>
            <Text style={[text.small, { color: e.ok ? colors.success : colors.danger }]}>{e.ok ? 'Accepted' : 'Refused'}</Text>
          </Row>
          <Text style={text.muted}>
            {formatDateTime(e.at)} · {getUser(e.user_id)?.name ?? e.user_id}
          </Text>
          {!!e.error && <Text style={[text.muted, { color: colors.danger }]}>{e.error}</Text>}
        </Card>
      ))}
    </Screen>
  );
}
