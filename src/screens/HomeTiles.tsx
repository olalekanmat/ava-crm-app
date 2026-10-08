import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AskAvaBar } from '@/ai/AskAvaBar';
import type { Pace } from '@/data/alerts';
import { calendarState } from '@/data/calendar';
import { formatDateTime } from '@/data/dates';
import { cycleElapsed, daysLeft, pct } from '@/data/metrics';
import { useStore } from '@/data/store';
import type { Call, Cycle } from '@/data/types';
import { CompanyLogo, Hero, heroText } from '@/ui/Brand';
import { Button, Card, text, type IconName } from '@/ui/components';
import { useLayout } from '@/ui/layout';
import { LegendRow, Ring, StatSplit, Tile } from '@/ui/Tiles';
import { openAlert } from '@/ui/AlertsSheet';
import { calendarColors, colors, paceColor, space, tone } from '@/ui/theme';
import { useAlerts } from '@/ui/useAlerts';

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Top of every home: date, greeting, a one-line summary, the assistant bar and quick actions. */
export function HomeHeader({ eyebrow, title, summary, actions }: { eyebrow: string; title: string; summary?: string; actions?: ReactNode }) {
  const { compact } = useLayout();
  if (compact) {
    // A phone on its side: one slim band, so the tiles stay in view.
    return (
      <Hero slim>
        <View style={styles.slimRow}>
          <View style={{ maxWidth: 260 }}>
            <Text style={heroText.eyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
            <Text style={[heroText.title, { fontSize: 20 }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <AskAvaBar />
          </View>
        </View>
      </Hero>
    );
  }
  return (
    <Hero>
      <View style={styles.heroTop}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={heroText.eyebrow}>{eyebrow}</Text>
          <Text style={heroText.title}>{title}</Text>
          {!!summary && <Text style={heroText.body}>{summary}</Text>}
        </View>
        {actions && <View style={styles.heroActions}>{actions}</View>}
      </View>
      <View style={{ marginTop: space.lg }}>
        <AskAvaBar />
      </View>
    </Hero>
  );
}

/** Light button for use on the blue hero. */
export function HeroButton({ title, icon, onPress }: { title: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={17} color="#fff" />
      <Text style={styles.heroBtnText}>{title}</Text>
    </Pressable>
  );
}

/** The company's logo and name, with the cycle under way. */
export function CompanyTile({ cycle }: { cycle?: Cycle }) {
  const { company } = useStore();
  return (
    <Card style={styles.company}>
      <CompanyLogo size={56} />
      <Text style={[text.h2, { marginTop: space.md, textAlign: 'center' }]} numberOfLines={2}>
        {company.name || 'Ava CRM'}
      </Text>
      {cycle && (
        <Text style={[text.muted, { textAlign: 'center' }]}>
          {cycle.name} · {daysLeft(cycle)} days left
        </Text>
      )}
    </Card>
  );
}

/** My alerts: overdue planned visits and drafts past 24 hours (urgent), plans sent back or to review (important), drafts (normal). */
export function AlertsTile() {
  const { alerts } = useAlerts();
  const first = alerts.items[0];
  return (
    <Tile title="My alerts" icon="notifications-outline" alert={alerts.urgent > 0} onPress={first ? () => openAlert(first) : undefined}>
      <StatSplit
        items={[
          { value: alerts.urgent, label: 'Urgent', color: alerts.urgent ? tone.urgent : colors.faint },
          { value: alerts.important, label: 'Important', color: alerts.important ? tone.important : colors.faint },
          { value: alerts.normal, label: 'Normal', color: alerts.normal ? tone.normal : colors.faint },
        ]}
      />
      <Text style={[text.small, styles.foot]} numberOfLines={1}>
        {first ? first.title : 'All clear. Record calls within 24 hours of the visit.'}
      </Text>
    </Tile>
  );
}

/** My tasks: follow-ups promised in calls, overdue and due this week. */
export function TasksTile() {
  const { tasks } = useAlerts();
  const { getAccount } = useStore();
  const next = tasks.overdue[0] ?? tasks.current[0];
  return (
    <Tile title="My tasks" icon="checkbox-outline" alert={tasks.overdue.length > 0} onPress={next ? () => router.push({ pathname: '/account/[id]', params: { id: next.call.accountId } }) : undefined}>
      <StatSplit
        items={[
          { value: tasks.overdue.length, label: 'Overdue', color: tasks.overdue.length ? tone.urgent : colors.faint },
          { value: tasks.current.length, label: 'Due this week', color: tasks.current.length ? tone.normal : colors.faint },
        ]}
      />
      <Text style={[text.small, styles.foot]} numberOfLines={1}>
        {next ? `Follow up ${getAccount(next.call.accountId)?.name ?? ''} · ${next.due}` : 'No open follow-ups.'}
      </Text>
    </Tile>
  );
}

const PACE: Record<Pace, { label: string; color: string }> = {
  onTrack: { label: 'On track', color: tone.good },
  atRisk: { label: 'At risk', color: tone.important },
  behind: { label: 'Behind', color: tone.urgent },
};

/** Cycle plan ring: done against plan, coloured by pace, with how many accounts (or reps) are on track. */
export function CyclePlanTile({ cycle, attainment, planned, health, unit, onPress, empty }: { cycle: Cycle; attainment: number; planned: number; health: Record<Pace, number>; unit: string; onPress: () => void; empty?: string }) {
  const elapsed = cycleElapsed(cycle);
  const c = paceColor(attainment, elapsed);
  return (
    <Tile title={`${cycle.name} plan`} icon="flag-outline" onPress={onPress} alert={health.behind > 0}>
      {planned ? (
        <View style={styles.ringRow}>
          <Ring value={attainment} color={c} size={104} stroke={11}>
            <Text style={[styles.ringValue, { color: c }]}>{pct(attainment)}</Text>
            <Text style={text.small}>done</Text>
          </Ring>
          <View style={{ flex: 1 }}>
            {(Object.keys(PACE) as Pace[]).map((k) => (
              <LegendRow key={k} color={PACE[k].color} label={PACE[k].label} value={health[k]} />
            ))}
            <Text style={[text.small, { marginTop: 4 }]}>
              {unit} · {pct(elapsed)} of cycle gone
            </Text>
          </View>
        </View>
      ) : (
        <Text style={text.body}>{empty ?? `No plan for ${cycle.name} yet.`}</Text>
      )}
    </Tile>
  );
}

const ago = (iso?: string) => {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : formatDateTime(iso);
};

/** Sync status ring: green when everything is saved, orange with changes waiting, amber when offline. */
export function SyncTile() {
  const { sync, syncNow, signOut } = useStore();
  const waiting = sync.pending > 0;
  const problem = !!sync.error;
  const c = problem ? colors.warn : waiting ? colors.orange : tone.good;
  const icon: IconName = sync.syncing ? 'sync' : problem ? 'cloud-offline' : waiting ? 'cloud-upload' : 'checkmark';
  return (
    <Tile
      title="Sync status"
      icon="cloud-outline"
      action={
        sync.needsSignIn ? (
          <Button small variant="secondary" title="Sign in" onPress={signOut} />
        ) : Platform.OS === 'web' && !problem && !waiting ? null : (
          <Pressable onPress={() => syncNow(true)} disabled={sync.syncing} hitSlop={10} accessibilityRole="button">
            <Text style={text.link}>{sync.syncing ? 'Syncing…' : 'Sync'}</Text>
          </Pressable>
        )
      }
    >
      <View style={styles.ringRow}>
        <Ring value={1} color={c} size={84} stroke={8}>
          <Ionicons name={icon} size={30} color={c} />
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={text.title}>{problem ? 'Offline' : waiting ? 'Changes waiting' : 'Up to date'}</Text>
          <Text style={text.muted}>Last sync {ago(sync.lastSync)}</Text>
          <Text style={[text.muted, waiting && { color: colors.orange, fontWeight: '600' }]}>
            {waiting ? `${sync.pending} pending change${sync.pending > 1 ? 's' : ''}` : 'No pending changes'}
          </Text>
          {problem && (
            <Text style={text.small} numberOfLines={2}>
              {sync.error}
            </Text>
          )}
        </View>
      </View>
    </Tile>
  );
}

/** Today's schedule: the day's calls in time order with a status dot. */
export function ScheduleTile({ calls, showRep }: { calls: Call[]; showRep?: boolean }) {
  const { getAccount, getUser } = useStore();
  const shown = calls.slice(0, 4);
  return (
    <Tile title="Today's schedule" icon="calendar-outline" onPress={() => router.navigate('/calls')}>
      {shown.length ? (
        <View style={{ gap: 2 }}>
          {shown.map((c) => {
            const st = calendarState(c);
            return (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/call/[id]', params: { id: c.id } })} style={({ pressed }) => [styles.schedRow, pressed && { opacity: 0.6 }]}>
                <Text style={styles.schedTime}>{new Date(c.datetime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
                <View style={[styles.schedDot, { backgroundColor: calendarColors[st] }]} />
                <Text style={[text.title, { flex: 1, fontSize: 14 }]} numberOfLines={1}>
                  {getAccount(c.accountId)?.name ?? 'Account'}
                  {showRep ? <Text style={text.muted}> · {(getUser(c.ownerId)?.name ?? '').split(' ')[0]}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
          {calls.length > shown.length && <Text style={[text.small, { marginTop: 2 }]}>+{calls.length - shown.length} more</Text>}
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Ionicons name="sunny-outline" size={26} color={colors.faint} />
          <Text style={text.muted}>No visits scheduled today.</Text>
        </View>
      )}
    </Tile>
  );
}

/** Shortcuts for the things done most. */
export function QuickActionsTile({ actions }: { actions: { title: string; icon: IconName; onPress: () => void }[] }) {
  return (
    <Tile title="Quick actions" icon="flash-outline">
      <View style={styles.quick}>
        {actions.map((a) => (
          <Pressable key={a.title} accessibilityRole="button" onPress={a.onPress} style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.7 }]}>
            <View style={styles.quickIcon}>
              <Ionicons name={a.icon} size={20} color={colors.primary} />
            </View>
            <Text style={[text.small, { color: colors.text, fontWeight: '600', textAlign: 'center' }]} numberOfLines={2}>
              {a.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </Tile>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: space.md },
  quickItem: { width: 84, alignItems: 'center', gap: 6 },
  quickIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  slimRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.md },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  heroBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  company: { flexGrow: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center' },
  foot: { marginTop: space.md, textAlign: 'center' },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  ringValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  schedTime: { minWidth: 64, fontSize: 13, fontWeight: '700', color: colors.muted, fontVariant: ['tabular-nums'] },
  schedDot: { width: 8, height: 8, borderRadius: 4 },
});
