import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AlertItem, AlertLevel } from '@/data/alerts';
import { formatDateTime } from '@/data/dates';
import { Empty, text, type IconName } from './components';
import { useLayout } from './layout';
import { colors, radius, shadowRaised, space, tone } from './theme';
import { useAlerts } from './useAlerts';

const LEVEL: Record<AlertLevel, { color: string; label: string }> = {
  urgent: { color: tone.urgent, label: 'Urgent' },
  important: { color: tone.important, label: 'Important' },
  normal: { color: tone.normal, label: 'Normal' },
};
const ICON: Record<AlertItem['kind'], IconName> = {
  overdue: 'time-outline',
  'draft-late': 'alert-circle-outline',
  draft: 'create-outline',
  'plan-returned': 'arrow-undo-outline',
  'plan-review': 'checkmark-done-outline',
  'leave-review': 'airplane-outline',
  'leave-decided': 'airplane-outline',
};

/** Where an alert leads. */
export function openAlert(a: AlertItem) {
  if (a.callId) router.push({ pathname: '/call/[id]', params: { id: a.callId } });
  else if (a.kind === 'plan-review' && a.planId) router.push({ pathname: '/plan/[id]', params: { id: a.planId } });
  else if (a.kind === 'leave-review' || a.kind === 'leave-decided') router.push('/leave');
  else router.navigate('/plan');
}

/** The header bell's list: everything that needs attention, most urgent first. */
export function AlertsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { alerts } = useAlerts();
  const { width } = useLayout();
  const wide = width >= 640;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, wide ? styles.scrimWide : styles.scrimPhone]} onPress={onClose} accessibilityLabel="Close alerts">
        <Pressable style={[styles.card, wide ? { width: 400 } : { width: '100%' }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={[text.h2, { flex: 1 }]}>My alerts</Text>
            {(['urgent', 'important', 'normal'] as const).map((l) =>
              alerts[l] ? (
                <View key={l} style={[styles.pill, { backgroundColor: `${LEVEL[l].color}16` }]}>
                  <Text style={[styles.pillText, { color: LEVEL[l].color }]}>
                    {alerts[l]} {LEVEL[l].label.toLowerCase()}
                  </Text>
                </View>
              ) : null,
            )}
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            {alerts.items.length === 0 && <Empty icon="checkmark-done-outline" title="All clear">Nothing needs your attention right now.</Empty>}
            {alerts.items.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => {
                  onClose();
                  openAlert(a);
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bg }]}
              >
                <View style={[styles.icon, { backgroundColor: `${LEVEL[a.level].color}14` }]}>
                  <Ionicons name={ICON[a.kind]} size={18} color={LEVEL[a.level].color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={text.title} numberOfLines={2}>
                    {a.title}
                  </Text>
                  <Text style={text.small}>{formatDateTime(a.at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.faint} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(11, 21, 38, 0.28)' },
  scrimWide: { alignItems: 'flex-end', paddingTop: 60, paddingRight: space.lg },
  scrimPhone: { justifyContent: 'flex-start', paddingTop: 56, paddingHorizontal: space.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: space.sm, ...shadowRaised },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
