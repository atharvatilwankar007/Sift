import { useCallback, useEffect, useRef, useState } from 'react';

/* Minimal typings for the Web Speech API (Chrome ships it as webkitSpeechRecognition). */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; length: number; [i: number]: SRAlternative }
interface SREvent { results: { length: number; [i: number]: SRResult } }
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

const Ctor: (new () => SR) | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition as new () => SR) ??
      ((window as unknown as Record<string, unknown>).webkitSpeechRecognition as new () => SR)
    : undefined;

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/**
 * Voice capture. `onPulse` fires whenever new words arrive so the orb can react.
 * Chrome stops listening after a pause, so we transparently restart until the user taps stop.
 */
export function useSpeech(onPulse: () => void) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SR | null>(null);
  const want = useRef(false);
  const committed = useRef('');
  const session = useRef('');
  const pulse = useRef(onPulse);
  pulse.current = onPulse;

  const join = (a: string, b: string) => (a && b ? `${a.trimEnd()} ${b.trimStart()}` : a || b);

  const startSession = useCallback(() => {
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let s = '';
      if (isAndroid) {
        // Android Chrome repeats earlier results cumulatively; the last one holds the whole utterance.
        s = e.results[e.results.length - 1][0].transcript;
      } else {
        for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      }
      session.current = s;
      setText(join(committed.current, s));
      pulse.current();
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        want.current = false;
        setError('Microphone access is blocked. Allow it in your browser settings.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(`Voice error: ${e.error}`);
      }
    };
    r.onend = () => {
      committed.current = join(committed.current, session.current);
      session.current = '';
      if (want.current) {
        try {
          r.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setListening(false);
    };
    rec.current = r;
    r.start();
  }, []);

  const start = useCallback(() => {
    if (!Ctor) {
      setError('Voice isn’t supported in this browser. Type instead, or use Chrome.');
      return;
    }
    setError(null);
    committed.current = text;
    session.current = '';
    want.current = true;
    setListening(true);
    try {
      startSession();
    } catch {
      setListening(false);
    }
  }, [startSession, text]);

  const stop = useCallback(() => {
    want.current = false;
    rec.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    want.current = false;
    rec.current?.abort();
    committed.current = '';
    session.current = '';
    setText('');
    setListening(false);
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { text, setText, listening, start, stop, reset, error, supported: !!Ctor };
}
