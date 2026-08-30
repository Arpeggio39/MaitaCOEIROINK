const path = require('path');
const { app, BrowserWindow } = require('electron');
const { installAppMenu } = require('./menu');
const { registerAllIpcHandlers } = require('./ipc');
const { initUpdater, checkForUpdatesOnStartup } = require('./updater');

registerAllIpcHandlers();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    checkForUpdatesOnStartup();
  });
  return win;
}

app.whenReady().then(() => {
  installAppMenu();
  initUpdater();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
