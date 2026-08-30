import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ADJUSTED_F0_SAMPLE_INTERVAL,
  buildEstimateF0Payload,
  buildPredictWithDurationPayload,
  buildProsodyPayload,
  buildSynthesisPayload,
  normalizeProcessingAlgorithm,
  parseSpeakersPathVariant,
  parseWorldF0Response,
} from '../renderer/js/coeiroink-contract.mjs';
import { buildDictionaryPayload } from '../renderer/js/dictionary-variants.mjs';
import { cloneParams } from '../renderer/js/params.js';

const openapi = JSON.parse(fs.readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));

function requestSchema(path) {
  const ref = openapi.paths[path].post.requestBody.content['application/json'].schema.$ref;
  return openapi.components.schemas[ref.split('/').at(-1)];
}

function assertTopLevelContract(path, payload) {
  const schema = requestSchema(path);
  for (const key of schema.required || []) {
    assert.ok(Object.hasOwn(payload, key), `${path}: required ${key}`);
  }
  for (const [key, value] of Object.entries(payload)) {
    const property = schema.properties[key];
    assert.ok(property, `${path}: unknown ${key}`);
    if (property.type === 'string') assert.equal(typeof value, 'string', `${path}: ${key}`);
    if (property.type === 'number') assert.equal(typeof value, 'number', `${path}: ${key}`);
    if (property.type === 'integer') assert.ok(Number.isInteger(value), `${path}: ${key}`);
    if (property.type === 'array') assert.ok(Array.isArray(value), `${path}: ${key}`);
  }
}

test('全ての使用中 POST API ペイロードが同梱 OpenAPI と一致する', () => {
  const detail = [[{ phoneme: 't-e', hira: 'て', accent: 1 }]];
  const prosody = buildProsodyPayload('テスト');
  const prediction = buildPredictWithDurationPayload({
    speakerUuid: '24e48b20-c14c-11f0-a12e-0242ac1c000c',
    styleId: 302790798,
    text: 'テスト',
    prosodyDetail: detail,
    speedScale: 1,
  });
  const estimateF0 = buildEstimateF0Payload({
    wavBase64: 'UklGRg==',
    moraDurations: [],
    startTrimBuffer: 0.05,
    endTrimBuffer: 0.1,
  });
  const synthesis = buildSynthesisPayload({
    speakerUuid: prediction.speakerUuid,
    styleId: prediction.styleId,
    text: prediction.text,
    prosodyDetail: detail,
    params: cloneParams({}),
    outputSamplingRate: 44100,
    adjustedF0: [0, 220, 221],
  });
  const dictionary = buildDictionaryPayload([
    { word: 'Arpeggio', yomi: 'アルペジオ', accent: 3 },
  ]);

  assertTopLevelContract('/v1/estimate_prosody', prosody);
  assertTopLevelContract('/v1/estimate_prosody_from_kana', prosody);
  assertTopLevelContract('/v1/predict_with_duration', prediction);
  assertTopLevelContract('/v1/estimate_f0', estimateF0);
  assertTopLevelContract('/v1/synthesis', synthesis);
  assertTopLevelContract('/v1/set_dictionary', dictionary);
});

test('編集済み F0 は公式 UI と同じ3サンプル間隔で合成する', () => {
  const common = {
    speakerUuid: '24e48b20-c14c-11f0-a12e-0242ac1c000c',
    styleId: 302790798,
    text: 'テスト',
    prosodyDetail: [],
    params: cloneParams({}),
    outputSamplingRate: 44100,
  };
  assert.equal(buildSynthesisPayload({ ...common, adjustedF0: [] }).sampledIntervalValue, 0);
  assert.equal(
    buildSynthesisPayload({ ...common, adjustedF0: [0, 220, 221] }).sampledIntervalValue,
    ADJUSTED_F0_SAMPLE_INTERVAL,
  );
});

test('F0 推定には predict_with_duration のトリム情報も引き継ぐ', () => {
  assert.deepEqual(
    buildEstimateF0Payload({
      wavBase64: 'UklGRg==',
      moraDurations: [],
      startTrimBuffer: 0.05,
      endTrimBuffer: 0.1,
    }),
    {
      wavBase64: 'UklGRg==',
      moraDurations: [],
      startTrimBuffer: 0.05,
      endTrimBuffer: 0.1,
    },
  );
});

test('旧加工方式と不正な保存値を現行 API 値へ移行する', () => {
  assert.equal(normalizeProcessingAlgorithm('coeiroink'), 'resampling');
  assert.equal(normalizeProcessingAlgorithm('unknown'), 'td-psola');
  assert.deepEqual(
    cloneParams({ speedScale: '1.25', pitchScale: 'invalid', processingAlgorithm: 'coeiroink' }),
    {
      speedScale: 1.25,
      pitchScale: 0,
      intonationScale: 1,
      volumeScale: 1,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      processingAlgorithm: 'resampling',
    },
  );
});

test('実レスポンス必須フィールドの欠落を黙って補完しない', () => {
  assert.deepEqual(parseWorldF0Response({ f0: [0, 220], moraDurations: [] }), {
    f0: [0, 220],
    moraDurations: [],
  });
  assert.throws(() => parseWorldF0Response({ f0: [0, 220] }), /moraDurations/);
  assert.throws(() => parseSpeakersPathVariant([{ speakerUuid: 'x', styles: [] }]), /speakerName/);
});
