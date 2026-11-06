import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkerIn, WorkerOut } from './whisper.worker';

/*
 * Voice capture: record the whole ramble with the microphone (no beeps, no cut-offs at pauses),
 * then transcribe it on the phone with Whisper. `onLevel` gets the live loudness (0..1) for the orb.
 */

export type VoicePhase = 'idle' | 'recording' | 'transcribing';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
const progressListeners = new Set<(p: { loaded: number; total: number; ready: boolean }) => void>();
let modelReady = false;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const m = ev.data;
    if (m.type === 'progress') progressListeners.forEach((l) => l({ loaded: m.loaded, total: m.total, ready: false }));
    else if (m.type === 'ready') {
      modelReady = true;
      try {
        localStorage.setItem('sift.voiceCached', '1');
      } catch {
        /* ignore */
      }
      progressListeners.forEach((l) => l({ loaded: 1, total: 1, ready: true }));
    } else if (m.type === 'result') {
      pending.get(m.id)?.resolve(m.text);
      pending.delete(m.id);
    } else if (m.type === 'error') {
      if (m.id != null) {
        pending.get(m.id)?.reject(new Error(m.message));
        pending.delete(m.id);
      } else {
        pending.forEach((p) => p.reject(new Error(m.message)));
        pending.clear();
      }
    }
  };
  return worker;
}

function preloadModel() {
  getWorker().postMessage({ type: 'load' } satisfies WorkerIn);
}

function transcribe(audio: Float32Array): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'transcribe', id, audio } satisfies WorkerIn, [audio.buffer]);
  });
}

/** Decode the recording and resample to 16 kHz mono, which Whisper expects. */
async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(buf);
    if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
    const a = audio.getChannelData(0);
    const b = audio.getChannelData(1);
    const mono = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) mono[i] = (a[i] + b[i]) / 2;
    return mono;
  } finally {
    ctx.close().catch(() => {});
  }
}

// Dev-only hook for testing transcription with an audio file (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__siftTranscribeUrl = async (url: string) =>
    transcribe(await toPcm16k(await (await fetch(url)).blob()));
}

export const voiceSupported =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined' &&
  typeof Worker !== 'undefined';

const MAX_MS = 5 * 60_000;

export function useVoice(onLevel: (level: number) => void) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [download, setDownload] = useState<{ pct: number; ready: boolean }>({ pct: 0, ready: modelReady });

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const level = useRef(onLevel);
  level.current = onLevel;

  useEffect(() => {
    const l = (p: { loaded: number; total: number; ready: boolean }) =>
      setDownload({ pct: p.ready ? 100 : p.total ? Math.round((p.loaded / p.total) * 100) : 0, ready: p.ready });
    progressListeners.add(l);
    // Model already downloaded on an earlier visit: warm it up now so transcription is quick.
    try {
      if (localStorage.getItem('sift.voiceCached') === '1') preloadModel();
    } catch {
      /* ignore */
    }
    return () => {
      progressListeners.delete(l);
    };
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  }, []);

  const finish = useCallback(async () => {
    const blob = new Blob(chunks.current, { type: rec.current?.mimeType || 'audio/webm' });
    chunks.current = [];
    rec.current = null;
    cleanup();
    if (blob.size < 1000) {
      setPhase('idle');
      return;
    }
    setPhase('transcribing');
    try {
      const pcm = await toPcm16k(blob);
      const said = await transcribe(pcm);
      const clean = said.replace(/\[(BLANK_AUDIO|MUSIC|NOISE)[^\]]*\]/gi, '').trim();
      if (clean) setText((t) => (t.trim() ? `${t.trim()} ${clean}` : clean));
      else setError('Didn’t catch anything. Try again a bit closer to the mic.');
    } catch (e) {
      console.error(e);
      setError('Couldn’t transcribe that. Check your connection (first use downloads the voice model) and try again.');
    } finally {
      setPhase('idle');
    }
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!voiceSupported) {
      setError('Voice isn’t supported in this browser. Type instead, or use Chrome.');
      return;
    }
    setError(null);
    preloadModel(); // download the model in parallel while you talk
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      stream.current = s;

      // live loudness for the orb
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        level.current(Math.min(1, Math.sqrt(sum / data.length) * 4));
        raf.current = requestAnimationFrame(tick);
      };
      tick();

      const r = new MediaRecorder(s);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => void finish();
      r.start(1000);
      rec.current = r;
      started.current = Date.now();
      setElapsed(0);
      timer.current = window.setInterval(() => {
        const ms = Date.now() - started.current;
        setElapsed(ms);
        if (ms >= MAX_MS) rec.current?.stop();
      }, 250);
      setPhase('recording');
    } catch (e) {
      cleanup();
      const name = (e as DOMException)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'Microphone access is blocked. Allow it for this site in Chrome settings.'
          : 'Couldn’t start the microphone.',
      );
    }
  }, [cleanup, finish]);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }, []);

  const reset = useCallback(() => {
    setText('');
    setError(null);
  }, []);

  useEffect(
    () => () => {
      if (rec.current && rec.current.state !== 'inactive') {
        rec.current.onstop = null;
        rec.current.stop();
      }
      cleanup();
    },
    [cleanup],
  );

  return { text, setText, phase, start, stop, reset, error, elapsed, download, supported: voiceSupported };
}
