const { ipcMain, dialog, BrowserWindow } = require('electron');

function registerDialogIpc() {
  ipcMain.handle('dialog:saveWav', async (_e, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName || 'export.wav',
      filters: [{ name: 'WAV', extensions: ['wav'] }],
    });
    if (canceled || !filePath) return null;
    return filePath;
  });

  ipcMain.handle('dialog:confirmDeleteProject', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const { response } = await dialog.showMessageBox(parent ?? BrowserWindow.getFocusedWindow(), {
      type: 'warning',
      buttons: ['キャンセル', '削除'],
      defaultId: 0,
      cancelId: 0,
      title: 'プロジェクトを削除',
      message: 'このプロジェクトを削除しますか？',
      noLink: true,
    });
    return response === 1;
  });
}

module.exports = { registerDialogIpc };
