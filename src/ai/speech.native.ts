/**
 * Speech to text on phones, through the expo-speech-recognition native module. The module is
 * looked up optionally: in an app build without it (an older version, or Expo Go) voice input
 * reports itself unavailable and the rep uses the keyboard's microphone instead. Same API as speech.ts.
 */
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';
import { Platform } from 'react-native';
import type { SpeechHandlers, SpeechSession } from './speech';

export type { SpeechHandlers, SpeechSession } from './speech';

export const UNSUPPORTED_MESSAGE = 'Voice input is not available in this version of the app. Tap the microphone on your keyboard to dictate instead.';

let mod: ExpoSpeechRecognitionModuleType | null | undefined;
function getModule(): ExpoSpeechRecognitionModuleType | null {
  if (mod === undefined) {
    try {
      mod = requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>('ExpoSpeechRecognition');
    } catch {
      mod = null;
    }
  }
  return mod;
}

export function speechSupported(): boolean {
  const m = getModule();
  if (!m) return false;
  try {
    return m.isRecognitionAvailable();
  } catch {
    return false;
  }
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Ava CRM is not allowed to use the microphone or speech recognition. Turn it on in your phone settings, or type instead.',
  'service-not-allowed': 'Speech recognition is not available on this phone. Tap the microphone on your keyboard instead.',
  'language-not-supported': 'Speech recognition does not support your language setting.',
  'audio-capture': 'The microphone could not be used.',
  network: 'Speech recognition needs an internet connection on this phone.',
  busy: 'Speech recognition is busy. Try again in a moment.',
};

export async function startSpeech(h: SpeechHandlers): Promise<SpeechSession> {
  const m = getModule();
  if (!m || !speechSupported()) throw new Error(UNSUPPORTED_MESSAGE);
  const perm = await m.requestPermissionsAsync();
  if (!perm.granted) throw new Error(ERRORS['not-allowed']);

  let partial = '';
  const subs = [
    m.addListener('result', (e) => {
      const text = e.results[0]?.transcript?.trim() ?? '';
      if (e.isFinal) {
        partial = '';
        if (text) h.onFinal(text);
        h.onPartial('');
      } else {
        partial = text;
        h.onPartial(text);
      }
    }),
    m.addListener('error', (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'speech-timeout') return;
      h.onError(ERRORS[e.error] ?? e.message ?? 'Voice input stopped.');
    }),
    m.addListener('end', () => {
      // A phrase that never became final is kept rather than lost.
      if (partial) h.onFinal(partial);
      partial = '';
      for (const s of subs) s.remove();
      h.onEnd();
    }),
  ];
  try {
    m.start({
      lang: 'en-US',
      interimResults: true,
      // Android 12 and older stop after one phrase; continuous needs Android 13.
      continuous: Platform.OS === 'ios' || (typeof Platform.Version === 'number' && Platform.Version >= 33),
      addsPunctuation: true,
    });
  } catch (e) {
    for (const s of subs) s.remove();
    throw e;
  }
  return { stop: () => m.stop(), abort: () => m.abort() };
}
