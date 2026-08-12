import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeExportSettings,
  segmentExportFilename,
  selectedExportFilename,
  textFilePathForWav,
} from '../renderer/js/export-utils.mjs';
import { prosodyRequestKey } from '../renderer/js/prosody-request-key.mjs';
import {
  findRangeAtCursor,
  sentenceRangesFromText,
} from '../renderer/js/segment-parser.mjs';

test('句読点・空白・改行で文章を順序どおりに区切る', () => {
  const text = 'こんにちは。 次です！\n最後';
  const ranges = sentenceRangesFromText(text);

  assert.deepEqual(ranges.map((range) => range.text), ['こんにちは。', '次です！', '最後']);
  assert.deepEqual(ranges.map((range) => range.key), ['s0', 's7', 's12']);
  assert.equal(findRangeAtCursor(0, ranges)?.text, 'こんにちは。');
  assert.equal(findRangeAtCursor(6, ranges), null);
  assert.equal(findRangeAtCursor(7, ranges)?.text, '次です！');
});

test('空の入力や区切り文字だけの入力では文章を生成しない', () => {
  assert.deepEqual(sentenceRangesFromText(''), []);
  assert.deepEqual(sentenceRangesFromText('  \n\t'), []);
});

test('区切り別のWAV名は安全な連番になり、手動選択名には連番を付けない', () => {
  const range = { index: 1, text: '危険/な:名前？' };
  assert.equal(segmentExportFilename('案件/A', range), '案件_A_002_危険_な_名前？.wav');
  assert.equal(selectedExportFilename('案件/A', range), '案件_A_危険_な_名前？.wav');
  assert.equal(textFilePathForWav('/tmp/VOICE.WAV'), '/tmp/VOICE.txt');
});

test('保存設定を安全な既定値へ正規化する', () => {
  assert.deepEqual(normalizeExportSettings(null), {
    exportDirectory: '',
    exportDirectoryEnabled: false,
    preventExportOverwrite: false,
    exportTextFileEnabled: false,
    exportTextEncoding: 'utf8',
  });
  assert.equal(normalizeExportSettings({ exportTextEncoding: 'shift_jis' }).exportTextEncoding, 'shift_jis');
});

test('韻律取得キーは同じ文章位置でもプロジェクトUUIDごとに分離される', () => {
  const first = prosodyRequestKey({ id: 'project-a' }, 's0');
  const second = prosodyRequestKey({ id: 'project-b' }, 's0');
  assert.equal(first, 'project-a:s0');
  assert.notEqual(first, second);
});
