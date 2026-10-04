import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Company } from '@/data/types';
import { Button, Field, Label, Row, text } from './components';
import { notify } from './confirm';
import { pickLogo } from './logo';
import { colors, radius, space } from './theme';

/** Company name, logo and contact details; used in setup and by the admin later. */
export function CompanyForm({ value, onChange, tried }: { value: Company; onChange: (c: Company) => void; tried?: boolean }) {
  const [loading, setLoading] = useState(false);
  const set = (k: keyof Company) => (v: string) => onChange({ ...value, [k]: v });
  const choose = async () => {
    setLoading(true);
    try {
      const logo = await pickLogo();
      if (logo) onChange({ ...value, logo });
    } catch (e) {
      notify('Logo not added', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <View>
      <Field label="Company name *" value={value.name} onChangeText={set('name')} error={tried && !value.name.trim() ? 'Required' : undefined} />
      <Label>Logo</Label>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <View style={{ width: 120, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 6 }}>
          {value.logo ? <Image source={{ uri: value.logo }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : <Text style={text.small}>No logo</Text>}
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Button small variant="secondary" icon="image-outline" title={loading ? 'Loading…' : value.logo ? 'Change logo' : 'Choose logo'} onPress={choose} disabled={loading} />
          {!!value.logo && <Button small variant="ghost" title="Remove" onPress={() => onChange({ ...value, logo: undefined })} />}
          <Text style={text.small}>PNG or JPEG. Shown at the top left of every page.</Text>
        </View>
      </Row>
      <Field label="Address" value={value.address ?? ''} onChangeText={set('address')} />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="City" value={value.city ?? ''} onChangeText={set('city')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Country" value={value.country ?? ''} onChangeText={set('country')} />
        </View>
      </Row>
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="Phone" value={value.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Email" value={value.email ?? ''} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        </View>
      </Row>
      <Field label="Website" value={value.website ?? ''} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" />
      <Field label="Registration number" value={value.registrationNo ?? ''} onChangeText={set('registrationNo')} hint="Business or regulatory registration, if you want it on record." />
    </View>
  );
}

/** Drops empty fields so the journal only carries what was entered. */
export const cleanCompany = (c: Company): Company =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]).filter(([, v]) => v !== undefined && v !== '')) as unknown as Company;
