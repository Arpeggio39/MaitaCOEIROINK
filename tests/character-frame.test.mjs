import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCharacterFrame } from '../renderer/js/character-frame.mjs';

test('fits visible pixels with motion margin and even MP4 dimensions', () => {
  const pixels = new Uint8ClampedArray(200 * 300 * 4);
  for(let y=20;y<280;y++) for(let x=50;x<151;x++) pixels[(y*200+x)*4+3]=255;
  const fit=fitCharacterFrame(pixels,200,300);
  assert.equal(fit.width,132);
  assert.equal(fit.height,276);
  assert.equal(fit.offsetX,-35);
  assert.equal(fit.offsetY,-12);
  assert.equal(fit.width%2,0);
  assert.equal(fit.height%2,0);
});
test('rejects an empty render instead of exporting a blank video', () => {
  assert.throws(()=>fitCharacterFrame(new Uint8ClampedArray(16),2,2),/描画範囲/);
});
