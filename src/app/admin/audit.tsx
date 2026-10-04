import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Card, Chip, Empty, Row, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors } from '@/ui/theme';

/** Every change in the company's journals, who made it and whether the rules accepted it. */
export default function AuditScreen() {
  const { session, activity, getUser, sync } = useStore();
  const [onlyRefused, setOnlyRefused] = useState(false);
  const shown = useMemo(() => activity.filter((e) => !onlyRefused || e.error).slice(0, 500), [activity, onlyRefused]);

  if (session?.mode !== 'cloud') return <Screen><Empty>The audit log is built from your company’s drive. It is not available in demo mode.</Empty></Screen>;
  return (
    <Screen>
      <Banner>Every change is kept in your company folder, one file per person and device. This list shows the latest 500.</Banner>
      {sync.warnings.map((w) => (
        <Banner key={w} tone="warn">{w}</Banner>
      ))}
      <Row>
        <Chip label="All" selected={!onlyRefused} onPress={() => setOnlyRefused(false)} />
        <Chip label="Refused only" selected={onlyRefused} onPress={() => setOnlyRefused(true)} />
      </Row>
      {shown.length === 0 && <Empty>No changes yet.</Empty>}
      {shown.map((e) => (
        <Card key={`${e.userId}-${e.deviceId}-${e.seq}`}>
          <Row>
            <Text style={[text.title, { flex: 1 }]}>{e.what}</Text>
            <Text style={[text.small, { color: e.error ? colors.danger : colors.success }]}>{e.error ? 'Refused' : 'Applied'}</Text>
          </Row>
          <Text style={text.muted}>
            {formatDateTime(e.at)} · {getUser(e.userId)?.name ?? e.userId}
          </Text>
          {!!e.error && <Text style={[text.muted, { color: colors.danger }]}>{e.error}</Text>}
        </Card>
      ))}
    </Screen>
  );
}
