const path = require('node:path');
const { ipcMain } = require('electron');
const { dictionaryPath } = require('../paths');
const { readJsonWithBackup, writeJsonAtomic } = require('../atomic-json');

function defaultDictionaryPath() {
  return path.join(__dirname, '../../../renderer/default-dictionary.json');
}

async function readDictionaryFile(filePath) {
  try {
    return await readJsonWithBackup(filePath);
  } catch {
    return null;
  }
}

async function loadBundledDefaultDictionary() {
  const data = await readDictionaryFile(defaultDictionaryPath());
  if (data && Array.isArray(data.dictionaryWords)) return data;
  throw new Error('初期辞書ファイルを読み込めませんでした。');
}

async function writeDictionaryFile(filePath, data) {
  await writeJsonAtomic(filePath, data);
}

function registerDictionaryIpc() {
  let pending = Promise.resolve();
  // 初回読み込みと既定値の保存の間に編集を割り込ませない。
  function withDictionary(operation) {
    const result = pending.catch(() => {}).then(operation);
    pending = result;
    return result;
  }
  ipcMain.handle('dictionary:defaults', () => loadBundledDefaultDictionary());
  ipcMain.handle('dictionary:load', () => withDictionary(async () => {
    const p = dictionaryPath();
    const existing = await readDictionaryFile(p);
    if (existing && Array.isArray(existing.dictionaryWords)) {
      return existing;
    }
    const defaults = await loadBundledDefaultDictionary();
    await writeDictionaryFile(p, defaults);
    return defaults;
  }));

  ipcMain.handle('dictionary:save', (_e, data) => withDictionary(async () => {
    await writeDictionaryFile(dictionaryPath(), data);
    return true;
  }));
}

module.exports = { registerDictionaryIpc };
