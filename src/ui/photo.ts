import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { MAX_PHOTO_CHARS } from '@/data/mutations';

const SIZE = 192;
/** Photos travel in every device's change log, so keep each one small. */
const MAX_CHARS = 40_000;

/**
 * Takes or picks a profile picture and returns it as a 192×192 JPEG data URI (about 10–20 KB),
 * small enough to travel in the company's data. Returns null when the person cancels.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  let res: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off for Ava CRM. Allow it in your phone’s settings, or choose a photo instead.');
    res = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front });
  } else {
    res = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (res.canceled || !res.assets?.length) return null;
  const { uri, width, height } = res.assets[0];
  const ctx = ImageManipulator.manipulate(uri);
  // Not every device offers the square crop, so centre-crop here too.
  if (width && height && width !== height) {
    const side = Math.min(width, height);
    ctx.crop({ originX: Math.round((width - side) / 2), originY: Math.round((height - side) / 2), width: side, height: side });
  }
  ctx.resize({ width: SIZE, height: SIZE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('Could not read that image.');
  const photo = `data:image/jpeg;base64,${out.base64}`;
  if (photo.length > Math.min(MAX_CHARS, MAX_PHOTO_CHARS)) throw new Error('That photo is too large. Try another one.');
  return photo;
}

/** Slides keep their shape; the long side is at most this many pixels, which reads well on tablets. */
const SLIDE_MAX = 1600;

/**
 * Picks presentation slides (images exported from PowerPoint or PDF, in order) and returns them as
 * JPEG data URIs of about 100–250 KB each. Returns [] when the person cancels.
 */
export async function pickSlides(limit = 40): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true, selectionLimit: limit, quality: 1 });
  if (res.canceled || !res.assets?.length) return [];
  const out: string[] = [];
  for (const a of res.assets.slice(0, limit)) {
    const ctx = ImageManipulator.manipulate(a.uri);
    if (a.width && a.height && Math.max(a.width, a.height) > SLIDE_MAX) ctx.resize(a.width >= a.height ? { width: SLIDE_MAX } : { height: SLIDE_MAX });
    const img = await ctx.renderAsync();
    const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.62, base64: true });
    if (!saved.base64) throw new Error('Could not read one of the images.');
    out.push(`data:image/jpeg;base64,${saved.base64}`);
  }
  return out;
}
