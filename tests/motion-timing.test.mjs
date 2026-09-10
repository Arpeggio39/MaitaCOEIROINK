import test from 'node:test';
import assert from 'node:assert/strict';
import { alignedMotionTime, clampMotionOffset, wavDuration } from '../renderer/js/motion-timing.mjs';
import { buildStandardWav } from '../renderer/js/wav-utils.mjs';
import { parseRecordedMotion, sampleRecordedMotion } from '../renderer/js/recorded-motion.mjs';
test('開始位置を前後にずらし、区切り出力も全文の時刻を維持する', () => {
  assert.equal(alignedMotionTime(1, 1.5),-.5);
  assert.equal(alignedMotionTime(1, -1.5),2.5);
  assert.equal(alignedMotionTime(1,1.5,5),4.5);
  const motion=parseRecordedMotion({Version:3,Meta:{Duration:8},Curves:[{Target:'Parameter',Id:'ParamAngleX',Segments:[0,0,0,8,16]}]});
  assert.equal(sampleRecordedMotion(motion,alignedMotionTime(1,1.5),true)[0].value,0);
  assert.equal(sampleRecordedMotion(motion,alignedMotionTime(1,1.5,5),true)[0].value,9);
});
test('オフセットを表示範囲内の0.01秒刻みに収める',()=>{
  assert.equal(clampMotionOffset(-100,8,10),-8); assert.equal(clampMotionOffset(100,8,10),10);
  assert.equal(clampMotionOffset(1.234,8,10),1.23);
});
test('WAVの実際のPCM量から長さを取得する',()=>{
 const wav=buildStandardWav(48000,1,16,new Uint8Array(48000*2*3));
 assert.equal(wavDuration(wav),3); assert.throws(()=>wavDuration(wav.slice(0,70)));
});
