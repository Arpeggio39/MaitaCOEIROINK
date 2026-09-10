import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecordedMotion, curveValueAt, sampleRecordedMotion } from '../renderer/js/recorded-motion.mjs';
const motion = (Segments, id = 'ParamAngleX', target = 'Parameter') => ({ Version: 3, Meta: { Duration: 2 }, Curves: [{ Id: id, Target: target, Segments }] });
test('口の開閉とモデルLipSyncだけを除外し口形・目・体・不透明度は保持', () => {
  const data = motion([0, 0, 0, 2, 1]);
  data.Curves = [ ['Parameter','ParamMouthOpenY'], ['Model','LipSync'], ['Parameter','ParamMouthForm'], ['Parameter','ParamEyeLOpen'], ['Parameter','ParamBodyAngleX'], ['PartOpacity','PartArm'], ['Model','Opacity'] ].map(([Target,Id])=>({Target,Id,Segments:[0,0.7]}));
  const before = JSON.stringify(data);
  const sampled = sampleRecordedMotion(parseRecordedMotion(data), 1);
  assert.deepEqual(sampled.map(c=>c.id), ['ParamMouthForm','ParamEyeLOpen','ParamBodyAngleX','PartArm','Opacity']);
  assert.ok(sampled.every(c=>c.value===0.7)); assert.equal(JSON.stringify(data),before);
});
test('直線・ステップ・逆ステップと境界', () => {
  for (const [type, expected] of [[0,5],[2,0],[3,10]]) {
    const curve = parseRecordedMotion(motion([0,0,type,2,10])).curves[0];
    assert.equal(curveValueAt(curve,1),expected); assert.equal(curveValueAt(curve,2),10);
  }
});
test('時間方向が均等でないベジェも時間を逆算して評価', () => {
  const curve = parseRecordedMotion(motion([0,0,1,0.1,0,0.2,1,2,1])).curves[0];
  // At u=0.5, x=0.3625 and y=0.5 (linear time interpolation would be wrong).
  assert.ok(Math.abs(curveValueAt(curve,0.3625)-0.5)<1e-6);
});
test('ループか最後の姿勢維持を選べる', () => {
  const parsed = parseRecordedMotion(motion([0,0,0,2,10]));
  assert.equal(sampleRecordedMotion(parsed,2.5,true)[0].value,2.5);
  assert.equal(sampleRecordedMotion(parsed,2.5,false)[0].value,10);
});
test('破損データ・重複・無限値・時間逆転を拒否', () => {
  for (const segments of [[0,1,7,2,1],[0,1,1,0.5,0],[0,0,0,0,1],[0,NaN],[0,1,0,3,1]]) {
    assert.throws(()=>parseRecordedMotion(motion(segments)));
  }
  const data=motion([0,0]); data.Curves.push(data.Curves[0]); assert.throws(()=>parseRecordedMotion(data));
});
