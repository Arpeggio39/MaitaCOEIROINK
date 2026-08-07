const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

/** @type {boolean} */
let manualCheckPending = false;

function getParentWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function showMessageBox(options) {
  const parent = getParentWindow();
  return dialog.showMessageBox(parent ?? undefined, options);
}

function isUpdaterEnabled() {
  return app.isPackaged && process.platform === 'win32';
}

function registerUpdaterEvents() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    manualCheckPending = false;
    showMessageBox({
      type: 'error',
      title: '更新エラー',
      message: '更新の確認またはダウンロードに失敗しました。',
      detail: err?.message || String(err),
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-available', (info) => {
    const notes = typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : '';

    showMessageBox({
      type: 'info',
      title: '更新があります',
      message: `新しいバージョン v${info.version} が利用可能です。`,
      detail: notes || `現在のバージョン: v${app.getVersion()}`,
      buttons: ['ダウンロード', '後で'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate().catch(() => {});
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (!manualCheckPending) return;
    manualCheckPending = false;
    showMessageBox({
      type: 'info',
      title: '更新の確認',
      message: '最新バージョンを使用しています。',
      detail: `v${app.getVersion()}`,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    showMessageBox({
      type: 'info',
      title: '更新の準備完了',
      message: `v${info.version} のダウンロードが完了しました。`,
      detail: '再起動すると更新がインストールされます。',
      buttons: ['再起動してインストール', '後で'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });
}

function initUpdater({ checkOnStartup = true } = {}) {
  if (!isUpdaterEnabled()) return;

  registerUpdaterEvents();

  if (checkOnStartup) {
    autoUpdater.checkForUpdates().catch(() => {});
  }
}

async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    await showMessageBox({
      type: 'info',
      title: '更新の確認',
      message: '開発版では更新確認は利用できません。',
      detail: `現在のバージョン: v${app.getVersion()}`,
      buttons: ['OK'],
    });
    return;
  }

  if (process.platform !== 'win32') {
    await showMessageBox({
      type: 'info',
      title: '更新の確認',
      message: '自動更新は Windows 版のみ対応しています。',
      buttons: ['OK'],
    });
    return;
  }

  manualCheckPending = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    manualCheckPending = false;
  }
}

module.exports = { initUpdater, checkForUpdatesManually, isUpdaterEnabled };
