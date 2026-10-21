const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readJsonWithBackup, writeJsonAtomic } = require('../src/main/atomic-json');

test('保存するたびに前回の正常データをバックアップする', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'projects.json');
  await writeJsonAtomic(file, { version: 1 });
  await writeJsonAtomic(file, { version: 2 });
  assert.deepEqual(await readJsonWithBackup(file), { version: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { version: 1 });
});

test('プライマリが破損してもバックアップから復旧する', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'projects.json');
  fs.writeFileSync(file, '{broken', 'utf8');
  fs.writeFileSync(`${file}.bak`, JSON.stringify({ recovered: true }), 'utf8');
  assert.deepEqual(await readJsonWithBackup(file), { recovered: true });
});

test('破損ファイルは上書き前に別名保存する', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'projects.json');
  fs.writeFileSync(file, '{broken', 'utf8');
  await writeJsonAtomic(file, { fresh: true });
  assert.deepEqual(await readJsonWithBackup(file), { fresh: true });
  assert.equal(fs.readdirSync(directory).some((name) => name.startsWith('projects.json.corrupt-')), true);
});

test('並行保存と直後の読み込みも順序を保ち、前回の正常値を残す', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'projects.json');
  const saves = Array.from({ length: 20 }, (_, version) => writeJsonAtomic(file, { version }));
  assert.deepEqual(await readJsonWithBackup(file), { version: 19 });
  await Promise.all(saves);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { version: 18 });
});

test('保存に失敗しても後続の保存を妨げない', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const parent = path.join(directory, 'parent');
  fs.writeFileSync(parent, 'not a directory');
  const file = path.join(parent, 'projects.json');
  await assert.rejects(writeJsonAtomic(file, { version: 1 }));
  fs.rmSync(parent);
  await writeJsonAtomic(file, { version: 2 });
  assert.deepEqual(await readJsonWithBackup(file), { version: 2 });
});
