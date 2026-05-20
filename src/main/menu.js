const { app, Menu } = require('electron');

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

module.exports = { installAppMenu };
