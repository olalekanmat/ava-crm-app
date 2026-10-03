import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useStore } from '@/data/store';
import type { AccountType, Tier } from '@/data/types';
import { Button, Chip, Field, Label } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';

export default function NewAccountScreen() {
  const { addAccount, accounts } = useStore();
  const [type, setType] = useState<AccountType>('HCP');
  const [tier, setTier] = useState<Tier>('B');
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);

  const orgs = accounts.filter((a) => a.type === 'HCO');
  const missing = { name: !name.trim(), specialty: !specialty.trim(), city: !city.trim() };

  const save = () => {
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    const account = addAccount({
      type,
      tier,
      name: name.trim(),
      specialty: specialty.trim(),
      affiliation: type === 'HCP' && affiliation.trim() ? affiliation.trim() : undefined,
      address: address.trim(),
      city: city.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });
    router.replace({ pathname: '/account/[id]', params: { id: account.id } });
  };

  return (
    <Screen>
      <Label>Type</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
        <Chip label="Person (HCP)" selected={type === 'HCP'} onPress={() => setType('HCP')} />
        <Chip label="Organization (HCO)" selected={type === 'HCO'} onPress={() => setType('HCO')} />
      </View>
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
      <View style={{ flexDirection: 'row', marginBottom: space.sm }}>
        {(['A', 'B', 'C'] as Tier[]).map((t) => (
          <Chip key={t} label={`Tier ${t}`} selected={tier === t} onPress={() => setTier(t)} />
        ))}
      </View>
      <Field label="Address" value={address} onChangeText={setAddress} />
      <Field label="City *" value={city} onChangeText={setCity} error={tried && missing.city ? 'Required' : undefined} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Button title="Save account" onPress={save} />
    </Screen>
  );
}
