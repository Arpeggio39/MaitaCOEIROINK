import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLipEnvelope } from '../renderer/js/lip-sync.mjs';
import { createNativeLipEnvelope } from '../renderer/js/native-lip-sync.mjs';
const module = await WebAssembly.compile(await readFile(new URL('../renderer/wasm/lip-energy.wasm', import.meta.url)));
for (const sampleRate of [22050, 44100, 48000]) {
  test(`C SIMD matches reference for stereo speech, silence and partial windows at ${sampleRate} Hz`, async () => {
    const a = Float32Array.from({ length: sampleRate * 2 + 7 }, (_, i) => i < 4000 ? 0 : Math.sin(i * .073) * .13);
    const b = a.map(x => -x);
    const expected = createLipEnvelope([a,b], sampleRate);
    const actual = await createNativeLipEnvelope([a,b], sampleRate, 100, module);
    assert.equal(actual.duration, expected.duration);
    assert.equal(actual.values.length, expected.values.length);
    actual.values.forEach((value, i) => assert.ok(Math.abs(value - expected.values[i]) < 1e-6));
    assert.ok(actual.values.some(x => x > .5));
  });
}
test('C SIMD handles empty and short channels without reading past input', async () => {
  for (const length of [0, 1, 3, 4, 5]) {
    const channels = [new Float32Array(length).fill(.1)];
    assert.deepEqual(await createNativeLipEnvelope(channels, 48000, 100, module), createLipEnvelope(channels, 48000));
  }
});
