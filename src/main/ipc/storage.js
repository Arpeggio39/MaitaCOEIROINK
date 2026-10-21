const { ipcMain } = require('electron');
const { projectsPath, appSettingsPath } = require('../paths');
const { readJsonWithBackup, writeJsonAtomic } = require('../atomic-json');

function registerStorageIpc() {
  ipcMain.handle('storage:loadProjects', async () => {
    try {
      return await readJsonWithBackup(projectsPath());
    } catch (error) {
      return { __openMaitaLoadError: error.message };
    }
  });

  ipcMain.handle('storage:saveProjects', async (_e, data) => {
    await writeJsonAtomic(projectsPath(), data);
    return true;
  });

  // beforeunload は応答を待つが、メイン側の I/O は通常保存と同じキューで処理する。
  ipcMain.on('storage:saveProjectsSync', async (event, data) => {
    try {
      await writeJsonAtomic(projectsPath(), data);
      event.returnValue = { ok: true };
    } catch (error) {
      event.returnValue = { ok: false, error: error.message };
    }
  });

  ipcMain.handle('storage:loadAppSettings', async () => {
    try {
      return await readJsonWithBackup(appSettingsPath());
    } catch {
      return null;
    }
  });

  ipcMain.handle('storage:saveAppSettings', async (_e, data) => {
    await writeJsonAtomic(appSettingsPath(), data);
    return true;
  });
}

module.exports = { registerStorageIpc };
