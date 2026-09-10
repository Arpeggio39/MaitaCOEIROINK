import test from 'node:test';
import assert from 'node:assert/strict';
import { createLipEnvelope, mouthAt } from '../renderer/js/lip-sync.mjs';

test('silence stays closed, speech opens, and pauses close the mouth', () => {
  const rate = 48000;
  const samples = new Float32Array(rate * 2);
  for (let i = rate / 2; i < rate; i++) samples[i] = Math.sin(i * 0.05) * 0.25;
  const envelope = createLipEnvelope([samples], rate);
  assert.equal(mouthAt(envelope, 0.2), 0);
  assert.ok(mouthAt(envelope, 0.75) > 0.8);
  assert.equal(mouthAt(envelope, 1.6), 0);
  assert.equal(mouthAt(envelope, 2), 0);
  assert.equal(mouthAt(envelope, -1), 0);
});

test('opposite-phase stereo speech does not cancel the mouth movement', () => {
  const channel = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i * 0.1) * 0.1);
  const inverse = channel.map(value => -value);
  const envelope = createLipEnvelope([channel, inverse], 44100);
  assert.ok(mouthAt(envelope, 0.5) > 0.8);
  assert.equal(mouthAt(envelope, 0.5, 3), 1);
  assert.ok(mouthAt(envelope, 0.5, 0.3) <= 0.3);
});

test('background noise remains closed and short clips are bounded', () => {
  const envelope = createLipEnvelope([new Float32Array(4800).fill(0.001)], 48000);
  assert.equal(mouthAt(envelope, 0.05), 0);
  const short = createLipEnvelope([new Float32Array([0.5])], 48000);
  assert.ok(Number.isFinite(mouthAt(short, 0)));
  assert.equal(mouthAt(short, 1), 0);
});
