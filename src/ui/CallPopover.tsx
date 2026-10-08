import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { calendarState, type CalendarState } from '@/data/calendar';
import { useStore } from '@/data/store';
import type { Call } from '@/data/types';
import { Button, TierBadge, text } from './components';
import { useLayout } from './layout';
import { calendarColors, colors, radius, shadowRaised, space } from './theme';

export const STATE_LABEL: Record<CalendarState, string> = { submitted: 'Submitted', planned: 'Planned', overdue: 'Overdue' };

/**
 * Compact card for a call tapped in the schedule: account, time, status and the two next steps.
 * A centred card on wide screens, a bottom sheet on a phone held upright.
 */
export function CallPopover({ call, onClose, showRep }: { call: Call | null; onClose: () => void; showRep?: boolean }) {
  const { getAccount, getUser } = useStore();
  const { width, landscape } = useLayout();
  const sheet = width < 600 && !landscape;
  if (!call) return null;
  const account = getAccount(call.accountId);
  const st = calendarState(call);
  const d = new Date(call.datetime);
  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  return (
    <Modal transparent animationType={sheet ? 'slide' : 'fade'} visible onRequestClose={onClose}>
      <Pressable style={[styles.scrim, sheet ? styles.scrimSheet : styles.scrimCenter]} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.card, sheet ? styles.sheet : styles.pop]} onPress={() => {}}>
          {sheet && <View style={styles.grabber} />}
          <View style={styles.head}>
            <Text style={[text.small, { flex: 1, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 }]}>{call.status === 'Planned' ? 'Planned visit' : call.status === 'Saved' ? 'Draft call' : 'Call report'}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={[text.h2, { flex: 1 }]} numberOfLines={2}>
              {account?.name ?? 'Account'}
            </Text>
            {account && <TierBadge tier={account.tier} />}
          </View>
          {!!account && (
            <Text style={text.muted} numberOfLines={1}>
              {[account.specialty, account.affiliation ?? account.city].filter(Boolean).join(' · ')}
            </Text>
          )}
          <View style={styles.rows}>
            <Line icon="calendar-outline">{d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Line>
            <Line icon="time-outline">
              {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {call.channel}
            </Line>
            <View style={styles.line}>
              <View style={[styles.dot, { backgroundColor: calendarColors[st] }]} />
              <Text style={[text.body, { color: calendarColors[st], fontWeight: '600' }]}>
                {STATE_LABEL[st]}
                {call.status === 'Saved' ? ' · draft not submitted' : ''}
              </Text>
            </View>
            {showRep && <Line icon="person-outline">{getUser(call.ownerId)?.name ?? ''}</Line>}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Open call" icon="document-text-outline" onPress={() => go(() => router.push({ pathname: '/call/[id]', params: { id: call.id } }))} />
            <Button title="View account" icon="person-circle-outline" variant="secondary" onPress={() => go(() => router.push({ pathname: '/account/[id]', params: { id: call.accountId } }))} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Line({ icon, children }: { icon: ComponentProps<typeof Ionicons>['name']; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={text.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(11, 21, 38, 0.32)' },
  scrimCenter: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  scrimSheet: { justifyContent: 'flex-end' },
  card: { backgroundColor: colors.card, padding: space.lg, gap: space.sm, ...shadowRaised },
  pop: { width: '100%', maxWidth: 400, borderRadius: radius.lg },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: space.xl },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.xs },
  head: { flexDirection: 'row', alignItems: 'center' },
  rows: { gap: 8, paddingVertical: space.sm, marginVertical: space.xs, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 3 },
});
