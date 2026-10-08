import { useCallback, useEffect, useRef, useState } from 'react';
import { speechSupported, startSpeech, UNSUPPORTED_MESSAGE, type SpeechSession } from './speech';

export interface Dictation {
  /** This device can turn speech into text in the app. */
  supported: boolean;
  listening: boolean;
  /** Words heard in the current phrase, not yet final. */
  interim: string;
  error?: string;
  start(): Promise<void>;
  stop(): void;
  toggle(): void;
}

/**
 * Speech to text. Each finished phrase goes to `onText`; the caller decides where it goes
 * (usually appended to a text field). Works without AI and, on phones, often offline.
 */
export function useDictation(onText: (text: string) => void, onError?: (message: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string>();
  const session = useRef<SpeechSession | null>(null);
  const starting = useRef(false);
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTextRef.current = onText;
    onErrorRef.current = onError;
  });
  const [supported] = useState(() => {
    try {
      return speechSupported();
    } catch {
      return false;
    }
  });

  const stop = useCallback(() => {
    session.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (session.current || starting.current) return;
    setError(undefined);
    if (!supported) {
      setError(UNSUPPORTED_MESSAGE);
      onErrorRef.current?.(UNSUPPORTED_MESSAGE);
      return;
    }
    starting.current = true;
    let ended = false;
    try {
      setListening(true);
      const s = await startSpeech({
        onPartial: setInterim,
        onFinal: (t) => t && onTextRef.current(t),
        onEnd: () => {
          ended = true;
          session.current = null;
          setListening(false);
          setInterim('');
        },
        onError: (m) => {
          setError(m);
          onErrorRef.current?.(m);
        },
      });
      // It may already have ended (an error right away); then there is nothing to stop.
      if (!ended) session.current = s;
    } catch (e) {
      session.current = null;
      setListening(false);
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      onErrorRef.current?.(m);
    } finally {
      starting.current = false;
    }
  }, [supported]);

  // Stop listening when the screen closes.
  useEffect(() => () => session.current?.abort(), []);

  return { supported, listening, interim, error, start, stop, toggle: () => (session.current ? stop() : void start()) };
}

/** Adds dictated text to what is already there, with a space or new sentence as needed. */
export function appendText(current: string, add: string): string {
  const a = add.trim();
  if (!a) return current;
  const c = current.replace(/\s+$/, '');
  if (!c) return a.charAt(0).toUpperCase() + a.slice(1);
  return /[.!?]$/.test(c) ? `${c} ${a.charAt(0).toUpperCase()}${a.slice(1)}` : `${c} ${a}`;
}
