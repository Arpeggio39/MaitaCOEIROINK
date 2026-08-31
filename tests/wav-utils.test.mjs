import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStandardWav, concatWavBuffers, parseWav } from '../renderer/js/wav-utils.mjs';

test('複数フレーズのPCMを順番どおり1つの標準WAVへ結合する', () => {
  const first = buildStandardWav(44100, 1, 16, new Uint8Array([1, 2, 3, 4]));
  const second = buildStandardWav(44100, 1, 16, new Uint8Array([5, 6]));
  const parsed = parseWav(concatWavBuffers([first, second]));

  assert.equal(parsed.audioFormat, 1);
  assert.equal(parsed.sampleRate, 44100);
  assert.equal(parsed.numChannels, 1);
  assert.equal(parsed.bitsPerSample, 16);
  assert.deepEqual([...parsed.pcm], [1, 2, 3, 4, 5, 6]);
});

test('形式が異なるフレーズは壊れた結合WAVにせずエラーにする', () => {
  const first = buildStandardWav(44100, 1, 16, new Uint8Array([1, 2]));
  const second = buildStandardWav(48000, 1, 16, new Uint8Array([3, 4]));
  assert.throws(() => concatWavBuffers([first, second]), /WAV 形式が一致しません/);
});
