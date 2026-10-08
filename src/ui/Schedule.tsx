import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { calendarState } from '@/data/calendar';
import { addDays, toDateKey } from '@/data/dates';
import { agenda, hourOf, hourRange, weekKeys, weekStart } from '@/data/schedule';
import { useStore } from '@/data/store';
import type { Call } from '@/data/types';
import { CallPopover, STATE_LABEL } from './CallPopover';
import { CalendarLegend } from './CallCalendar';
import { Empty, IconButton, SearchBox, TierBadge, text } from './components';
import { calendarColors, colors, radius, shadow, space } from './theme';

const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, opts);
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const hourLabel = (h: number, short?: boolean) => (short ? `${h % 12 || 12}${h < 12 || h === 24 ? 'a' : 'p'}` : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }));

/** Ticks once a minute so the now-line moves. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Side-by-side lanes for calls that overlap in time on one day (each call shown for 45 minutes).
 * Calls that overlap nothing keep the full column width.
 */
function lanes(calls: Call[]): { call: Call; lane: number; of: number }[] {
  const LEN = 0.75;
  const out: { call: Call; lane: number; of: number }[] = [];
  let cluster: { call: Call; lane: number }[] = [];
  let ends: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const p of cluster) out.push({ ...p, of: Math.max(1, ends.length) });
    cluster = [];
    ends = [];
  };
  for (const call of calls) {
    const start = hourOf(call.datetime);
    if (start >= clusterEnd) flush();
    let lane = ends.findIndex((e) => e <= start);
    if (lane < 0) lane = ends.length;
    ends[lane] = start + LEN;
    clusterEnd = Math.max(clusterEnd, start + LEN);
    cluster.push({ call, lane });
  }
  flush();
  return out;
}

/**
 * Week schedule: 7 day columns with hourly slots, day headers with call counts, today tinted and a
 * line at the current time. Tapping a call opens its card. On wide screens `panel` shows the
 * rep's accounts beside the week, to start planning a visit.
 */
