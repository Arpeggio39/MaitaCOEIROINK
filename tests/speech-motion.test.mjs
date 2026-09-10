import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechMotion, speechPoseAt, MOTION_LIMITS } from '../renderer/js/speech-motion.mjs';
function audio() {
 const values = new Float32Array(1400);
 for (let i=100;i<500;i++) values[i]=0.45+0.35*Math.sin(i*0.11)**2;
 for (let i=650;i<1050;i++) values[i]=0.4+0.4*Math.sin(i*0.09)**2;
 return {values,rate:100,duration:14};
}
test('audio creates phrase-timed gestures but silence never invents speech gestures',()=>{
 const plan=createSpeechMotion(audio());
 assert.equal(plan.phrases.length,2);
 assert(plan.beats.length>=2);
 for(const beat of plan.beats) assert(plan.phrases.some(p=>beat.time>=p.start&&beat.time<=p.end));
 const silent=createSpeechMotion({values:new Float32Array(1400),rate:100,duration:14});
 assert.equal(silent.beats.length,0);
 assert(silent.blinks.length>0);
});
test('the same narration produces the same performance regardless of sampling order',()=>{
 const a=createSpeechMotion(audio()),b=createSpeechMotion(audio());
 for(const t of [0,9.45,2.1,5,14]) assert.deepEqual(speechPoseAt(a,t),speechPoseAt(b,t));
 assert.notDeepEqual(speechPoseAt(a,2),speechPoseAt(a,8));
});
test('poses stay within rig budgets and move continuously without per-frame jitter',()=>{
 const plan=createSpeechMotion(audio());
 for(let i=1;i<plan.frames.length;i++) for(const [key,limit] of Object.entries(MOTION_LIMITS)) {
  const value=plan.frames[i][key];assert(Number.isFinite(value));assert(Math.abs(value)<=limit);
  if(!/Eye[LR]Open/.test(key)) assert(Math.abs(value-plan.frames[i-1][key])<0.6,`${key} jumps`);
 }
});
test('blinks close and reopen, while body movement responds to speech and pauses',()=>{
 const plan=createSpeechMotion(audio());
 assert(plan.frames.some(p=>p.ParamEyeLOpen<0.1));
 assert(plan.frames.some(p=>p.ParamEyeLOpen>0.99));
 assert(speechPoseAt(plan,3).ParamBodyAngleY>speechPoseAt(plan,13).ParamBodyAngleY+0.2);
 assert.deepEqual(speechPoseAt(plan,-1),plan.frames[0]);
 assert.deepEqual(speechPoseAt(plan,1000),plan.frames.at(-1));
});
