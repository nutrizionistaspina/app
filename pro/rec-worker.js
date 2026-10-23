/* Trascrizione sul dispositivo per il registratore di NutriLab Pro.
   Whisper (transformers.js 3.8.1, copia locale in /vendor/tjs). L'audio arriva qui dalla pagina, viene trascritto e scartato:
   nessuna rete, salvo lo scaricamento del modello la prima volta (file pubblici, poi restano nella cache del browser). */
import { pipeline, env } from '../vendor/tjs/transformers.min.js';
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/tjs/', import.meta.url).href;
const MODELS = { base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };
const OPT = { language: 'italian', task: 'transcribe' };
let asr = null, chain = Promise.resolve();
async function load(size, nogpu) {
  const id = MODELS[size] || MODELS.base, tries = [];
  try { if (!nogpu && self.navigator && navigator.gpu && await navigator.gpu.requestAdapter()) tries.push({ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } }); } catch (e) { /* niente WebGPU */ }
  tries.push({ device: 'wasm', dtype: 'q8' });
  let last = null;
  for (const o of tries) {
    try {
      asr = await pipeline('automatic-speech-recognition', id, { ...o, progress_callback: (p) => postMessage({ t: 'prog', p }) });
      await asr(new Float32Array(16000), OPT); /* prova a vuoto: prepara il modello */
      postMessage({ t: 'ready', device: o.device, size });
      return;
    } catch (e) { last = e; asr = null; }
  }
  postMessage({ t: 'err', m: String((last && last.message) || last || 'errore') });
}
self.onmessage = (e) => {
  const d = e.data || {};
  if (d.t === 'load') { chain = chain.then(() => load(d.size, !!d.nogpu)); return; }
  if (d.t === 'seg') {
    chain = chain.then(async () => {
      if (!asr) { postMessage({ t: 'seg', i: d.i, text: '', err: 'modello non pronto' }); return; }
      const t0 = performance.now();
      try { const a = d.audio instanceof Int16Array ? Float32Array.from(d.audio, (v) => v / 32768) : d.audio; const r = await asr(a, { ...OPT, chunk_length_s: 30, stride_length_s: 5 }); postMessage({ t: 'seg', i: d.i, text: String((r && r.text) || '').trim(), ms: performance.now() - t0 }); }
      catch (err) { postMessage({ t: 'seg', i: d.i, text: '', err: String((err && err.message) || err) }); }
    });
  }
};
