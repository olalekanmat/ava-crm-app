import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import { TIERS, type AccountType, type Tier } from '@/data/types';
import { Button, Chip, Field, Label, Row, Segmented, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { currentFix, type Fix } from '@/ui/location';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

export default function NewAccountScreen() {
  const me = useMe();
  const { data, accounts, run } = useStore();
  const reps = repsUnder(data.users, me);
  const [ownerId, setOwnerId] = useState(me.role === 'Rep' ? me.id : reps[0]?.id);
  const [type, setType] = useState<AccountType>('HCP');
  const [tier, setTier] = useState<Tier>('B');
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(me.role === 'Rep' ? me.territory ?? '' : '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fix, setFix] = useState<Fix>();
  const [locating, setLocating] = useState(false);
  const [tried, setTried] = useState(false);

  const orgs = accounts.filter((a) => a.type === 'HCO' && a.ownerId === ownerId);
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

  const save = () => {
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    const id = newId('acc');
    try {
      run({
        type: 'account.upsert',
        account: {
          id,
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

  return (
    <Screen>
      {me.role !== 'Rep' && (
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
        </>
      )}
      <Label>Tier</Label>
      <Segmented options={TIERS} value={tier} onChange={setTier} labels={{ A: 'Tier A', B: 'Tier B', C: 'Tier C' }} />
      <Field label="Address" value={address} onChangeText={setAddress} />
      <Field label="City *" value={city} onChangeText={setCity} error={tried && missing.city ? 'Required' : undefined} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Label>Location</Label>
      <Row style={{ marginBottom: space.lg }}>
        <Text style={[text.muted, { flex: 1 }]}>{fix ? `Pinned at ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} (±${fix.accuracy ?? '?'} m)` : 'If you are at the account now, pin its location.'}</Text>
        {locating ? <ActivityIndicator color={colors.primary} /> : <Button small variant="secondary" icon="pin-outline" title={fix ? 'Re-pin' : 'Use my location'} onPress={locate} />}
      </Row>
      <Button title="Save account" onPress={save} />
    </Screen>
  );
}
