/// <reference lib="webworker" />
// On-device speech-to-text with Whisper (Transformers.js). Runs in a worker so the UI stays smooth.
// The model downloads once (~41MB) and is then cached by the browser.
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

env.allowLocalModels = false;

const MODEL = 'onnx-community/whisper-tiny.en';

export type WorkerIn = { type: 'load' } | { type: 'transcribe'; id: number; audio: Float32Array };
export type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };

const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

const progress_callback = (p: { status: string; loaded?: number; total?: number }) => {
  if (p.status === 'progress_total') post({ type: 'progress', loaded: p.loaded ?? 0, total: p.total ?? 0 });
};

async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function create(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (await hasWebGPU()) {
    try {
      // The audio encoder is the heavy part: run it on the phone's GPU. The small text decoder stays on CPU.
      return (await pipeline('automatic-speech-recognition', MODEL, {
        device: { encoder_model: 'webgpu', decoder_model_merged: 'wasm' },
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
        progress_callback,
      })) as AutomaticSpeechRecognitionPipeline;
    } catch (e) {
      console.warn('WebGPU voice model failed, using CPU', e);
    }
  }
  return (await pipeline('automatic-speech-recognition', MODEL, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback,
  })) as AutomaticSpeechRecognitionPipeline;
}

function load() {
  if (!asr) {
    asr = create();
    asr.then(
      () => post({ type: 'ready' }),
      (e) => {
        asr = null;
        post({ type: 'error', message: String(e?.message ?? e) });
      },
    );
  }
  return asr;
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === 'load') {
    load().catch(() => {});
    return;
  }
  try {
    const t = await load();
    const out = await t(msg.audio, { chunk_length_s: 30, stride_length_s: 5 });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
    post({ type: 'result', id: msg.id, text });
  } catch (e) {
    post({ type: 'error', id: msg.id, message: String((e as Error)?.message ?? e) });
  }
};
