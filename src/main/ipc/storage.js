const { ipcMain } = require('electron');
const { projectsPath, appSettingsPath } = require('../paths');
const { readJsonWithBackup, writeJsonAtomic } = require('../atomic-json');

function registerStorageIpc() {
  ipcMain.handle('storage:loadProjects', () => {
    try {
      return readJsonWithBackup(projectsPath());
    } catch (error) {
      return { __openMaitaLoadError: error.message };
    }
  });

  ipcMain.handle('storage:saveProjects', (_e, data) => {
    writeJsonAtomic(projectsPath(), data);
    return true;
  });

  ipcMain.on('storage:saveProjectsSync', (event, data) => {
    try {
      writeJsonAtomic(projectsPath(), data);
      event.returnValue = { ok: true };
    } catch (error) {
      event.returnValue = { ok: false, error: error.message };
    }
  });

  ipcMain.handle('storage:loadAppSettings', () => {
    try {
      return readJsonWithBackup(appSettingsPath());
    } catch {
      return null;
    }
  });

  ipcMain.handle('storage:saveAppSettings', (_e, data) => {
    writeJsonAtomic(appSettingsPath(), data);
    return true;
  });
}

module.exports = { registerStorageIpc };
