import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { calendarState } from '@/data/calendar';
import { useStore } from '@/data/store';
import type { Call } from '@/data/types';
import { STATE_LABEL } from './CallPopover';
import { Empty, text } from './components';
import { calendarColors, colors, radius, shadow, space } from './theme';

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase();

/** Months from the newest down to the oldest, so quiet months show as gaps. At most `max`. */
function months(from: string, to: string, max = 12): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  while (out.length < max) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    out.push(k);
    if (k <= to) break;
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** Vertical timeline of an account's activity, grouped by month, newest first. */
export function AccountTimeline({ calls, showRep }: { calls: Call[]; showRep?: boolean }) {
  const { getUser } = useStore();
  if (!calls.length) return <Empty icon="git-commit-outline" title="No activity yet">Calls and planned visits appear here as they happen.</Empty>;
  const sorted = [...calls].sort((a, b) => b.datetime.localeCompare(a.datetime));
  const byMonth = new Map<string, Call[]>();
  for (const c of sorted) byMonth.set(monthKey(c.datetime), [...(byMonth.get(monthKey(c.datetime)) ?? []), c]);
  const keys = months(monthKey(sorted[0].datetime), monthKey(sorted[sorted.length - 1].datetime));
  return (
    <View style={styles.wrap}>
      <View style={styles.spine} />
      {keys.map((k) => {
        const list = byMonth.get(k) ?? [];
        return (
          <View key={k}>
            <View style={styles.monthRow}>
              <View style={[styles.monthDot, list.length > 0 && { backgroundColor: colors.primary, borderColor: colors.primarySoft }]} />
              <Text style={[styles.month, list.length > 0 && { color: colors.primary }]}>{monthLabel(k)}</Text>
            </View>
            {!list.length && <Text style={styles.none}>No activity</Text>}
            {list.map((c) => {
              const st = calendarState(c);
              const d = new Date(c.datetime);
              return (
                <View key={c.id} style={styles.item}>
                  <View style={[styles.node, { backgroundColor: calendarColors[st] }]} />
                  <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id: c.id } })} style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}>
                    <View style={styles.cardHead}>
                      <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
                        {c.status === 'Planned' ? 'Planned visit' : c.status === 'Saved' ? 'Draft call' : `${c.channel} call`}
                      </Text>
                      <Text style={[styles.state, { color: calendarColors[st] }]}>{STATE_LABEL[st]}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.faint} />
                    </View>
                    <Text style={text.muted}>
                      {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {showRep ? ` · ${getUser(c.ownerId)?.name ?? ''}` : ''}
                    </Text>
                    {c.products.length > 0 && (
                      <Text style={[text.small, { marginTop: 4 }]} numberOfLines={1}>
                        {c.products.map((p) => p.product).join(' · ')}
                      </Text>
                    )}
                    {!!c.notes && (
                      <Text style={[text.body, { marginTop: 4, color: colors.muted }]} numberOfLines={2}>
                        {c.notes}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingLeft: 4, paddingBottom: space.md },
  spine: { position: 'absolute', left: 11, top: 8, bottom: 8, width: 2, backgroundColor: colors.border },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, marginBottom: space.sm },
  monthDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 4, borderColor: colors.bg, backgroundColor: colors.faint },
  month: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.muted },
  none: { marginLeft: 28, marginBottom: space.xs, fontSize: 12, color: colors.faint, fontStyle: 'italic' },
  item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.sm },
  node: { width: 10, height: 10, borderRadius: 5, marginLeft: 3, marginTop: 18, marginRight: 15 },
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, padding: space.md, ...shadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  state: { fontSize: 12, fontWeight: '700' },
});
