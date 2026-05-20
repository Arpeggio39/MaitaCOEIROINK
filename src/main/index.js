const path = require('path');
const { app, BrowserWindow } = require('electron');
const { installAppMenu } = require('./menu');
const { registerAllIpcHandlers } = require('./ipc');

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
}

app.whenReady().then(() => {
  installAppMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
