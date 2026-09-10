import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneParams } from '../renderer/js/params.js';
import { setMaitaStyleId } from '../renderer/js/state.js';

globalThis.document = { getElementById: () => ({ querySelector: () => null }) };
globalThis.window = { maita: {}, addEventListener() {} };
const { synthesizeLine } = await import('../renderer/js/audio.js');
setMaitaStyleId(302790798);

function entry() {
  return { detail: [[{ phoneme: 'a', hira: 'あ', accent: 1 }]], intonationEditorMode: 'accent' };
}

test('声の高さ・抑揚の変更ではF0を取得してから合成し、通常再生では取得しない', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body });
    if (path === '/v1/predict_with_duration') return Response.json({ wavBase64: 'wav', moraDurations: [], startTrimBuffer: 0, endTrimBuffer: 0.1 });
    if (path === '/v1/estimate_f0') return Response.json({ f0: [0, 220, 221, 0], moraDurations: [{ hira: 'あ', phonemePitches: [{ wavRange: { start: 0, end: 100 } }] }] });
    return new Response('wav');
  });
  for (const params of [{ pitchScale: 0.05 }, { intonationScale: 0.8 }, { pitchScale: -0.1, intonationScale: 1.2 }]) {
    calls.length = 0;
    await synthesizeLine('あ', cloneParams(params), entry());
    assert.deepEqual(calls.filter(c => c.path !== '/').map(c => c.path), ['/v1/predict_with_duration', '/v1/estimate_f0', '/v1/synthesis']);
    assert.deepEqual(calls.at(-1).body.adjustedF0, [0, 220, 221, 0]);
    assert.equal(calls.at(-1).body.sampledIntervalValue, 3);
  }
  calls.length = 0;
  await synthesizeLine('あ', cloneParams(), entry());
  assert.deepEqual(calls.map(c => c.path), ['/v1/synthesis']);
});

test('F0取得失敗時は空のピッチ配列で合成を続けない', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    return new Response('failed', { status: 500 });
  });
  await assert.rejects(synthesizeLine('あ', cloneParams({ pitchScale: 0.1 }), entry()), /ピッチ取得に失敗/);
  assert.ok(!calls.includes('/v1/synthesis'));
});
