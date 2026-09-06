import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneParams } from '../renderer/js/params.js';
import { getSentenceParams, remapSentenceParams, sentenceRangesFromText } from '../renderer/js/segments.js';
import { defaultParams, setDefaultParams } from '../renderer/js/state.js';

function editText(project, text) {
  const before = sentenceRangesFromText(project.text);
  project.text = text;
  const after = sentenceRangesFromText(text);
  remapSentenceParams(project, before, after);
  return after;
}

test('最後の設定を新しい文章と再入力の初期値に使い、既存の文章は保持する', () => {
  const project = { text: '最初。', params: cloneParams(), sentenceParamsByKey: {} };
  const latest = cloneParams({ speedScale: 1.25, volumeScale: 0.7, pitchScale: 0.04, intonationScale: 0.8 });
  setDefaultParams(latest);
  let ranges = editText(project, '最初。次の文章。');
  assert.equal(getSentenceParams(project, ranges[0].key).speedScale, 1);
  assert.deepEqual(getSentenceParams(project, ranges[1].key), latest);
  ranges = editText(project, '再入力。');
  assert.deepEqual(getSentenceParams(project, ranges[0].key), latest);
  latest.volumeScale = 2;
  assert.equal(defaultParams.volumeScale, 0.7);
});

test('別の文章の選択では既定値を上書きせず、別プロジェクトの追加文にも最新値を使う', () => {
  const custom = cloneParams({ speedScale: 0.8 });
  const project = { text: '最初。', params: cloneParams(), sentenceParamsByKey: { s0: custom } };
  setDefaultParams({ speedScale: 1.4 });
  assert.deepEqual(getSentenceParams(project, 's0'), custom);
  assert.equal(defaultParams.speedScale, 1.4);
  const ranges = editText(project, '最初。追加。');
  assert.deepEqual(getSentenceParams(project, ranges[0].key), custom);
  assert.equal(getSentenceParams(project, ranges[1].key).speedScale, 1.4);
});

test('保存・再読込で最後の設定を復元し、旧データでは初期値を使う', async () => {
  let disk;
  globalThis.window = { maita: {
    saveProjects: async (blob) => { disk = JSON.parse(JSON.stringify(blob)); },
    saveProjectsSync: (blob) => { disk = JSON.parse(JSON.stringify(blob)); },
  } };
  const { persistProjects, flushProjectsSync } = await import('../renderer/js/persist.js');
  setDefaultParams({ speedScale: 1.3, pitchScale: -0.05 });
  await persistProjects();
  setDefaultParams();
  setDefaultParams(disk.defaultParams);
  assert.equal(defaultParams.speedScale, 1.3);
  assert.equal(defaultParams.pitchScale, -0.05);
  setDefaultParams({ volumeScale: 0.5 });
  flushProjectsSync();
  assert.equal(disk.defaultParams.volumeScale, 0.5);
  setDefaultParams(undefined);
  assert.deepEqual(defaultParams, cloneParams());
});
