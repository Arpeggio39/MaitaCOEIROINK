const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { encodeText, resolveExportFilePath } = require('../export-files');

function registerFsIpc() {
  ipcMain.handle('fs:resolveExportFilePath', (_e, directoryPath, defaultName, options = {}) => {
    return resolveExportFilePath(directoryPath, defaultName, options);
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

  ipcMain.handle('fs:writeText', (_e, filePath, text, encoding = 'utf8') => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, encodeText(text, encoding));
    return true;
  });
}

module.exports = { registerFsIpc };
