import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { formatDate } from '@/data/dates';
import { hasLocation } from '@/data/geo';
import { visitStatus } from '@/data/mapData';
import { useMe, useStore } from '@/data/store';
import { allTierNames, tierRankIn } from '@/data/tiers';
import { AccountsMap, type MapPin } from '@/ui/AccountsMap';
import { Button, Card, Chip, Row, Segmented, TierBadge, ToggleRow, text, tierColor } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type Kind = 'All' | 'HCP' | 'HCO';

/** Doctors, pharmacies and hospitals on a map, coloured by tier, with overdue accounts ringed in red (2.9). */
export default function MapScreen() {
  const me = useMe();
  const { data, accounts, cycle, getUser } = useStore();
  const [kind, setKind] = useState<Kind>('All');
  const [tier, setTier] = useState<string>();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [repId, setRepId] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const reps = me.role === 'Rep' ? [] : repsUnder(data.users, me);
  const status = useMemo(() => visitStatus(data, cycle), [data, cycle]);

  const inView = accounts.filter((a) => (kind === 'All' || a.type === kind) && (!tier || a.tier === tier) && (!repId || a.ownerId === repId) && (me.role !== 'Rep' || a.ownerId === me.id));
  const located = inView.filter(hasLocation).filter((a) => !overdueOnly || status.get(a.id)?.overdue);
  const missing = inView.filter((a) => !hasLocation(a)).length;
  const overdue = inView.filter((a) => hasLocation(a) && status.get(a.id)?.overdue).length;
  const pins: MapPin[] = located.slice(0, 3000).map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, color: tierColor(tierRankIn(data.settings, a.tier)).fg, ring: status.get(a.id)?.overdue, square: a.type === 'HCO' }));
  const sel = selected ? accounts.find((a) => a.id === selected) : undefined;
  const st = sel ? status.get(sel.id) : undefined;
  const tiers = allTierNames(data.settings);

  return (
    <Screen wide>
      <Segmented options={['All', 'HCP', 'HCO'] as Kind[]} value={kind} onChange={setKind} labels={{ All: 'All accounts', HCP: 'People', HCO: 'Organizations' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {tiers.map((t) => (
          <Chip key={t} label={t} selected={tier === t} onPress={() => setTier(tier === t ? undefined : t)} />
        ))}
        {reps.length > 1 &&
          reps.map((r) => <Chip key={r.id} label={r.name} icon="person-outline" selected={repId === r.id} onPress={() => setRepId(repId === r.id ? undefined : r.id)} />)}
      </View>
      <ToggleRow label={`Overdue only (${overdue})`} value={overdueOnly} onChange={setOverdueOnly} hint={cycle ? `Behind this cycle’s plan, or not seen as often as the tier asks (${cycle.name}).` : undefined} />

      <AccountsMap pins={pins} selected={selected} onSelect={setSelected} height={Platform.OS === 'web' ? 520 : 400} />

      <Row style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
        {tiers.slice(0, 6).map((t) => (
          <Row key={t} gap={4}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tierColor(tierRankIn(data.settings, t)).fg }} />
            <Text style={text.small}>{t}</Text>
          </Row>
        ))}
        <Row gap={4}>
          <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colors.danger }} />
          <Text style={text.small}>Overdue</Text>
        </Row>
        <Row gap={4}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.faint }} />
          <Text style={text.small}>Organization</Text>
        </Row>
      </Row>

      {sel && hasLocation(sel) && (
        <Card>
          <Row>
            <Text style={[text.title, { flex: 1 }]} onPress={() => router.push({ pathname: '/account/[id]', params: { id: sel.id } })}>
              {sel.name}
            </Text>
            <TierBadge tier={sel.tier} />
          </Row>
          <Text style={text.muted}>
            {sel.specialty} · {sel.city}
            {me.role !== 'Rep' ? ` · ${getUser(sel.ownerId)?.name ?? 'No rep'}` : ''}
          </Text>
          <Text style={[text.small, st?.overdue && { color: colors.danger }]}>{st?.overdue ? `Overdue: ${st.reason}` : st?.lastVisit ? `Last visit ${formatDate(st.lastVisit)}` : 'Not visited yet'}</Text>
          <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
            <Button small title="Open" onPress={() => router.push({ pathname: '/account/[id]', params: { id: sel.id } })} />
            {sel.ownerId === me.id && <Button small variant="secondary" title="Plan a visit" icon="calendar-outline" onPress={() => router.push({ pathname: '/call/edit', params: { accountId: sel.id, plan: '1' } })} />}
            <Button small variant="ghost" title="Directions" icon="navigate-outline" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`)} />
          </Row>
        </Card>
      )}

      <Text style={text.small}>
        {located.length} on the map{missing ? ` · ${missing} without a location yet: an account gets one at its first check-in` : ''}.
      </Text>
    </Screen>
  );
}
