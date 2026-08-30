const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const defaults = JSON.parse(
  fs.readFileSync(path.join(root, 'renderer/default-dictionary.json'), 'utf8'),
);

test('デフォルト辞書は通常の保存形式である', () => {
  assert.ok(Array.isArray(defaults.dictionaryWords));
  assert.ok(defaults.dictionaryWords.length > 0);
});

test('デフォルト辞書の各行に単語・読み・アクセントがある', () => {
  for (const row of defaults.dictionaryWords) {
    assert.equal(typeof row.word, 'string');
    assert.ok(row.word.length > 0);
    assert.equal(typeof row.yomi, 'string');
    assert.ok(row.yomi.length > 0);
    assert.equal(typeof row.accent, 'number');
    assert.ok(row.accent >= 0);
  }
});

test('Arpeggio のデフォルト読みが登録されている', () => {
  const row = defaults.dictionaryWords.find((e) => e.word === 'Arpeggio');
  assert.ok(row);
  assert.equal(row.yomi, 'アルペジオ');
});

test('声音の宴の読みが登録されている', () => {
  const row = defaults.dictionaryWords.find((e) => e.word === '声音の宴');
  assert.ok(row);
  assert.equal(row.yomi, 'こわねのうたげ');
});

test('同志社EVEの読みが登録されている', () => {
  const row = defaults.dictionaryWords.find((e) => e.word === '同志社EVE');
  assert.ok(row);
  assert.equal(row.yomi, 'どうししゃいぶ');
});
