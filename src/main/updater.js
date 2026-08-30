const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

/** @type {boolean} */
let manualCheckPending = false;

/** @type {boolean} */
let startupCheckPending = false;
let updatePromptPending = false;

function resetStartupUpdateFlow() {
  startupCheckPending = false;
  autoUpdater.autoDownload = false;
}

function getParentWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

async function showMessageBox(options) {
  let parent = getParentWindow();
  if (!parent) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    parent = getParentWindow();
  }
  return dialog.showMessageBox(parent ?? undefined, options);
}

function isUpdaterEnabled() {
  return app.isPackaged && process.platform === 'win32';
}

function registerUpdaterEvents() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    const wasManual = manualCheckPending;
    manualCheckPending = false;
    resetStartupUpdateFlow();
    if (!wasManual) return;
    showMessageBox({
      type: 'error',
      title: '更新エラー',
      message: '更新の確認またはダウンロードに失敗しました。',
      detail: err?.message || String(err),
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-available', (info) => {
    if (startupCheckPending) return;
    if (!manualCheckPending) return;
    if (updatePromptPending) return;
    updatePromptPending = true;

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
      updatePromptPending = false;
      if (response === 0) {
        autoUpdater.downloadUpdate().catch(() => {});
      } else {
        manualCheckPending = false;
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (startupCheckPending) {
      resetStartupUpdateFlow();
      return;
    }
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
    if (startupCheckPending) {
      resetStartupUpdateFlow();
      autoUpdater.quitAndInstall(false, true);
      return;
    }

    manualCheckPending = false;

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

function initUpdater() {
  if (!isUpdaterEnabled()) return;
  registerUpdaterEvents();
}

function checkForUpdatesOnStartup() {
  if (!isUpdaterEnabled()) return;
  startupCheckPending = true;
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdates().catch(() => {
    resetStartupUpdateFlow();
  });
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

  if (startupCheckPending) resetStartupUpdateFlow();
  manualCheckPending = true;
  autoUpdater.autoDownload = false;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    manualCheckPending = false;
  }
}

module.exports = {
  initUpdater,
  checkForUpdatesOnStartup,
  checkForUpdatesManually,
  isUpdaterEnabled,
};
