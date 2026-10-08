import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AccountBrief } from '@/ai/AccountBrief';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { hasLocation, mapsUrl } from '@/data/geo';
import { callsByAccount, cycleCalls, cycleElapsed } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { CallRow } from '@/ui/CallRow';
import { AccountTimeline } from '@/ui/AccountTimeline';
import { Avatar, Banner, Button, Card, Empty, ProgressBar, Row, SectionTitle, Segmented, TierBadge, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Grid } from '@/ui/layout';
import { currentFix } from '@/ui/location';
import { Screen } from '@/ui/Screen';
import { StatSplit } from '@/ui/Tiles';
import { formatDate } from '@/data/dates';
import { colors, space, tone } from '@/ui/theme';

type Tab = 'Detail' | 'Timeline' | 'Calls' | 'Location';

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { data, getAccount, getUser, callsForAccount, accounts, cycle, run, admin } = useStore();
  const [locating, setLocating] = useState(false);
  const [tab, setTab] = useState<Tab>('Detail');
  const account = getAccount(id);

  if (!account) {
    return (
      <Screen>
        <Empty>Account not found.</Empty>
      </Screen>
    );
  }

  const calls = callsForAccount(account.id);
  const people = account.type === 'HCO' ? accounts.filter((a) => a.affiliation === account.name) : [];
  const plan = cycle && data.plans.find((p) => p.cycleId === cycle.id && p.ownerId === account.ownerId);
  const target = plan?.targets.find((t) => t.accountId === account.id);
  const doneInCycle = cycle ? callsByAccount(cycleCalls(calls.filter((c) => c.ownerId === account.ownerId), cycle)).get(account.id)?.length ?? 0 : 0;
  const owner = getUser(account.ownerId);
  const deleted = !!account.deletedAt;
  const openCalls = calls.filter((c) => c.status !== 'Submitted').length;
  const lastDone = calls.find((c) => c.status === 'Submitted');
  const nextVisit = [...calls].reverse().find((c) => c.status === 'Planned' && c.datetime >= new Date().toISOString());

  const remove = () =>
    confirm(
      `Delete ${account.name}?`,
      [
        'It disappears from account lists and plans.',
        openCalls ? `${openCalls} planned or draft call${openCalls > 1 ? 's are' : ' is'} removed.` : '',
        'Submitted calls stay in the history. This cannot be undone.',
      ]
        .filter(Boolean)
        .join(' '),
      () => {
        try {
          run({ type: 'account.delete', ids: [account.id] });
          router.back();
        } catch (e) {
          notify('Not deleted', e instanceof Error ? e.message : String(e));
        }
      },
      'Delete',
    );

  const pin = () =>
    confirm(
      hasLocation(account) ? 'Move the pin here?' : 'Pin location here?',
      'Use this only while you are at the account. Check-ins are verified against this location.',
      async () => {
        setLocating(true);
        try {
          const fix = await currentFix();
          run({ type: 'account.pin', id: account.id, lat: fix.lat, lng: fix.lng });
        } catch (e) {
          notify('Location not saved', e instanceof Error ? e.message : String(e));
        } finally {
          setLocating(false);
        }
      },
      'Pin',
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: account.type === 'HCP' ? 'Healthcare professional' : 'Organization' }} />
      {deleted && <Banner tone="warn" icon="trash-outline">This account was deleted by an administrator. Its submitted calls are kept below.</Banner>}
      <Card>
        <Row gap={space.md}>
          {account.type === 'HCP' ? (
            <Avatar name={account.name} size={52} />
          ) : (
            <View style={styles.org}>
              <Ionicons name="business" size={24} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={text.h2}>{account.name}</Text>
            <Text style={text.muted}>{account.specialty}</Text>
          </View>
          <TierBadge tier={account.tier} />
        </Row>
        {!!account.affiliation && (
          <Text
            style={[text.body, { marginTop: space.md }]}
            onPress={() => {
              const org = accounts.find((a) => a.type === 'HCO' && a.name === account.affiliation);
              if (org) router.push({ pathname: '/account/[id]', params: { id: org.id } });
            }}
          >
            Works at <Text style={text.link}>{account.affiliation}</Text>
          </Text>
        )}
        <Text style={[text.body, { marginTop: space.sm }]}>
          {[account.address, account.city].filter(Boolean).join(', ')}
        </Text>
        {!!account.phone && (
          <Text style={[text.link, { marginTop: 4 }]} onPress={() => Linking.openURL(`tel:${account.phone}`)}>
            {account.phone}
          </Text>
        )}
        {!!account.email && (
          <Text style={[text.link, { marginTop: 4 }]} onPress={() => Linking.openURL(`mailto:${account.email}`)}>
            {account.email}
          </Text>
        )}
        {me.role !== 'Rep' && <Text style={[text.small, { marginTop: space.sm }]}>Territory of {owner?.name}</Text>}
        {!!account.notes && <Text style={[text.muted, { marginTop: space.sm }]}>{account.notes}</Text>}
      </Card>

      {!deleted && (
        <Row style={{ marginBottom: space.md }}>
          <Button title="Log a call" icon="add-circle-outline" onPress={() => router.push({ pathname: '/call/edit', params: { accountId: account.id } })} />
          <Button title="Plan a visit" icon="calendar-outline" variant="secondary" onPress={() => router.push({ pathname: '/call/edit', params: { accountId: account.id, plan: '1' } })} />
        </Row>
      )}

      <Segmented
        options={(deleted ? ['Detail', 'Timeline', 'Calls'] : ['Detail', 'Timeline', 'Calls', 'Location']) as Tab[]}
        value={tab}
        onChange={setTab}
        labels={{ Calls: `Calls (${calls.length})` }}
      />

      {tab === 'Timeline' && <AccountTimeline calls={calls} showRep={me.role !== 'Rep'} />}

      {tab === 'Location' && !deleted && (
        <Card>
          <Row>
            <Ionicons name={hasLocation(account) ? 'location' : 'location-outline'} size={20} color={hasLocation(account) ? colors.success : colors.warn} />
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{hasLocation(account) ? 'Location pinned' : 'No location yet'}</Text>
              <Text style={text.muted}>
                {hasLocation(account) ? `${account.lat.toFixed(5)}, ${account.lng.toFixed(5)} · check-ins within ${data.settings.geofenceM} m count as verified` : 'Pin it during your next visit so check-ins can be verified.'}
              </Text>
            </View>
          </Row>
          <Row style={{ marginTop: space.md }}>
            {hasLocation(account) && <Button small title="Open in Maps" icon="map-outline" variant="secondary" onPress={() => Linking.openURL(mapsUrl(account.lat, account.lng))} />}
            {locating ? <ActivityIndicator color={colors.primary} /> : <Button small title={hasLocation(account) ? 'Re-pin here' : 'Pin my location'} icon="pin-outline" variant="ghost" onPress={pin} />}
          </Row>
        </Card>
      )}

      {tab === 'Detail' && (
        <Card>
          <StatSplit
            items={[
              { value: calls.filter((c) => c.status === 'Submitted').length, label: 'Calls', color: tone.normal },
              { value: lastDone ? formatDate(lastDone.datetime) : '–', label: 'Last call', color: colors.text },
              { value: nextVisit ? formatDate(nextVisit.datetime) : '–', label: 'Next visit', color: nextVisit ? tone.normal : colors.faint },
            ]}
            small
          />
        </Card>
      )}

      {tab === 'Detail' && cycle && target && (
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
            <Text style={text.title}>{cycle.name} plan</Text>
            <Text style={text.muted}>
              {doneInCycle} of {target.planned} calls
            </Text>
          </Row>
          <ProgressBar value={doneInCycle / target.planned} marker={cycleElapsed(cycle)} color={doneInCycle >= target.planned ? colors.success : colors.primary} />
        </Card>
      )}

      {tab === 'Detail' && !people.length && !(cycle && target) && (
        <Empty icon="document-text-outline" title="Nothing planned yet">
          This account is not in a cycle plan. See the Timeline for its history, or plan a visit.
        </Empty>
      )}

      {tab === 'Detail' && <AccountBrief accountId={account.id} />}

      {tab === 'Detail' && people.length > 0 && (
        <>
          <SectionTitle>People at this organization</SectionTitle>
          <Grid>
            {people.map((p) => (
              <Card key={p.id} onPress={() => router.push({ pathname: '/account/[id]', params: { id: p.id } })}>
                <Row gap={space.md}>
                  <Avatar name={p.name} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={text.title}>{p.name}</Text>
                    <Text style={text.muted}>{p.specialty}</Text>
                  </View>
                  <TierBadge tier={p.tier} />
                </Row>
              </Card>
            ))}
          </Grid>
        </>
      )}

      {tab === 'Calls' && (calls.length ? (
        <Grid>
          {calls.map((c) => (
            <CallRow key={c.id} call={c} showAccount={false} showRep={me.role !== 'Rep'} />
          ))}
        </Grid>
      ) : (
        <Empty icon="chatbubbles-outline" title="No calls yet">Log the first call or plan a visit above.</Empty>
      ))}

      {tab === 'Detail' && admin && !deleted && (
        <View style={{ marginTop: space.xl }}>
          <Button title="Delete account" variant="danger" icon="trash-outline" onPress={remove} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  org: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
