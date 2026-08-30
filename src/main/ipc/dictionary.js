const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { dictionaryPath } = require('../paths');

function defaultDictionaryPath() {
  return path.join(__dirname, '../../renderer/default-dictionary.json');
}

function readDictionaryFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function registerDictionaryIpc() {
  ipcMain.handle('dictionary:load', () => {
    const p = dictionaryPath();
    const existing = readDictionaryFile(p);
    if (existing && Array.isArray(existing.dictionaryWords) && existing.dictionaryWords.length > 0) {
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
