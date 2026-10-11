import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { loadBig, saveBig } from '../data/bigStorage';
import { deckFileName, parseDeckFile, type DeckFile } from '../data/detailing';
import { MAX_DECK_SLIDES } from '../data/mutations';
import type { DeckRef, Product } from '../data/types';
import type { DriveAdapter } from './drive';

/**
 * Product presentations live as files in the company folder (ava-deck-<product>-<hash>.json), each
 * holding the slides as images. The product record names the file and its SHA-256, so a device
 * only uses a file whose content is exactly what the administrator uploaded. Phones keep a copy
 * for offline calls; browsers keep them for the visit.
 */

/** Ava's server accepts uploads up to 5.5 MB; this leaves room for the request around it. */
export const MAX_DECK_BYTES = 5 * 1024 * 1024;
export { MAX_DECK_SLIDES };

const memory = new Map<string, string[]>();
const cacheKey = (hash: string) => `ava-deck-${hash}`;

export const sha256 = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);

/** Uploads slides (image data URIs) for a product; returns the reference to save on the product. */
export async function uploadDeck(drive: DriveAdapter, product: Pick<Product, 'id'>, slides: string[]): Promise<DeckRef> {
  if (!slides.length) throw new Error('Add at least one slide.');
  if (slides.length > MAX_DECK_SLIDES) throw new Error(`A presentation can have up to ${MAX_DECK_SLIDES} slides.`);
  const file: DeckFile = { format: 'ava-deck/1', productId: product.id, slides };
  const content = JSON.stringify(file);
  if (content.length > MAX_DECK_BYTES) throw new Error(`These slides come to ${(content.length / 1048576).toFixed(1)} MB; the limit is 5 MB. Use fewer slides or smaller images.`);
  const hash = await sha256(content);
  const name = deckFileName(product.id, hash);
  await drive.write(name, content, 'application/json');
  memory.set(hash, slides);
  if (Platform.OS !== 'web') await saveBig(cacheKey(hash), slides).catch(() => {});
  return { file: name, hash, slides: slides.length, updatedAt: new Date().toISOString() };
}

/** The slides already on this device, without going online. */
export async function cachedDeck(deck: DeckRef): Promise<string[] | null> {
  const m = memory.get(deck.hash);
  if (m) return m;
  if (Platform.OS === 'web') return null;
  const saved = await loadBig<string[]>(cacheKey(deck.hash));
  if (saved?.length) memory.set(deck.hash, saved);
  return saved?.length ? saved : null;
}

/** Downloads a presentation (checking it is the uploaded one) and keeps a copy on the device. */
export async function fetchDeck(drive: DriveAdapter, deck: DeckRef, fileId?: string): Promise<string[]> {
  const id = fileId ?? (await drive.list()).find((f) => f.name === deck.file)?.id;
  if (!id) throw new Error('The presentation file is missing from the company folder. Ask your administrator to upload it again.');
  const text = await drive.read(id);
  if ((await sha256(text)) !== deck.hash) throw new Error('The presentation file in the company folder has been changed since it was uploaded. Ask your administrator to upload it again.');
  const parsed = parseDeckFile(text);
  if (!parsed) throw new Error('The presentation file could not be read.');
  memory.set(deck.hash, parsed.slides);
  if (Platform.OS !== 'web') await saveBig(cacheKey(deck.hash), parsed.slides).catch(() => {});
  return parsed.slides;
}

/** Slides for a product: from the device when possible, else from the drive. */
export async function loadDeck(drive: DriveAdapter | null, deck: DeckRef): Promise<string[]> {
  const local = await cachedDeck(deck);
  if (local) return local;
  if (!drive) throw new Error('The presentation is not on this device yet. Connect to the internet once to download it.');
  return fetchDeck(drive, deck);
}

/** After a sync, phones download presentations they do not have yet, so they work offline in calls. */
export async function prefetchDecks(drive: DriveAdapter, products: Product[]): Promise<void> {
  if (Platform.OS === 'web') return;
  const missing: DeckRef[] = [];
  for (const p of products) if (p.active && p.deck && !(await cachedDeck(p.deck))) missing.push(p.deck);
  if (!missing.length) return;
  const files = await drive.list();
  for (const d of missing) {
    const f = files.find((x) => x.name === d.file);
    if (f) await fetchDeck(drive, d, f.id).catch((e) => console.warn('Presentation not downloaded', e));
  }
}
