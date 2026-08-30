const path = require('path');
const { ipcMain } = require('electron');
const { dictionaryPath } = require('../paths');
const { readJsonWithBackup, writeJsonAtomic } = require('../atomic-json');

function defaultDictionaryPath() {
  return path.join(__dirname, '../../renderer/default-dictionary.json');
}

function readDictionaryFile(filePath) {
  try {
    return readJsonWithBackup(filePath);
  } catch {
    return null;
  }
}

function loadBundledDefaultDictionary() {
  const data = readDictionaryFile(defaultDictionaryPath());
  if (data && Array.isArray(data.dictionaryWords)) return data;
  return { dictionaryWords: [] };
}

function writeDictionaryFile(filePath, data) {
  writeJsonAtomic(filePath, data);
}

function registerDictionaryIpc() {
  ipcMain.handle('dictionary:load', () => {
    const p = dictionaryPath();
    const existing = readDictionaryFile(p);
    if (existing && Array.isArray(existing.dictionaryWords)) {
      return existing;
    }
    const defaults = loadBundledDefaultDictionary();
    writeDictionaryFile(p, defaults);
    return defaults;
  });

  ipcMain.handle('dictionary:save', (_e, data) => {
    writeDictionaryFile(dictionaryPath(), data);
    return true;
  });
}

module.exports = { registerDictionaryIpc };
