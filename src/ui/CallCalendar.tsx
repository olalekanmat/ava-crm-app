import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { byDay, calendarState, monthGrid, type CalendarState } from '@/data/calendar';
import { activeCycleLength, cyclesInMonth } from '@/data/cycles';
import { formatDate, timeKey, toDateKey } from '@/data/dates';
import { useStore } from '@/data/store';
import type { Call } from '@/data/types';
import { canMoveCall } from '@/data/calendarPlan';
import { Card, Empty, text } from './components';
import { Draggable, useDropTarget, type DragItem } from './dnd';
import { PlanDoctors, useCalendarDrop } from './PlanDoctors';
import { calendarColors, colors, radius, space } from './theme';

const LABEL: Record<CalendarState, string> = { submitted: 'Submitted', planned: 'Planned', overdue: 'Overdue' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarLegend() {
  return (
    <View style={styles.legend}>
      {(Object.keys(LABEL) as CalendarState[]).map((s) => (
        <View key={s} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { borderColor: calendarColors[s] }]} />
          <Text style={text.small}>{s === 'planned' ? 'Planned, not due' : s === 'overdue' ? 'Planned, overdue' : 'Submitted'}</Text>
        </View>
      ))}
    </View>
  );
}

/** One day of the month grid; with drag and drop on, a call or doctor can be dropped on it. */
function DayCell({ k, onDrop, ...rest }: { k: string; onDrop: (item: DragItem, day: string) => void } & React.ComponentProps<typeof Pressable>) {
  const { ref, over } = useDropTarget(`day:${k}`, (item) => onDrop(item, k));
  return <Pressable ref={ref} {...rest} style={[rest.style as object, over && styles.cellOver]} />;
}

/**
 * Month view of call plans and submitted calls, with the selected day's calls below. With `plan`
 * (a rep), the doctors in the cycle plan sit beside or above the month and can be dragged onto a
 * day, and the rep's own unsubmitted visits can be dragged to another day.
 */
