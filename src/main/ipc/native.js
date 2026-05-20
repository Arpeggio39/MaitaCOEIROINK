const { ipcMain, BrowserWindow } = require('electron');

function registerNativeIpc() {
  ipcMain.handle('native:undo', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.undo();
  });

  ipcMain.handle('native:redo', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.redo();
  });
}

module.exports = { registerNativeIpc };