export function WeekView({ calls, showRep, panel }: { calls: Call[]; showRep?: boolean; panel?: boolean }) {
  const { getAccount, getUser } = useStore();
  const now = useNow();
  const [monday, setMonday] = useState(() => weekStart(new Date()));
  const [open, setOpen] = useState<Call | null>(null);
  const [width, setWidth] = useState(0);
  const keys = weekKeys(monday);
  const today = toDateKey(now);
  const inWeek = useMemo(() => calls.filter((c) => {
    const k = toDateKey(new Date(c.datetime));
    return k >= keys[0] && k <= keys[6];
  }), [calls, keys[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => {
    const m = new Map<string, Call[]>();
    for (const c of [...inWeek].sort((a, b) => a.datetime.localeCompare(b.datetime))) {
      const k = toDateKey(new Date(c.datetime));
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [inWeek]);
  const [from, to] = hourRange(inWeek);
  const HOUR = width < 500 ? 48 : 56;
  const GUTTER = width < 500 ? 30 : 52;
  const colW = width ? (width - GUTTER) / 7 : 0;
  const narrow = colW < 70;
  const range = `${dayLabel(keys[0], { day: 'numeric', month: 'short' })} – ${dayLabel(keys[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const nowH = now.getHours() + now.getMinutes() / 60;
  const todayIdx = keys.indexOf(today);

  const grid = (
    <View style={[styles.weekCard, { flex: 1 }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.weekBar}>
        <IconButton icon="chevron-back" label="Previous week" size={34} onPress={() => setMonday(addDays(monday, -7))} />
        <Text style={[text.title, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>
          {range}
        </Text>
        {todayIdx < 0 && (
          <Pressable onPress={() => setMonday(weekStart(new Date()))} style={styles.todayBtn} accessibilityRole="button">
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
        )}
        <IconButton icon="chevron-forward" label="Next week" size={34} onPress={() => setMonday(addDays(monday, 7))} />
      </View>
      <View style={[styles.dayHeads, { paddingLeft: GUTTER }]}>
        {keys.map((k) => {
          const n = byDay.get(k)?.length ?? 0;
          const isToday = k === today;
          return (
            <View key={k} style={styles.dayHead}>
              <Text style={[styles.dow, isToday && { color: colors.primary }]}>{dayLabel(k, { weekday: narrow ? 'narrow' : 'short' })}</Text>
              <View style={[styles.dateNum, isToday && styles.dateNumToday]}>
                <Text style={[styles.dateText, isToday && { color: '#fff' }]}>{Number(k.slice(8))}</Text>
              </View>
              <Text style={[styles.count, n > 0 && { color: colors.primary }]}>{n ? `${n} call${n > 1 && !narrow ? 's' : ''}` : '–'}</Text>
            </View>
          );
        })}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 10, paddingBottom: space.md }}>
        <View style={{ height: (to - from) * HOUR + 8, flexDirection: 'row' }}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: to - from + 1 }, (_, i) => (
              <Text key={i} style={[styles.hour, { top: i * HOUR - 6 }]}>
                {hourLabel(from + i, narrow)}
              </Text>
            ))}
          </View>
          {keys.map((k, d) => (
            <View key={k} style={[styles.col, k === today && styles.colToday, d === 0 && { borderLeftWidth: 1 }]}>
              {Array.from({ length: to - from }, (_, i) => (
                <View key={i} style={[styles.slot, { top: i * HOUR, height: HOUR }]} />
              ))}
              {lanes(byDay.get(k) ?? []).map(({ call, lane, of }) => {
                const st = calendarState(call, now);
                const top = (hourOf(call.datetime) - from) * HOUR;
                const name = getAccount(call.accountId)?.name ?? 'Account';
                return (
                  <Pressable
                    key={call.id}
                    onPress={() => setOpen(call)}
                    accessibilityLabel={`${name}, ${timeLabel(call.datetime)}, ${STATE_LABEL[st]}`}
                    style={({ pressed }) => [
                      styles.event,
                      { top: top + 1, height: HOUR * 0.75 - 2, left: `${(lane / of) * 100}%`, width: `${100 / of}%`, borderLeftColor: calendarColors[st], backgroundColor: `${calendarColors[st]}14` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.eventTitle, narrow && { fontSize: 10 }]} numberOfLines={narrow ? 1 : 2}>
                      {narrow ? name.replace(/^Dr\.\s*/, '').split(' ')[0] : name}
                    </Text>
                    <Text style={[styles.eventSub, narrow && { fontSize: 9 }]} numberOfLines={1}>
                      {narrow ? timeLabel(call.datetime).replace(/\s?[AP]M$/i, '') : timeLabel(call.datetime)}
                      {showRep && !narrow ? ` · ${(getUser(call.ownerId)?.name ?? '').split(' ')[0]}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
              {k === today && nowH >= from && nowH <= to && (
                <View pointerEvents="none" style={[styles.nowLine, { top: (nowH - from) * HOUR }]}>
                  <View style={styles.nowDot} />
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
      <CalendarLegend />
      <CallPopover call={open} onClose={() => setOpen(null)} showRep={showRep} />
    </View>
  );

  if (!panel) return grid;
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: space.md }}>
      <AccountsPanel />
      {grid}
    </View>
  );
}

/** Accounts beside the week (wide screens): search, tier, and a button to plan a visit. */
function AccountsPanel() {
  const { accounts } = useStore();
  const [q, setQ] = useState('');
  const list = accounts.filter((a) => !q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={[styles.weekCard, styles.panel]}>
      <Text style={[text.title, { marginBottom: space.sm }]}>Plan a visit</Text>
      <SearchBox value={q} onChangeText={setQ} placeholder="Find an account" />
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        renderItem={({ item: a }) => (
          <View style={styles.panelRow}>
            <View style={{ flex: 1 }}>
              <Text style={[text.title, { fontSize: 14 }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={text.small} numberOfLines={1}>
                {a.specialty}
              </Text>
            </View>
            <TierBadge tier={a.tier} />
            <IconButton icon="calendar-outline" label={`Plan a visit to ${a.name}`} size={34} onPress={() => router.push({ pathname: '/call/edit', params: { accountId: a.id, plan: '1' } })} />
          </View>
        )}
        ListEmptyComponent={<Text style={text.muted}>No accounts match.</Text>}
      />
    </View>
  );
}

/** Upcoming calls grouped by day (this week onwards), with a status bar on each call. */
export function AgendaView({ calls, showRep, header }: { calls: Call[]; showRep?: boolean; header?: ReactElement }) {
  const { getAccount, getUser } = useStore();
  const [open, setOpen] = useState<Call | null>(null);
  const today = toDateKey(new Date());
  const days = useMemo(() => agenda(calls, toDateKey(weekStart(new Date())), 60), [calls]);
  return (
    <>
      <FlatList
        data={days}
        keyExtractor={(d) => d.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xl }}
        ListEmptyComponent={<Empty icon="calendar-clear-outline" title="Nothing on the agenda">Planned visits and calls from this week on show here.</Empty>}
        renderItem={({ item: d }) => {
          const isToday = d.key === today;
          const past = d.key < today;
          return (
            <View style={{ marginBottom: space.md }}>
              <View style={styles.agendaHead}>
                <Text style={[styles.agendaDay, isToday && { color: colors.primary }, past && { color: colors.faint }]}>
                  {isToday ? 'Today · ' : ''}
                  {dayLabel(d.key, { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
                <Text style={text.small}>
                  {d.calls.length} call{d.calls.length > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.agendaCard}>
                {d.calls.map((c, i) => {
                  const st = calendarState(c);
                  const a = getAccount(c.accountId);
                  return (
                    <Pressable key={c.id} onPress={() => setOpen(c)} style={({ pressed }) => [styles.agendaRow, i > 0 && styles.agendaDivider, pressed && { backgroundColor: colors.bg }]}>
                      <Text style={styles.agendaTime}>{timeLabel(c.datetime)}</Text>
                      <View style={[styles.agendaBar, { backgroundColor: calendarColors[st] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={text.title} numberOfLines={1}>
                          {a?.name ?? 'Account'}
                        </Text>
                        <Text style={text.muted} numberOfLines={1}>
                          {[c.channel, a?.affiliation ?? a?.city, showRep ? getUser(c.ownerId)?.name : undefined].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={[styles.state, { color: calendarColors[st], backgroundColor: `${calendarColors[st]}14` }]}>{c.status === 'Saved' ? 'Draft' : STATE_LABEL[st]}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }}
      />
      <CallPopover call={open} onClose={() => setOpen(null)} showRep={showRep} />
    </>
  );
}

const styles = StyleSheet.create({
  weekCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: space.sm, ...shadow },
  weekBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs, paddingBottom: space.sm },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  todayText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  dayHeads: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.sm },
  dayHead: { flex: 1, alignItems: 'center', gap: 2 },
  dow: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateNum: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dateNumToday: { backgroundColor: colors.primary },
  dateText: { fontSize: 16, fontWeight: '700', color: colors.text },
  count: { fontSize: 10, color: colors.faint, fontWeight: '600' },
  hour: { position: 'absolute', right: 6, fontSize: 10, color: colors.faint },
  col: { flex: 1, borderRightWidth: 1, borderColor: colors.hairline, position: 'relative' },
  colToday: { backgroundColor: '#F5F8FF' },
  slot: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.hairline },
  event: { position: 'absolute', borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden' },
  eventTitle: { fontSize: 11, fontWeight: '700', color: colors.text, lineHeight: 13 },
  eventSub: { fontSize: 10, color: colors.muted },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#D92D20', zIndex: 2 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#D92D20' },
  panel: { width: 320, padding: space.md },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  agendaHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.xs, marginBottom: space.sm },
  agendaDay: { fontSize: 15, fontWeight: '700', color: colors.text },
  agendaCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', ...shadow },
  agendaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
  agendaDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  agendaTime: { width: 70, fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  agendaBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  state: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
});