export function CallCalendar({ calls, showRep, plan }: { calls: Call[]; showRep?: boolean; plan?: boolean }) {
  const { getAccount, getUser, data, me } = useStore();
  const { drop, bar } = useCalendarDrop();
  const meId = me?.id ?? '';
  // Wide screens (landscape phones, tablets, computers) show who is being visited inside each day.
  const { width } = useWindowDimensions();
  const roomy = width >= 640;
  const side = !!plan && width >= 1000;
  const maxNames = width >= 1000 ? 4 : 3;
  const today = toDateKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const days = useMemo(() => byDay(calls), [calls]);
  const weeks = monthGrid(cursor.y, cursor.m);
  const monthKey = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const title = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (d: number) => setCursor(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  const day = days.get(selected);
  // The planning cycle(s) this month belongs to (quarterly or monthly, as the company plans).
  const cycleNote = cyclesInMonth(data.cycles, activeCycleLength(data.settings), cursor.y, cursor.m)
    .map((c) => `${c.name} · ${formatDate(c.start)} – ${formatDate(c.end)}`)
    .join('   ');

  const month = (
    <View style={side ? { flex: 1 } : undefined}>
      {plan && !side && <PlanDoctors day={selected} layout="strip" />}
      <Card style={{ padding: space.sm }}>
        <View style={styles.header}>
          <Pressable onPress={() => shift(-1)} accessibilityLabel="Previous month" hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => {
              const d = new Date();
              setCursor({ y: d.getFullYear(), m: d.getMonth() });
              setSelected(today);
            }}
          >
            <Text style={text.title}>{title}</Text>
          </Pressable>
          <Pressable onPress={() => shift(1)} accessibilityLabel="Next month" hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>
        {!!cycleNote && <Text style={[text.small, { textAlign: 'center', marginBottom: space.xs }]}>{cycleNote}</Text>}
        <View style={styles.week}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={[text.small, styles.weekday]}>
              {w}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]} style={styles.week}>
            {week.map((k) => {
              const d = days.get(k);
              const edge = d ? (d.overdue ? calendarColors.overdue : d.planned ? calendarColors.planned : calendarColors.submitted) : undefined;
              const inMonth = k.startsWith(monthKey);
              const isSel = k === selected;
              return (
                <DayCell
                  key={k}
                  k={k}
                  onDrop={(item, day) => {
                    drop(item, day);
                    setSelected(day);
                  }}
                  onPress={() => setSelected(k)}
                  style={[styles.cell, roomy && styles.cellRoomy, edge && { borderColor: edge, borderWidth: 2 }, isSel && styles.cellSelected]}
                  accessibilityLabel={`${k}${d ? `: ${d.submitted} submitted, ${d.planned} planned, ${d.overdue} overdue` : ''}`}
                >
                  <Text style={[styles.dayNum, !inMonth && { color: colors.faint }, k === today && styles.today]}>{Number(k.slice(8))}</Text>
                  {d && roomy && (
                    <View style={styles.names}>
                      {d.calls.slice(0, maxNames).map((c) => {
                        const st = calendarState(c);
                        const name = getAccount(c.accountId)?.name ?? 'Account';
                        return (
                          <Draggable key={c.id} item={{ kind: 'call', call: c }} label={name} disabled={!plan || !canMoveCall(c, meId)} onTap={() => setSelected(k)}>
                            <Text numberOfLines={1} style={[styles.name, { borderLeftColor: calendarColors[st], color: colors.text }]}>
                              {name}
                              {showRep ? ` · ${(getUser(c.ownerId)?.name ?? '').split(' ')[0]}` : ''}
                            </Text>
                          </Draggable>
                        );
                      })}
                      {d.calls.length > maxNames && <Text style={[text.small, { fontSize: 10 }]}>+{d.calls.length - maxNames} more</Text>}
                    </View>
                  )}
                  {d && !roomy && (
                    <View style={styles.dots}>
                      {(['submitted', 'planned', 'overdue'] as const).map((s) =>
                        d[s] ? (
                          <View key={s} style={[styles.count, { backgroundColor: calendarColors[s] }]}>
                            <Text style={styles.countText}>{d[s]}</Text>
                          </View>
                        ) : null,
                      )}
                    </View>
                  )}
                </DayCell>
              );
            })}
          </View>
        ))}
        <CalendarLegend />
      </Card>
      {bar}

      <Text style={[text.title, { marginTop: space.md, marginBottom: space.sm }]}>
        {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>
      {!day && <Empty icon="calendar-clear-outline">No calls planned or submitted on this day.</Empty>}
      {day?.calls.map((c) => {
        const s = calendarState(c);
        return (
          <Draggable key={c.id} item={{ kind: 'call', call: c }} label={getAccount(c.accountId)?.name ?? 'Visit'} disabled={!plan || !canMoveCall(c, meId)}>
            <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id: c.id } })} style={({ pressed }) => [styles.item, { borderLeftColor: calendarColors[s] }, pressed && { opacity: 0.7 }]}>
            <Text style={[text.title, { width: 52 }]}>{timeKey(new Date(c.datetime))}</Text>
            <View style={{ flex: 1 }}>
              <Text style={text.title} numberOfLines={1}>
                {getAccount(c.accountId)?.name ?? 'Account'}
              </Text>
              <Text style={text.muted} numberOfLines={1}>
                {c.channel}
                {showRep ? ` · ${getUser(c.ownerId)?.name ?? ''}` : ''}
                {c.status === 'Saved' ? ' · draft' : ''}
              </Text>
            </View>
            <Text style={[styles.state, { color: calendarColors[s], borderColor: calendarColors[s] }]}>{LABEL[s]}</Text>
            </Pressable>
          </Draggable>
        );
      })}
    </View>
  );

  if (!side) return month;
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <View style={{ height: 640 }}>
        <PlanDoctors day={selected} layout="side" />
      </View>
      {month}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.sm },
  week: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, minHeight: 52, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 3, alignItems: 'center', backgroundColor: colors.card },
  cellSelected: { backgroundColor: colors.primarySoft },
  cellOver: { borderColor: colors.primary, borderWidth: 2, borderStyle: 'dashed', backgroundColor: colors.primarySoft },
  cellRoomy: { minHeight: 92, alignItems: 'stretch', padding: 4 },
  names: { gap: 2, marginTop: 3, width: '100%' },
  name: { fontSize: 10, lineHeight: 13, borderLeftWidth: 3, paddingLeft: 3, backgroundColor: colors.bg, borderRadius: 2, overflow: 'hidden' },
  dayNum: { fontSize: 13, fontWeight: '600', color: colors.text },
  today: { color: '#fff', backgroundColor: colors.primary, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 5 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 2, marginTop: 3 },
  count: { minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  countText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.sm, paddingTop: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 2, backgroundColor: colors.card },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, padding: space.md, marginBottom: space.sm },
  state: { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
