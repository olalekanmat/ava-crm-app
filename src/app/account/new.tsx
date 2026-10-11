import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { possibleDuplicates } from '@/data/duplicates';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { tiersFor } from '@/data/tiers';
import { ACCOUNT_CHANGE_FIELDS, POTENTIALS, type Account, type AccountChanges, type AccountType, type Potential, type Tier } from '@/data/types';
import { Banner, Button, Card, Chip, Field, Label, Row, Segmented, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { currentFix, type Fix } from '@/ui/location';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';
import { WorkplacePicker } from '@/ui/WorkplacePicker';

/**
 * New account, or (with ?id=) its details. Managers and administrators change details directly;
 * a rep's change goes to their manager as a request.
 */
export default function AccountFormScreen() {
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const me = useMe();
  const { data, accounts, run, getAccount, admin } = useStore();
  const existing = editId ? getAccount(editId) : undefined;
  const asking = !!existing && me.role === 'Rep' && !admin;
  const reps = repsUnder(data.users, me);
  const [ownerId, setOwnerId] = useState(existing?.ownerId ?? (me.role === 'Rep' ? me.id : reps[0]?.id));
  const [type, setType] = useState<AccountType>(existing?.type ?? 'HCP');
  const [picked, setTier] = useState<Tier | undefined>(existing?.tier);
  const [name, setName] = useState(existing?.name ?? '');
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '');
  const [affiliation, setAffiliation] = useState(existing?.affiliation ?? '');
  const [workplaces, setWorkplaces] = useState<string[]>(existing?.workplaces ?? []);
  const [address, setAddress] = useState(existing?.address ?? '');
  const [city, setCity] = useState(existing?.city ?? (me.role === 'Rep' ? me.territory ?? '' : ''));
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [kol, setKol] = useState(!!existing?.kol);
  const [potential, setPotential] = useState<Potential | undefined>(existing?.potential);
  const [segment, setSegment] = useState(existing?.segment ?? '');
  const [reason, setReason] = useState('');
  const [dupesOk, setDupesOk] = useState(false);
  const [fix, setFix] = useState<Fix>();
  const [locating, setLocating] = useState(false);
  const [tried, setTried] = useState(false);

  const scheme = tiersFor(data.settings, data.users, ownerId);
  const tier = picked && scheme.some((t) => t.name === picked) ? picked : scheme[Math.min(1, scheme.length - 1)].name;
  const orgs = accounts.filter((a) => a.type === 'HCO' && a.ownerId === ownerId);
  const allOrgs = accounts.filter((a) => a.type === 'HCO' && !a.deletedAt && a.id !== existing?.id);
  const dupes = existing ? [] : possibleDuplicates({ type, name, city, phone }, accounts.filter((a) => !a.deletedAt));
  const missing = { name: !name.trim(), specialty: !specialty.trim(), city: !city.trim(), owner: !ownerId };

  const locate = async () => {
    setLocating(true);
    try {
      setFix(await currentFix());
    } catch (e) {
      notify('No location', e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  };

  /** The details as typed, in the shape a change request carries. */
  const details = (): AccountChanges => ({
    name: name.trim(),
    type,
    specialty: specialty.trim(),
    affiliation: type === 'HCP' && affiliation.trim() ? affiliation.trim() : undefined,
    workplaces: type === 'HCP' ? workplaces : undefined,
    address: address.trim(),
    city: city.trim(),
    phone: phone.trim() || undefined,
    email: email.trim() || undefined,
  });

  const save = () => {
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    if (dupes.length && !dupesOk) return;
    if (existing) return saveExisting(existing);
    const id = newId('acc');
    try {
      run({
        type: 'account.upsert',
        account: {
          id,
          workplaces: type === 'HCP' && workplaces.length ? workplaces : undefined,
          type,
          tier,
          ownerId: ownerId!,
          name: name.trim(),
          specialty: specialty.trim(),
          affiliation: type === 'HCP' && affiliation.trim() ? affiliation.trim() : undefined,
          address: address.trim(),
          city: city.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          kol: type === 'HCP' && kol ? true : undefined,
          potential,
          segment: segment.trim() || undefined,
          lat: fix?.lat,
          lng: fix?.lng,
          createdAt: new Date().toISOString(),
        },
      });
      router.replace({ pathname: '/account/[id]', params: { id } });
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  const saveExisting = (a: Account) => {
    const next = details();
    try {
      if (asking) {
        const changes: AccountChanges = {};
        for (const k of ACCOUNT_CHANGE_FIELDS) if (JSON.stringify(next[k] ?? null) !== JSON.stringify((k === 'workplaces' && !a.workplaces ? [] : a[k]) ?? null)) (changes as Record<string, unknown>)[k] = next[k] ?? null;
        if (!Object.keys(changes).length) return notify('Nothing has changed', 'Change a detail first, or go back.');
        run({ type: 'account.change', change: { id: newId('chg'), accountId: a.id, byId: me.id, at: new Date().toISOString(), changes, note: reason.trim() || undefined, status: 'Pending' } });
        notify('Sent for approval', 'Your manager will check the change. You will see the result under Approvals.');
      } else {
        run({ type: 'account.upsert', account: { ...a, ...next, workplaces: next.workplaces ?? [], ownerId: ownerId ?? a.ownerId, tier, kol: type === 'HCP' && kol ? true : undefined, potential, segment: segment.trim() || undefined, lat: fix?.lat ?? a.lat, lng: fix?.lng ?? a.lng } });
      }
      router.back();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  if (editId && !existing) {
    return (
      <Screen>
        <Text style={text.muted}>Account not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      {existing && <Stack.Screen options={{ title: asking ? 'Suggest a correction' : 'Edit account' }} />}
      {asking && <Banner icon="shield-checkmark-outline">Correct any detail below. Your manager approves the change before everyone sees it.</Banner>}
      {me.role !== 'Rep' && !existing && (
        <>
          <Label>Territory (rep) *</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
            {reps.map((r) => (
              <Chip key={r.id} label={`${r.name} · ${r.territory ?? ''}`} selected={ownerId === r.id} onPress={() => setOwnerId(r.id)} />
            ))}
          </View>
          {tried && missing.owner && <Text style={{ color: colors.danger, marginBottom: space.sm }}>Choose a rep</Text>}
        </>
      )}
      <Segmented options={['HCP', 'HCO'] as AccountType[]} value={type} onChange={setType} labels={{ HCP: 'Person (HCP)', HCO: 'Organization (HCO)' }} />
      <Field label="Name *" value={name} onChangeText={setName} placeholder={type === 'HCP' ? 'Dr. Jane Doe' : 'City Hospital'} error={tried && missing.name ? 'Required' : undefined} />
      <Field label={type === 'HCP' ? 'Specialty *' : 'Organization kind *'} value={specialty} onChangeText={setSpecialty} placeholder={type === 'HCP' ? 'Cardiology' : 'Clinic, hospital, pharmacy'} error={tried && missing.specialty ? 'Required' : undefined} />
      {type === 'HCP' && (
        <>
          <Field label="Affiliation" value={affiliation} onChangeText={setAffiliation} placeholder="Main hospital or clinic" />
          {orgs.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: -space.sm, marginBottom: space.sm }}>
              {orgs.map((o) => (
                <Chip key={o.id} label={o.name} selected={affiliation === o.name} onPress={() => setAffiliation(o.name)} />
              ))}
            </View>
          )}
          <WorkplacePicker value={workplaces} onChange={setWorkplaces} orgs={allOrgs} exclude={affiliation.trim()} />
        </>
      )}
      {!asking && (
        <>
      <Label>Tier</Label>
      <Segmented options={scheme.map((t) => t.name)} value={tier} onChange={setTier} />
      {type === 'HCP' && <ToggleRow label="Key opinion leader" value={kol} onChange={setKol} hint="Visited more often in suggested plans." />}
      <Label>Prescribing potential</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
        {POTENTIALS.map((p) => (
          <Chip key={p} label={p} selected={potential === p} onPress={() => setPotential(potential === p ? undefined : p)} />
        ))}
      </View>
      <Field label="Segment" value={segment} onChangeText={setSegment} placeholder="Optional, e.g. Early adopter" maxLength={40} />
        </>
      )}
      <Field label="Address" value={address} onChangeText={setAddress} />
      <Field label="City *" value={city} onChangeText={setCity} error={tried && missing.city ? 'Required' : undefined} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      {!existing && (
        <>
          <Label>Location</Label>
          <Row style={{ marginBottom: space.lg }}>
            <Text style={[text.muted, { flex: 1 }]}>{fix ? `Pinned at ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} (±${fix.accuracy ?? '?'} m)` : 'If you are at the account now, pin its location.'}</Text>
            {locating ? <ActivityIndicator color={colors.primary} /> : <Button small variant="secondary" icon="pin-outline" title={fix ? 'Re-pin' : 'Use my location'} onPress={locate} />}
          </Row>
        </>
      )}
      {asking && <Field label="Why the change? (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Moved to a new clinic in June" maxLength={500} />}
      {dupes.length > 0 && (
        <Card style={{ borderWidth: 1, borderColor: colors.warn }}>
          <Text style={[text.title, { color: colors.warn }]}>This may already be in Ava</Text>
          {dupes.map((d) => (
            <Text key={d.account.id} style={[text.body, { marginTop: space.xs }]} onPress={() => router.push({ pathname: '/account/[id]', params: { id: d.account.id } })}>
              <Text style={text.link}>{d.account.name}</Text>
              <Text style={text.muted}>
                {' '}
                · {d.account.city} · {d.reason}
              </Text>
            </Text>
          ))}
          <View style={{ marginTop: space.sm }}>
            <ToggleRow label="It is a different person or place" value={dupesOk} onChange={setDupesOk} />
          </View>
          {tried && !dupesOk && <Text style={{ color: colors.danger }}>Open the existing account instead, or confirm this one is different.</Text>}
        </Card>
      )}
      <Button title={asking ? 'Send for approval' : existing ? 'Save changes' : 'Save account'} onPress={save} />
    </Screen>
  );
}
