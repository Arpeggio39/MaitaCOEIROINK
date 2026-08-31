import test from 'node:test';
import assert from 'node:assert/strict';

import {
  combinedExportFilename,
  normalizeExportSettings,
  segmentExportFilename,
  selectedExportFilename,
  textFilePathForWav,
} from '../renderer/js/export-utils.mjs';
import { prosodyRequestKey } from '../renderer/js/prosody-request-key.mjs';
import {
  findRangeAtCursor,
  playbackRangesForSelection,
  sentenceRangesFromText,
} from '../renderer/js/segment-parser.mjs';
import {
  hasPitchEdits,
  hasProsodyPitchEditsState,
  pitchEditMask,
  remapEntriesByStableText,
  remapProsodyEntries,
  shouldReconcileDefaultPitches,
} from '../renderer/js/prosody-edit-utils.mjs';

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
  assert.deepEqual(sentenceRangesFromText('「」！'), []);
});

test('開き括弧は単独にせず本文と同じ区切りにする', () => {
  assert.deepEqual(
    sentenceRangesFromText('「おはよう」次です。').map((range) => range.text),
    ['「おはよう」', '次です。'],
  );
  assert.deepEqual(sentenceRangesFromText('（おはよう）').map((range) => range.text), ['（おはよう）']);
  assert.deepEqual(sentenceRangesFromText('"hello"').map((range) => range.text), ['"hello"']);
});

test('区切り別のWAV名は安全な連番になり、手動選択名には連番を付けない', () => {
  const range = { index: 1, text: '危険/な:名前？' };
  assert.equal(segmentExportFilename('案件/A', range), '案件_A_002_危険_な_名前？.wav');
  assert.equal(selectedExportFilename('案件/A', range), '案件_A_危険_な_名前？.wav');
  assert.equal(combinedExportFilename('案件/A'), '案件_A_全文.wav');
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

test('選択中の区切りだけを再生し、未選択時は全文を再生する', () => {
  const ranges = sentenceRangesFromText('最初。次です。最後。');
  assert.deepEqual(
    playbackRangesForSelection(ranges, ranges[1].key).map((range) => range.text),
    ['次です。'],
  );
  assert.equal(playbackRangesForSelection(ranges, null).length, 3);
  assert.equal(playbackRangesForSelection(ranges, 'missing').length, 3);
});

test('F0取得中のピッチ編集は推定値で上書きしない', () => {
  assert.deepEqual(pitchEditMask([6, 6], [7, 6], undefined, 6), [true, false]);
  assert.deepEqual(
    pitchEditMask([6.4, 5.8], [6.4, 5.8], [6.4, 5.2], 6),
    [false, true],
  );
  assert.deepEqual(pitchEditMask([7, 6], [7, 6], undefined, 6), [true, false]);
});

test('一部のモーラにだけF0基準値がある場合も編集を検出する', () => {
  assert.equal(hasPitchEdits([6.2, 7, 6], [6.2, 6.5]), true);
  assert.equal(hasPitchEdits([6.2, 6.5, 8], [6.2, 6.5]), false);
});

test('手動ピッチ編集フラグがあれば baseline なしでも編集とみなす', () => {
  assert.equal(hasProsodyPitchEditsState(true, [6, 6, 6], undefined), true);
  assert.equal(hasProsodyPitchEditsState(false, [6, 6, 6], undefined), false);
  assert.equal(hasProsodyPitchEditsState(false, [8, 6, 6], undefined), false);
});

test('全モーラを6.00に手動調整した場合は基準値に戻さない', () => {
  assert.equal(shouldReconcileDefaultPitches(true, [6, 6, 6, 6], [6.2, 6.4, 6.1, 5.9], 6), false);
  assert.equal(shouldReconcileDefaultPitches(false, [6, 6, 6, 6], [6.2, 6.4, 6.1, 5.9], 6), true);
});

test('文章先頭の挿入後も区切り設定を同じ文章だけに移す', () => {
  const a = { speedScale: 1.2 };
  const b = { speedScale: 0.8 };
  const remapped = remapEntriesByStableText(
    { s0: a, s2: b },
    [{ key: 's0', text: 'A' }, { key: 's2', text: 'B' }],
    [{ key: 's0', text: 'X' }, { key: 's2', text: 'A' }, { key: 's4', text: 'B' }],
  );
  assert.deepEqual(remapped, { s2: a, s4: b });
});

test('同じ文章の韻律はオーバーレイ再構築後も同じ参照を保つ', () => {
  const entry = {
    text: 'おはよう。',
    detail: [[{ phoneme: 'o', hira: 'お', accent: 0, pitch: 6.2 }]],
  };
  const ranges = [{ key: 's0', text: 'おはよう。' }];
  const remapped = remapProsodyEntries({ s0: entry }, ranges, ranges);

  assert.equal(remapped.s0, entry);
  entry.detail[0][0].pitch = 9;
  assert.equal(remapped.s0.detail[0][0].pitch, 9);
});
