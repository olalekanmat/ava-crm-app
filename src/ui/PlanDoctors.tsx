import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { droppedCall, movedDatetime, planDoctors, type PlanDoctor } from '@/data/calendarPlan';
import { formatDateTime } from '@/data/dates';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import type { Call } from '@/data/types';
import { Chip, PlanBadge, SearchBox, TierBadge, text } from './components';
import { notify } from './confirm';
import { Draggable, useDnd, type DragItem } from './dnd';
import { colors, radius, space } from './theme';

const HINT = Platform.OS === 'web' ? 'Drag a doctor onto a day to plan a visit, or drag a visit to move it.' : 'Hold a doctor, then drag onto a day to plan a visit. Hold a visit to move it.';

/** What a drop did, so it can be undone. */
interface Done {
  message: string;
  undo: () => void;
}

/**
 * 2.15: handles drops on the calendar. A call moves to the day (and hour, in the week view);
 * a doctor gets a planned visit there. Returns the drop handler and a bar with Undo.
 */
export function useCalendarDrop() {
  const me = useMe();
  const { run, getAccount } = useStore();
  const [last, setLast] = useState<Done | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (d: Done) => {
    setLast(d);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLast(null), 8000);
  };
  const attempt = (f: () => void) => {
    try {
      f();
      return true;
    } catch (e) {
      notify('Could not change the calendar', e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const when = (iso: string) => formatDateTime(iso);

  const drop = (item: DragItem, day: string, hour?: number) => {
    if (item.kind === 'call') {
      const old: Call = item.call;
      const datetime = movedDatetime(old.datetime, day, hour);
      if (datetime === old.datetime) return;
      const name = getAccount(old.accountId)?.name ?? 'Visit';
      if (attempt(() => run({ type: 'call.save', call: { ...old, datetime } })))
        show({
          message: `${name} moved to ${when(datetime)}`,
          undo: () =>
            attempt(() =>
              run({
                type: 'call.save',
                call: { ...old, updatedAt: new Date().toISOString() },
              }),
            ),
        });
      return;
    }
    const call = droppedCall(newId('call'), item.accountId, me.id, day, hour ?? 9);
    const name = getAccount(item.accountId)?.name ?? 'Visit';
    if (attempt(() => run({ type: 'call.save', call })))
      show({
        message: `Visit to ${name} planned for ${when(call.datetime)}`,
        undo: () => attempt(() => run({ type: 'call.delete', id: call.id })),
      });
  };

  const bar = last ? (
    <View style={styles.toast}>
      <Text style={styles.toastText} numberOfLines={2}>
        {last.message}
      </Text>
      <Pressable
        onPress={() => {
          last.undo();
          setLast(null);
        }}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Text style={styles.undo}>Undo</Text>
      </Pressable>
    </View>
  ) : null;
  return { drop, bar };
}

function Badge({ d }: { d: PlanDoctor }) {
  const label = !d.inPlan ? 'Not in plan' : d.left ? `${d.left} to plan` : d.done >= d.planned ? 'Done' : 'All planned';
  const tone = !d.inPlan ? colors.muted : d.left ? colors.primary : colors.success;
  return <Text style={[styles.badge, { color: tone, borderColor: tone }]}>{label}</Text>;
}

/**
 * 2.15: the doctors in the rep's cycle plan beside (or above) the calendar, each with the visits
 * still to put in the calendar. Drag one onto a day to plan a visit; tap one to plan it in full.
 */
export function PlanDoctors({ day, layout }: { day: string; layout: 'side' | 'strip' }) {
  const me = useMe();
  const { data } = useStore();
  const dnd = useDnd();
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const first = planDoctors(data, me.id, day, all);
  // Without a plan for this period, list every account so visits can still be dragged in.
  const { cycle, plan, doctors } = first.plan ? first : planDoctors(data, me.id, day, true);
  const showAll = all || !plan;
  const needle = q.trim().toLowerCase();
  const list = doctors.filter((d) => !needle || d.account.name.toLowerCase().includes(needle) || (d.account.specialty ?? '').toLowerCase().includes(needle));
  const toPlan = doctors.filter((d) => d.inPlan).reduce((n, d) => n + d.left, 0);
  const open = (d: PlanDoctor) =>
    router.push({
      pathname: '/call/edit',
      params: { accountId: d.account.id, plan: '1', date: day },
    });

  const header = (
    <View style={{ marginBottom: space.sm }}>
      <View style={styles.headRow}>
        <Text style={[text.title, { flex: 1 }]} numberOfLines={1}>
          {cycle ? `${cycle.name} plan` : 'Doctors'}
        </Text>
        <PlanBadge status={plan?.status ?? 'None'} />
      </View>
      <Text style={text.small}>
        {plan
          ? `${plan.targets.length} doctors · ${toPlan} visit${toPlan === 1 ? '' : 's'} still to put in the calendar`
          : 'No cycle plan for this period yet, so all your accounts are listed. Make one on the Plan tab.'}
      </Text>
      <Text style={[text.small, { marginTop: 2 }]}>{HINT}</Text>
      <View style={[styles.headRow, { marginTop: space.xs }]}>
        {plan && <Chip label="In plan" selected={!showAll} onPress={() => setAll(false)} />}
        {plan && <Chip label="All accounts" selected={showAll} onPress={() => setAll(true)} />}
      </View>
    </View>
  );

  if (layout === 'strip') {
    return (
      <View style={styles.stripWrap}>
        {header}
        <ScrollView horizontal scrollEnabled={!dnd?.holding} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: 2 }}>
          {list.map((d) => (
            <Draggable key={d.account.id} item={{ kind: 'account', accountId: d.account.id }} label={d.account.name}>
              <Pressable onPress={() => open(d)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]} accessibilityHint="Hold and drag onto a day to plan a visit">
                <Text style={[text.title, { fontSize: 13 }]} numberOfLines={1}>
                  {d.account.name}
                </Text>
                <Badge d={d} />
              </Pressable>
            </Draggable>
          ))}
          {!list.length && <Text style={text.muted}>No accounts to show.</Text>}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.side}>
      {header}
      <SearchBox value={q} onChangeText={setQ} placeholder="Find a doctor" />
      <ScrollView style={{ flex: 1 }} scrollEnabled={!dnd?.holding}>
        {list.map((d) => (
          <Draggable key={d.account.id} item={{ kind: 'account', accountId: d.account.id }} label={d.account.name}>
            <Pressable onPress={() => open(d)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[text.title, { fontSize: 14 }]} numberOfLines={1}>
                  {d.account.name}
                </Text>
                <Text style={text.small} numberOfLines={1}>
                  {d.account.specialty}
                  {d.inPlan ? ` · ${d.done} of ${d.planned} done${d.scheduled ? `, ${d.scheduled} booked` : ''}` : ''}
                </Text>
              </View>
              <TierBadge tier={d.account.tier} />
              <Badge d={d} />
            </Pressable>
          </Draggable>
        ))}
        {!list.length && <Text style={text.muted}>No accounts match.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  side: {
    width: 320,
    padding: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stripWrap: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  chip: {
    width: 150,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.sm,
  },
  toastText: { flex: 1, color: colors.card, fontSize: 13 },
  undo: { color: '#8FB4FF', fontWeight: '800', fontSize: 14 },
});
