const fs = require('fs');
const { ipcMain } = require('electron');

function registerFsIpc() {
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
}

module.exports = { registerFsIpc };
