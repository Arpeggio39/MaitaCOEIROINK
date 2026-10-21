const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../src/main/ipc/dictionary.js');
const actualRequire = createRequire(filename);
function harness(t, existing) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maita-dictionary-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'user-dictionary.json');
  if (existing) fs.writeFileSync(file, JSON.stringify(existing));
  const handlers = new Map();
  const context = { __dirname: path.dirname(filename), module: { exports: {} }, require(name) {
    if (name === 'electron') return { ipcMain: { handle: (name, fn) => handlers.set(name, fn) } };
    if (name === '../paths') return { dictionaryPath: () => file };
    return actualRequire(name);
  }};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context);
  context.module.exports.registerDictionaryIpc();
  return { handlers, file };
}
test('first launch loads and persists the actual bundled dictionary from the IPC directory', async t => {
  const { handlers, file } = harness(t);
  const expected = require('../renderer/default-dictionary.json');
  const loaded = await handlers.get('dictionary:load')();
  assert.deepEqual(loaded, expected);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), expected);
});
test('explicitly empty or edited user dictionaries are preserved, with defaults available separately', async t => {
  for (const existing of [{ dictionaryWords: [] }, { dictionaryWords: [{ word: 'Arpeggio', yomi: 'テスト', accent: 1 }] }]) {
    const { handlers } = harness(t, existing);
    assert.deepEqual(await handlers.get('dictionary:load')(), existing);
    assert.equal((await handlers.get('dictionary:defaults')()).dictionaryWords.length, 25);
  }
});

test('初回の読み込みと保存が重なっても編集した辞書を既定値で上書きしない', async t => {
  const { handlers } = harness(t);
  const edited = { dictionaryWords: [{ word: 'Arpeggio', yomi: 'アルペジオ', accent: 1 }] };
  const initial = handlers.get('dictionary:load')();
  const saved = handlers.get('dictionary:save')(null, edited);
  await Promise.all([initial, saved]);
  assert.deepEqual(await handlers.get('dictionary:load')(), edited);
});
