import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Web: downloads the file. Phone: writes it to the cache and opens the share sheet (email, Drive, Files…). */
export async function saveTextFile(name: string, content: string, mimeType = 'text/csv'): Promise<void> {
  if (Platform.OS === 'web') {
    // BOM so Excel opens UTF-8 CSV files correctly.
    const blob = new Blob(['﻿', content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write('﻿' + content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, UTI: 'public.comma-separated-values-text' });
  } else {
    throw new Error(`Sharing is not available. The file was saved to ${file.uri}`);
  }
}

/** Lets the user pick a CSV/text file and returns its name and contents, or null when cancelled. */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
  return { name: asset.name, text };
}
