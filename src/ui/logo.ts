import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX = 320;

/**
 * Lets the admin pick a logo image and returns it shrunk to fit 320×320 as a PNG data URI
 * (keeps transparency, typically 10–60 KB), so it can travel inside the company's journal.
 */
export async function pickLogo(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const uri = res.assets[0].uri;
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const scale = Math.min(1, MAX / Math.max(original.width, original.height));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize({ width: Math.round(original.width * scale), height: Math.round(original.height * scale) });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.PNG, base64: true });
  if (!out.base64) throw new Error('Could not read that image.');
  const uriOut = `data:image/png;base64,${out.base64}`;
  if (uriOut.length > 400_000) throw new Error('That image is too detailed for a logo. Try a simpler PNG or JPEG.');
  return uriOut;
}
