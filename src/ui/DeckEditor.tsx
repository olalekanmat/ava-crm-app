import { useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { uploadDeck } from '@/cloud/decks';
import { formatDate } from '@/data/dates';
import { useStore } from '@/data/store';
import type { DeckRef, Product } from '@/data/types';
import { Button, Row, text } from './components';
import { confirm, notify } from './confirm';
import { pickSlides } from './photo';
import { Presenter } from './Presenter';
import { colors, space } from './theme';

/** A product's call presentation: upload slides (images in order), preview or remove them. */
export function DeckEditor({ product, onSave }: { product: Product; onSave: (deck: DeckRef | undefined) => void }) {
  const { drive } = useStore();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const deck = product.deck;

  const upload = async () => {
    const folder = drive();
    if (!folder) return notify('Not available', 'Presentations are stored in your company folder. Sign in to your company to upload them.');
    try {
      const slides = await pickSlides();
      if (!slides.length) return;
      setBusy(true);
      onSave(await uploadDeck(folder, product, slides));
    } catch (e) {
      notify('Presentation not uploaded', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: space.sm }}>
      <Text style={text.small}>
        {deck ? `Presentation: ${deck.slides} slide${deck.slides > 1 ? 's' : ''} · uploaded ${formatDate(deck.updatedAt)}` : 'No presentation yet. Export the approved slides as images (in PowerPoint: File › Export › JPEG) and pick them in order.'}
      </Text>
      {busy ? (
        <Row style={{ marginTop: 4 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={text.muted}>Uploading slides to the company folder…</Text>
        </Row>
      ) : (
        <Row style={{ marginTop: 4, flexWrap: 'wrap' }}>
          <Button small variant="ghost" icon="images-outline" title={deck ? 'Replace slides' : Platform.OS === 'web' ? 'Choose slide images' : 'Add slides'} onPress={upload} />
          {deck && <Button small variant="ghost" icon="play-outline" title="Preview" onPress={() => setPreview(true)} />}
          {deck && <Button small variant="ghost" icon="close-circle-outline" title="Remove" onPress={() => confirm(`Remove the ${product.name} presentation?`, 'Reps will no longer see it in calls. Calls that used it keep their record.', () => onSave(undefined), 'Remove')} />}
        </Row>
      )}
      {deck && <Presenter visible={preview} products={[product]} onClose={() => setPreview(false)} onDone={() => setPreview(false)} />}
    </View>
  );
}
