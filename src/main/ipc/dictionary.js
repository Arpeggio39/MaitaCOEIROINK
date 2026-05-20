const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { dictionaryPath } = require('../paths');

function registerDictionaryIpc() {
  ipcMain.handle('dictionary:load', () => {
    try {
      const p = dictionaryPath();
      if (!fs.existsSync(p)) return { dictionaryWords: [] };
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return { dictionaryWords: [] };
    }
  });

  ipcMain.handle('dictionary:save', (_e, data) => {
    const p = dictionaryPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });
}

module.exports = { registerDictionaryIpc };
