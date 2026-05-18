const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const PROJECTS_FILE = 'projects-data.json';

function projectsPath() {
  return path.join(app.getPath('userData'), PROJECTS_FILE);
}

function installAppMenu() {
  const isMac = process.platform === 'darwin';
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: `${app.name} について` },
        { type: 'separator' },
        { role: 'services', label: 'サービス' },
        { type: 'separator' },
        { role: 'hide', label: `${app.name} を非表示` },
        { role: 'hideOthers', label: 'ほかを非表示' },
        { role: 'unhide', label: 'すべてを表示' },
        { type: 'separator' },
        { role: 'quit', label: `${app.name} を終了` },
      ],
    });
  }
  template.push({
    label: '編集',
    submenu: [
      { role: 'undo', label: '取り消す' },
      { role: 'redo', label: 'やり直す' },
      { type: 'separator' },
      { role: 'cut', label: 'カット' },
      { role: 'copy', label: 'コピー' },
      { role: 'paste', label: 'ペースト' },
      { role: 'delete', label: '削除' },
      { type: 'separator' },
      { role: 'selectAll', label: 'すべて選択' },
    ],
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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

ipcMain.handle('storage:loadProjects', () => {
  try {
    const p = projectsPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
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

const DICTIONARY_FILE = 'user-dictionary.json';

function dictionaryPath() {
  return path.join(app.getPath('userData'), DICTIONARY_FILE);
}

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

ipcMain.handle('native:undo', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.webContents.undo();
});

ipcMain.handle('native:redo', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.webContents.redo();
});

ipcMain.handle('fs:writeWav', (_e, filePath, buffer) => {
  let data;
  if (Buffer.isBuffer(buffer)) {
    data = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    data = Buffer.from(buffer);
  } else if (ArrayBuffer.isView(buffer)) {
    data = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    data = Buffer.from(buffer);
  }
  fs.writeFileSync(filePath, data);
  return true;
});
