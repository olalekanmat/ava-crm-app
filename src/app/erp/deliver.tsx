import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Signature } from '@/data/types';
import { Banner, Button, Card, Empty, Field, Row, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { currentFix } from '@/ui/location';
import { pickDocPhoto } from '@/ui/photo';
import { Screen } from '@/ui/Screen';
import { SignaturePad, SignatureView } from '@/ui/SignaturePad';
import { radius, space } from '@/ui/theme';

/** 2.14: proof of delivery: who received the goods, their signature or a photo of the signed note, and where. */
export default function DeliverScreen() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const { data, erp, run, getAccount } = useErp();
  const inv = (data.invoices ?? []).find((i) => i.id === invoiceId);
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  const [signature, setSignature] = useState<Signature>();
  const [signing, setSigning] = useState(false);
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!erp) return <ErpOff />;
  if (!inv) return <Screen><Empty title="Invoice not found">Sync and try again.</Empty></Screen>;

  const save = async () => {
    setBusy(true);
    let fix: { lat?: number; lng?: number } = {};
    try {
      const f = await currentFix();
      fix = { lat: f.lat, lng: f.lng };
    } catch {
      // Location is a bonus: delivery is still recorded without it.
    }
    try {
      run({ type: 'invoice.deliver', invoiceId: inv.id, delivery: { at: '', byId: '', receivedBy: receivedBy.trim(), signature, photo, note: note.trim() || undefined, ...fix } });
      router.back();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const shoot = async (source: 'camera' | 'library') => {
    try {
      const p = await pickDocPhoto(source, 280_000);
      if (p) setPhoto(p);
    } catch (e) {
      notify('No photo', e instanceof Error ? e.message : String(e));
    }
  };

  if (signing) return <Screen><SignaturePad initialName={receivedBy} onDone={(sg) => { setSignature(sg); if (!receivedBy.trim()) setReceivedBy(sg.name); setSigning(false); }} onCancel={() => setSigning(false)} /></Screen>;

  return (
    <Screen>
      <Text style={[text.muted, { marginBottom: space.md }]}>{getAccount(inv.accountId)?.name} · {inv.number}</Text>
      <Card>
        <Field label="Received by" value={receivedBy} onChangeText={setReceivedBy} placeholder="Name of the person who took the goods" />
        {signature ? <SignatureView signature={signature} /> : null}
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 220, borderRadius: radius.md }} contentFit="contain" /> : null}
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Button small variant="secondary" icon="create-outline" title={signature ? 'Sign again' : 'Customer signs'} onPress={() => setSigning(true)} />
          <Button small variant="ghost" icon="camera-outline" title={photo ? 'Retake photo' : 'Photo of signed note'} onPress={() => shoot('camera')} />
          <Button small variant="ghost" icon="image-outline" title="From gallery" onPress={() => shoot('library')} />
        </Row>
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. 2 cartons short, left with security" multiline />
        <View style={{ height: space.sm }} />
        <Banner tone="info" icon="location-outline">Your location is saved with the delivery when the phone allows it.</Banner>
        <Button title={busy ? 'Saving…' : 'Save delivery'} icon="checkmark" onPress={save} disabled={busy || !receivedBy.trim() || (!signature && !photo)} />
      </Card>
    </Screen>
  );
}
