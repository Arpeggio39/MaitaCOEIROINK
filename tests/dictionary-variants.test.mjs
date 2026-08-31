import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDictionaryPayload,
  dictionaryWordVariants,
  normalizeDictionaryYomi,
} from '../renderer/js/dictionary-variants.mjs';

test('辞書単語は全角半角の表記ゆれを含む', () => {
  const variants = dictionaryWordVariants('Arpeggio');
  assert.ok(variants.includes('Arpeggio'));
  assert.ok(variants.includes('Ａｒｐｅｇｇｉｏ'));
  assert.ok(variants.includes('arpeggio'));
  assert.ok(variants.includes('ＡＲＰＥＧＧＩＯ'));
});

test('辞書単語は大文字小文字の表記ゆれを含む', () => {
  const variants = dictionaryWordVariants('COEIROINK');
  assert.ok(variants.includes('coeiroink'));
  assert.ok(variants.includes('ＣＯＥＩＲＯＩＮＫ'));
  assert.ok(variants.includes('ｃｏｅｉｒｏｉｎｋ'));
});

test('日本語のみの辞書単語は表記ゆれを増やさない', () => {
  const variants = dictionaryWordVariants('声音の宴');
  assert.deepEqual(variants, ['声音の宴']);
});

test('ひらがなの読みはCOEIROINK辞書用の全角カタカナへ変換する', () => {
  assert.equal(normalizeDictionaryYomi('びおん'), 'ビオン');
  assert.equal(normalizeDictionaryYomi('ﾋﾞｵﾝ'), 'ビオン');
  const payload = buildDictionaryPayload([{ word: '琵音', yomi: 'びおん', accent: 0 }]);
  assert.equal(payload.dictionaryWords[0]?.yomi, 'ビオン');
  assert.equal(payload.dictionaryWords[0]?.numMoras, 3);
});

test('buildDictionaryPayload は表記ゆれを展開して COEIROINK に送る', () => {
  const payload = buildDictionaryPayload([
    { word: 'Arpeggio', yomi: 'アルペジオ', accent: 0 },
  ]);
  const words = payload.dictionaryWords.map((e) => e.word);
  assert.ok(words.includes('Arpeggio'));
  assert.ok(words.includes('Ａｒｐｅｇｇｉｏ'));
  assert.ok(words.includes('ARPEGGIO'));
  assert.equal(payload.dictionaryWords.find((e) => e.word === 'arpeggio')?.yomi, 'アルペジオ');
});

test('辞書アクセントは API に送るモーラ数の範囲へ収める', () => {
  const payload = buildDictionaryPayload([
    { word: 'test', yomi: 'テスト', accent: 99 },
  ]);
  assert.ok(payload.dictionaryWords.length > 0);
  assert.ok(payload.dictionaryWords.every((entry) => entry.accent === 3 && entry.numMoras === 3));
});
