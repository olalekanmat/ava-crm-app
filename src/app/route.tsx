import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { toDateKey } from '@/data/dates';
import { formatDistance, hasLocation } from '@/data/geo';
import { nextVisits } from '@/data/nextBest';
import { bestRoute, directionsUrl } from '@/data/route';
import { useMe, useStore } from '@/data/store';
import type { Account } from '@/data/types';
import { Banner, Button, Card, Empty, Row, SectionTitle, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { currentFix } from '@/ui/location';
import { Screen } from '@/ui/Screen';
import { colors, radius, space } from '@/ui/theme';

type Here = { lat: number; lng: number };

/** Today's planned visits on a simple map, in the shortest visiting order, with directions in Google Maps. */
export default function RouteScreen() {
  const me = useMe();
  const { data, calls, getAccount, cycle } = useStore();
  const [here, setHere] = useState<Here>();
  const [locating, setLocating] = useState(false);
  const today = toDateKey(new Date());

  const planned = useMemo(() => {
    const seen = new Set<string>();
    const out: { account: Account; time: string }[] = [];
    for (const c of [...calls].reverse()) {
      if (c.ownerId !== me.id || c.status !== 'Planned' || toDateKey(new Date(c.datetime)) !== today || seen.has(c.accountId)) continue;
      const a = getAccount(c.accountId);
      if (!a || a.deletedAt) continue;
      seen.add(a.id);
      out.push({ account: a, time: new Date(c.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    }
    return out;
  }, [calls, me.id, today, getAccount]);

  // With nothing booked today, suggest the best accounts to see (with a pinned location).
  const suggested = useMemo(() => (planned.length ? [] : nextVisits(data, me.id, cycle, new Date(), 20).filter((v) => hasLocation(v.account)).slice(0, 6)), [planned.length, data, me.id, cycle]);
  const stops = planned.length ? planned.map((p) => p.account) : suggested.map((v) => v.account);
  const pinned = stops.filter(hasLocation);
  const unpinned = stops.filter((a) => !hasLocation(a));
  const timeOf = new Map(planned.map((p) => [p.account.id, p.time]));

  const route = bestRoute(pinned.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng })), here);
  const ordered = route.order.map((s) => pinned.find((a) => a.id === s.id)!);

  const locate = async () => {
    setLocating(true);
    try {
      const f = await currentFix();
      setHere({ lat: f.lat, lng: f.lng });
    } catch (e) {
      notify('No location', e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  };

  const open = () => {
    const url = directionsUrl(ordered, here);
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else Linking.openURL(url).catch(() => notify('Could not open maps', 'Install Google Maps or open the link in a browser.'));
  };

  if (!stops.length) {
    return (
      <Screen>
        <Empty icon="map-outline" title="No visits today" action={<Button title="Plan a visit" icon="calendar-outline" onPress={() => router.push('/call/edit')} />}>
          Book visits for today and they appear here in the best order. Pin each account’s location so it shows on the map.
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      {!planned.length && <Banner tone="info">Nothing is booked for today, so this route uses the accounts Ava suggests you see next.</Banner>}
      <Card style={{ padding: space.sm }}>
        <RoutePlot stops={ordered} here={here} />
        <Row style={{ marginTop: space.sm, paddingHorizontal: space.sm }}>
          <Text style={[text.muted, { flex: 1 }]}>
            {ordered.length} stop{ordered.length === 1 ? '' : 's'}
            {route.metres ? ` · about ${formatDistance(route.metres)} in a straight line` : ''}
          </Text>
        </Row>
      </Card>
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <View style={{ flex: 1 }}>
          {locating ? <ActivityIndicator color={colors.primary} /> : <Button variant="ghost" title={here ? 'Update my location' : 'Start from my location'} icon="locate-outline" onPress={locate} />}
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Directions" icon="navigate-outline" onPress={open} disabled={!ordered.length} />
        </View>
      </Row>
      {ordered.length > 10 && <Text style={[text.small, { marginBottom: space.md }]}>Google Maps takes ten stops at a time, so directions cover the first ten.</Text>}

      <SectionTitle>Visiting order</SectionTitle>
      <Card style={{ padding: 0 }}>
        {ordered.map((a, i) => (
          <View key={a.id} style={styles.row}>
            <View style={styles.num}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.title} onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}>
                {a.name}
              </Text>
              <Text style={text.muted} numberOfLines={1}>
                {[timeOf.get(a.id) ? `Booked ${timeOf.get(a.id)}` : '', a.address || a.city].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      {unpinned.length > 0 && (
        <>
          <SectionTitle>Not on the map</SectionTitle>
          <Card style={{ padding: 0 }}>
            {unpinned.map((a) => (
              <View key={a.id} style={styles.row}>
                <Ionicons name="location-outline" size={20} color={colors.warn} />
                <View style={{ flex: 1 }}>
                  <Text style={text.title} onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}>
                    {a.name}
                  </Text>
                  <Text style={text.muted}>No pinned location. Pin it on the account’s Location tab when you are there.</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

/** A schematic map: stops placed by latitude and longitude in a box, numbered in visiting order. */
function RoutePlot({ stops, here }: { stops: { id: string; lat: number; lng: number }[]; here?: Here }) {
  const [w, setW] = useState(0);
  const h = 220;
  const pts = here ? [...stops, here] : stops;
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // Keep the same scale on both axes (longitude shrinks with latitude) so the shape is true.
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-4);
  const spanY = Math.max(maxLat - minLat, 1e-4);
  const pad = 24;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2;
  const oy = (h - spanY * scale) / 2;
  const xy = (p: { lat: number; lng: number }) => ({ x: ox + (p.lng - minLng) * k * scale, y: oy + (maxLat - p.lat) * scale });
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, key: string) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    return <View key={key} style={[styles.leg, { width: len, left: (a.x + b.x) / 2 - len / 2, top: (a.y + b.y) / 2 - 1, transform: [{ rotate: `${angle}rad` }] }]} />;
  };
  const chain = here ? [xy(here), ...stops.map(xy)] : stops.map(xy);

  return (
    <View style={styles.plot} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <>
          {chain.slice(1).map((b, i) => line(chain[i], b, `l${i}`))}
          {here && (
            <View style={[styles.here, { left: xy(here).x - 8, top: xy(here).y - 8 }]}>
              <View style={styles.hereDot} />
            </View>
          )}
          {stops.map((s, i) => {
            const p = xy(s);
            return (
              <View key={s.id} style={[styles.pin, { left: p.x - 13, top: p.y - 13 }]}>
                <Text style={styles.numText}>{i + 1}</Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { height: 220, borderRadius: radius.md, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  leg: { position: 'absolute', height: 2, backgroundColor: colors.primary, opacity: 0.45 },
  pin: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  here: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.25)', alignItems: 'center', justifyContent: 'center' },
  hereDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
