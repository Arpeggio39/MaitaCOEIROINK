const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { projectsPath, appSettingsPath } = require('../paths');

function registerStorageIpc() {
  ipcMain.handle('storage:loadProjects', () => {
    try {
      const p = projectsPath();
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('storage:saveProjects', (_e, data) => {
    const p = projectsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });

  ipcMain.handle('storage:loadAppSettings', () => {
    try {
      const p = appSettingsPath();
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('storage:saveAppSettings', (_e, data) => {
    const p = appSettingsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });
}

module.exports = { registerStorageIpc };
