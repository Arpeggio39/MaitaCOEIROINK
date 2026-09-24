import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechMotion, speechPoseAt, MOTION_LIMITS } from '../renderer/js/speech-motion.mjs';
import { createSpeechCues } from '../renderer/js/speech-cues.mjs';
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
 const body=plan.frames.slice(60,10*60).map(p=>p.ParamBodyAngleY);
 assert(Math.max(...body)-Math.min(...body)>1.5);
 assert(Math.abs(speechPoseAt(plan,13).ParamBodyAngleY)<.5);
 assert.deepEqual(speechPoseAt(plan,-1),plan.frames[0]);
 assert.deepEqual(speechPoseAt(plan,1000),plan.frames.at(-1));
});

test('gratitude, a question and explanation produce distinct coordinated gestures', () => {
 const env=audio();
 const segments=[{text:'ありがとう。',start:1,end:3},{text:'どうして？',start:3,end:5},{text:'例えば。',start:6.5,end:10.5}];
 const cues=createSpeechCues('ありがとう。どうして？例えば。',env,segments);
 const plan=createSpeechMotion(env,17,cues);
 assert(speechPoseAt(plan,1.5).ParamAngleY < -3);
 assert(speechPoseAt(plan,1.5).ParamBodyAngleY < -3);
 assert(speechPoseAt(plan,1.5).ParamPositionZ < -2);
 assert(Math.abs(speechPoseAt(plan,3.6).ParamAngleZ)>2);
 const presenting=speechPoseAt(plan,7.1);
 assert(Math.abs(presenting.Param80-presenting.Param84)>.12,'arms must not mirror each other');
 for(const frame of plan.frames) for(const [key,limit] of Object.entries(MOTION_LIMITS)) assert(Math.abs(frame[key])<=limit,key);
 for(const beat of plan.beats) assert(!cues.some(cue=>beat.time>cue.time-.65&&beat.time<cue.time+cue.hold+.6));
});

test('a purposeful glance starts before the head follows', () => {
 const env={values:new Float32Array(800).fill(.6),rate:100,duration:8};
 const cues=[{kind:'thinking',time:2,hold:1,end:3}];
 const plan=createSpeechMotion(env,17,cues);
 const onset=plan.gaze.find(point=>point.x!==0).time;
 const before=speechPoseAt(plan,onset),eyes=speechPoseAt(plan,onset+.14),head=speechPoseAt(plan,onset+.7);
 assert(Math.abs(eyes.ParamEyeBallX-before.ParamEyeBallX)>.03);
 assert(Math.abs(eyes.ParamAngleX-before.ParamAngleX)<.05);
 assert(Math.abs(head.ParamAngleX-before.ParamAngleX)>1);
});

test('long silence keeps breathing but suppresses speech and restless body motion', () => {
 const env={values:new Float32Array(3000),rate:100,duration:30};
 env.values.fill(.7,100,1300);
 const plan=createSpeechMotion(env,42);
 const energy=(start,end)=>{
  let total=0;
  for(let i=start*60+1;i<end*60;i++) for(const key of ['ParamAngleX','ParamAngleZ','ParamBodyAngleX','Param80','Param84']) total+=Math.abs(plan.frames[i][key]-plan.frames[i-1][key]);
  return total/(end-start);
 };
 assert(energy(18,28)<energy(2,12)*.3);
 const breaths=plan.frames.slice(18*60,28*60).map(p=>p.ParamBreath);
 assert(Math.max(...breaths)-Math.min(...breaths)>.1);
 assert(plan.blinks.some(blink=>blink.time>18));
});

test('even a short line visibly shifts the torso and head before returning to rest', () => {
 const env={values:new Float32Array(600),rate:100,duration:6};
 env.values.fill(.65,10,240);
 const plan=createSpeechMotion(env,42);
 const moving=plan.frames.slice(60,140);
 assert(Math.max(...moving.map(p=>Math.abs(p.ParamBodyAngleX)))>2);
 assert(Math.max(...moving.map(p=>Math.abs(p.ParamPositionX2)))>3);
 assert(Math.max(...moving.map(p=>Math.abs(p.ParamAngleX)))>3);
 const rest=speechPoseAt(plan,5);
 assert(Math.abs(rest.ParamBodyAngleX)<.7);
 assert(Math.abs(rest.ParamBodyAngleY)<.5);
});
