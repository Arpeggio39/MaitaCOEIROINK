import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsFromTiles, mergeFrameBounds, frameFromBounds } from '../renderer/js/frame-bounds.mjs';

test('GPU tile summaries preserve inclusive bounds across tile boundaries', () => {
  const bytes = new Uint8Array(16);
  bytes.set([8, 2, 8, 7], 0);
  bytes.set([1, 1, 3, 4], 12);
  assert.deepEqual(boundsFromTiles(bytes, 2, 2), { left: 7, top: 1, right: 10, bottom: 11 });
  assert.equal(boundsFromTiles(new Uint8Array(16), 2, 2), null);
});

test('all-frame union keeps extremes from different poses', () => {
  let bounds = mergeFrameBounds(null, { left: 10, top: 4, right: 20, bottom: 40 });
  bounds = mergeFrameBounds(bounds, { left: -5, top: 12, right: 80, bottom: 30 });
  assert.deepEqual(mergeFrameBounds(bounds, null), { left: -5, top: 4, right: 80, bottom: 40 });
  assert.deepEqual(frameFromBounds(bounds), { width: 94, height: 46, offsetX: 9, offsetY: 0 });
  assert.throws(() => frameFromBounds(null), /透明/);
});
