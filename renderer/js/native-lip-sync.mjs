import { createLipEnvelope, finishLipEnvelope } from './lip-sync.mjs';
let compiled;
function loadModule() {
  return compiled ??= fetch(new URL('../wasm/lip-energy.wasm', import.meta.url))
    .then(response => { if (!response.ok) throw new Error('WASM load failed'); return response.arrayBuffer(); })
    .then(bytes => WebAssembly.compile(bytes));
}

// A separate instance per task releases large audio scratch memory after completion.
// The module is cached; no runtime compiler, DLL, or extra worker is required.
export async function createNativeLipEnvelope(channels, sampleRate, rate = 100, module) {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('音声のサンプルレートが不正です。');
  }
  const length = channels[0].length;
  if (channels.some(channel => channel.length !== length)) throw new Error('音声チャンネルの長さが一致しません。');
  let instance;
  try { instance = await WebAssembly.instantiate(module || await loadModule()); }
  catch { return createLipEnvelope(channels, sampleRate, rate); }
  const { memory, accumulate, __heap_base } = instance.exports;
  const frames = Math.ceil(length / sampleRate * rate);
  const input = Number(__heap_base.value);
  const output = Math.ceil((input + length * 4) / 8) * 8;
  try {
    const extra = Math.ceil((output + frames * 8 - memory.buffer.byteLength) / 65536);
    if (extra > 0) memory.grow(extra);
  } catch { return createLipEnvelope(channels, sampleRate, rate); }
  const samples = new Float32Array(memory.buffer, input, length);
  const energy = new Float64Array(memory.buffer, output, frames);
  for (const channel of channels) {
    samples.set(channel);
    accumulate(input, output, length, sampleRate, rate, frames);
  }
  const values = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    const start = Math.floor(frame * sampleRate / rate);
    const end = Math.min(length, Math.floor((frame + 1) * sampleRate / rate));
    values[frame] = Math.sqrt(energy[frame] / Math.max(1, (end - start) * channels.length));
  }
  return finishLipEnvelope(values, rate, length / sampleRate);
}
