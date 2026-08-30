const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readJsonWithBackup, writeJsonAtomic } = require('../src/main/atomic-json');

test('保存するたびに前回の正常データをバックアップする', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'projects.json');
  writeJsonAtomic(file, { version: 1 });
  writeJsonAtomic(file, { version: 2 });
  assert.deepEqual(readJsonWithBackup(file), { version: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { version: 1 });
});

test('プライマリが破損してもバックアップから復旧する', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'projects.json');
  fs.writeFileSync(file, '{broken', 'utf8');
  fs.writeFileSync(`${file}.bak`, JSON.stringify({ recovered: true }), 'utf8');
  assert.deepEqual(readJsonWithBackup(file), { recovered: true });
});

test('破損ファイルは上書き前に別名保存する', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'projects.json');
  fs.writeFileSync(file, '{broken', 'utf8');
  writeJsonAtomic(file, { fresh: true });
  assert.deepEqual(readJsonWithBackup(file), { fresh: true });
  assert.equal(fs.readdirSync(directory).some((name) => name.startsWith('projects.json.corrupt-')), true);
});
