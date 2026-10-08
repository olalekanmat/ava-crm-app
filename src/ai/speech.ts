/**
 * Speech to text on the web: the browser's own speech recognition (Chrome, Edge, Safari).
 * The phone version is speech.native.ts. Both export the same API.
 */
export interface SpeechHandlers {
  /** Words recognised so far in the current phrase (may still change). */
  onPartial(text: string): void;
  /** A finished phrase. */
  onFinal(text: string): void;
  onEnd(): void;
  onError(message: string): void;
}
export interface SpeechSession {
  stop(): void;
  abort(): void;
}

/** Shown when this device or browser cannot turn speech into text. */
export const UNSUPPORTED_MESSAGE = 'Voice input is not available in this browser. Use Chrome, Edge or Safari, or type instead.';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function ctor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechSupported(): boolean {
  return !!ctor();
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site in your browser settings, or type instead.',
  'service-not-allowed': 'Speech recognition is blocked in this browser. Type instead.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection in this browser.',
  'language-not-supported': 'Speech recognition does not support your language setting.',
};

export async function startSpeech(h: SpeechHandlers): Promise<SpeechSession> {
  const C = ctor();
  if (!C) throw new Error(UNSUPPORTED_MESSAGE);
  const r = new C();
  r.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    let partial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) h.onFinal(res[0].transcript.trim());
      else partial += res[0].transcript;
    }
    h.onPartial(partial.trim());
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    h.onError(ERRORS[e.error] ?? `Voice input stopped (${e.error}).`);
  };
  r.onend = () => h.onEnd();
  r.start();
  return { stop: () => r.stop(), abort: () => r.abort() };
}
