import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { newId } from '@/data/ids';
import { profileBoost } from '@/data/profile';
import { useStore } from '@/data/store';
import { POTENTIALS, type Account, type Potential } from '@/data/types';
import { Badge, Button, Card, Chip, Field, Label, Row, SectionTitle, ToggleRow, text } from './components';
import { notify } from './confirm';
import { colors, space } from './theme';

/** Profile tags beside an account's name: KOL, potential, segment. */
export function ProfileBadges({ account }: { account: Account }) {
  if (!account.kol && !account.potential && !account.segment) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
      {account.kol && <Badge label="Key opinion leader" icon="star" fg={colors.warn} bg={colors.warnSoft} />}
      {account.potential && <Badge label={`${account.potential} potential`} icon="trending-up" fg={account.potential === 'High' ? colors.success : colors.muted} bg={account.potential === 'High' ? colors.successSoft : colors.sunken} />}
      {!!account.segment && <Badge label={account.segment} fg={colors.primary} bg={colors.primarySoft} />}
    </View>
  );
}

/** Doctor profile: KOL, prescribing potential and segment. KOLs and high potential get extra visits in plans. */
export function ProfileCard({ account, canEdit }: { account: Account; canEdit: boolean }) {
  const { run, data } = useStore();
  const [editing, setEditing] = useState(false);
  const [kol, setKol] = useState(!!account.kol);
  const [potential, setPotential] = useState<Potential | undefined>(account.potential);
  const [segment, setSegment] = useState(account.segment ?? '');
  const segments = [...new Set(data.accounts.map((a) => a.segment).filter((x): x is string => !!x))].sort().slice(0, 12);
  const boost = profileBoost(account);

  const save = () => {
    try {
      // false and '' clear a field (see withProfile in mutations.ts).
      run({ type: 'account.upsert', account: { ...account, kol, potential: potential ?? ('' as never), segment: segment.trim() } });
      setEditing(false);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  if (!editing) {
    if (!account.kol && !account.potential && !account.segment && !canEdit) return null;
    return (
      <Card>
        <Row>
          <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
          <Text style={[text.title, { flex: 1 }]}>Profile</Text>
          {canEdit && (
            <Text style={text.link} onPress={() => setEditing(true)}>
              {account.kol || account.potential || account.segment ? 'Edit' : 'Add'}
            </Text>
          )}
        </Row>
        {account.kol || account.potential || account.segment ? (
          <Text style={[text.muted, { marginTop: 4 }]}>
            {[account.kol ? 'Key opinion leader' : '', account.potential ? `${account.potential} prescribing potential` : '', account.segment ? `segment ${account.segment}` : ''].filter(Boolean).join(' · ')}.
            {boost > 0 ? ` Suggested plans add ${boost} visit${boost > 1 ? 's' : ''} a quarter.` : ''}
          </Text>
        ) : (
          <Text style={[text.muted, { marginTop: 4 }]}>Tag key opinion leaders and prescribing potential so they are visited more often.</Text>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[text.title, { marginBottom: space.sm }]}>Profile</Text>
      {account.type === 'HCP' && <ToggleRow label="Key opinion leader" value={kol} onChange={setKol} hint="Influences other prescribers. Two extra visits a quarter." />}
      <Label>Prescribing potential</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
        {POTENTIALS.map((p) => (
          <Chip key={p} label={p} selected={potential === p} onPress={() => setPotential(potential === p ? undefined : p)} />
        ))}
      </View>
      <Field label="Segment" value={segment} onChangeText={setSegment} placeholder="e.g. Early adopter" maxLength={40} />
      {segments.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: -space.sm, marginBottom: space.sm }}>
          {segments.map((x) => (
            <Chip key={x} label={x} selected={segment === x} onPress={() => setSegment(x)} />
          ))}
        </View>
      )}
      <Row>
        <Button title="Save profile" onPress={save} />
        <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
      </Row>
    </Card>
  );
}

/** wa.me wants the full international number in digits; local Nigerian numbers (0803…) become 234803…. */
export function whatsappNumber(phone?: string): string {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = `234${d.slice(1)}`;
  return d.length >= 8 ? d : '';
}

/** Send a product brochure on WhatsApp and log it as a submitted remote call. */
export function BrochureShare({ account }: { account: Account }) {
  const { products, run } = useStore();
  const withLinks = products.filter((p) => p.brochureUrl);
  const [product, setProduct] = useState(withLinks[0]?.name);
  const [open, setOpen] = useState(false);
  const first = account.type === 'HCP' ? account.name : 'there';
  const chosen = withLinks.find((p) => p.name === product);
  const [message, setMessage] = useState('');
  const body = message || (chosen ? `Hello ${first}, here is the ${chosen.name} brochure as promised: ${chosen.brochureUrl}` : '');

  if (!withLinks.length) return null;

  const share = () => {
    if (!chosen) return;
    const n = whatsappNumber(account.phone);
    const url = `https://wa.me/${n}?text=${encodeURIComponent(body.includes(chosen.brochureUrl!) ? body : `${body}\n${chosen.brochureUrl}`)}`;
    const id = newId('call');
    const now = new Date().toISOString();
    try {
      run({
        type: 'call.save',
        call: { id, accountId: account.id, ownerId: account.ownerId, datetime: now, channel: 'WhatsApp', status: 'Submitted', products: [{ product: chosen.name, priority: 1 }], keyMessages: [], notes: `Shared the ${chosen.name} brochure on WhatsApp.`, createdAt: now, updatedAt: now },
      });
    } catch (e) {
      notify('Not logged', e instanceof Error ? e.message : String(e));
      return;
    }
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else Linking.openURL(url).catch(() => notify('WhatsApp did not open', 'Install WhatsApp on this phone and try again.'));
    setOpen(false);
    setMessage('');
    notify('Logged as a WhatsApp call', `Send the message in WhatsApp. The share is in ${account.name}’s calls.`);
    router.push({ pathname: '/call/[id]', params: { id } });
  };

  if (!open) {
    return (
      <Button title="Share a brochure on WhatsApp" icon="logo-whatsapp" variant="secondary" onPress={() => setOpen(true)} />
    );
  }
  return (
    <>
      <SectionTitle>Share on WhatsApp</SectionTitle>
      <Card>
        <Label>Brochure</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
          {withLinks.map((p) => (
            <Chip key={p.id} label={p.name} selected={p.name === product} onPress={() => { setProduct(p.name); setMessage(''); }} />
          ))}
        </View>
        <Field label="Message" value={body} onChangeText={setMessage} multiline />
        <Text style={[text.small, { marginBottom: space.sm }]}>
          {whatsappNumber(account.phone) ? `To ${account.phone}.` : 'No phone number on this account, so WhatsApp asks you to pick the chat.'} Sharing logs a submitted WhatsApp call with this product.
        </Text>
        <Row>
          <Button title="Open WhatsApp" icon="logo-whatsapp" onPress={share} disabled={!chosen} />
          <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
        </Row>
      </Card>
    </>
  );
}
