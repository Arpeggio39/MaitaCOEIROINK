import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechCues, narrationSegments, EXPRESSION_DEFAULTS } from '../renderer/js/speech-cues.mjs';
import { expressionAt, blendExpressionValue } from '../renderer/js/speech-expression.mjs';

const envelope = (duration = 12) => ({ values: new Float32Array(duration * 100).fill(.6), rate: 100, duration });

test('actual synthesis durations anchor cues even when text lengths and speaking rates differ', () => {
  const segments = narrationSegments([
    { text: '今日は長い説明から始めます。これは前置きです。', duration: 2 },
    { text: 'ありがとう。', duration: 7 },
    { text: 'どうしてですか？', duration: 3 },
  ]);
  const cues = createSpeechCues(segments.map(s => s.text).join(''), envelope(), segments);
  const thanks = cues.find(c => c.kind === 'thanks'), question = cues.find(c => c.kind === 'question');
  assert(thanks.time >= 2 && thanks.time < 9);
  assert(question.time >= 9 && question.time < 12);
  assert.equal(segments.at(-1).end, 12);
});

test('negated feelings and silent segments do not invent emotional reactions', () => {
  for (const text of ['嬉しくない。', '楽しくありません。', '悲しくはない。', 'すごいとは思わない。']) {
    assert.equal(createSpeechCues(text, envelope()).length, 0, text);
  }
  assert.equal(createSpeechCues('ありがとう。', { ...envelope(), values: new Float32Array(1200) }).length, 0);
  const silentFirst = envelope(); silentFirst.values.fill(0, 0, 400);
  const segments = [{ text: 'ありがとう。', start: 0, end: 4 }, { text: 'なぜ？', start: 4, end: 12 }];
  assert.deepEqual(createSpeechCues('ありがとう。なぜ？', silentFirst, segments).map(c => c.kind), ['question']);
});

test('overlapping emotions cross-fade continuously and release every face control', () => {
  const cues = [
    { time: 1, pose: { ParamMouthForm: .8, ParamEyeLSmile: .8 }, hold: 1.1, release: .8 },
    { time: 1.8, pose: { ParamMouthForm: -.6, ParamBrowLY: -.3 }, hold: 1.1, release: .8 },
  ];
  const effective = t => Object.fromEntries(Object.entries(EXPRESSION_DEFAULTS).map(([id, neutral]) => {
    const item = expressionAt(cues, t)[id];
    return [id, item ? blendExpressionValue(id, neutral, item) : neutral];
  }));
  let previous = effective(0);
  for (let i = 1; i <= 300; i++) {
    const pose = effective(i / 60);
    for (const id of Object.keys(pose)) assert(Math.abs(pose[id] - previous[id]) < .12, `${id} snapped`);
    previous = pose;
  }
  assert(effective(1.4).ParamMouthForm > .5);
  assert(effective(2.9).ParamMouthForm < -.4);
  assert.deepEqual(effective(5), EXPRESSION_DEFAULTS);
});

test('eyelid expressions preserve a fully closed blink', () => {
  const cues = createSpeechCues('嬉しい。', envelope());
  const eye = expressionAt(cues, .5).ParamEyeLOpen;
  assert.equal(blendExpressionValue('ParamEyeLOpen', 0, eye), 0);
  assert(blendExpressionValue('ParamEyeLOpen', .2, eye) <= .2);
});
