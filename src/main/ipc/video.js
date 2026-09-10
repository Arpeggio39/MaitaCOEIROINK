const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createVideoEncoder, videoCapacity } = require('../video-encoder');
const { resolveExportFilePath } = require('../export-files');
const { writeFile } = require('node:fs/promises');
const { ipcMain, dialog, BrowserWindow } = require('electron');

function registerVideoIpc() {
  const sessions = new Map();
  const owners = new WeakSet();
  ipcMain.handle('video:capacity', () => videoCapacity());
  const get = (event, id) => {
    const entry = sessions.get(id);
    if (!entry || entry.owner !== event.sender.id) throw new Error('動画の出力が開始されていません。');
    return entry;
  };
  ipcMain.handle('video:begin', async (event, options) => {
    const id = randomUUID();
    const pending = createVideoEncoder(options);
    if (!owners.has(event.sender)) {
      owners.add(event.sender);
      const owner = event.sender.id;
      event.sender.once('destroyed', () => {
        for (const [key, entry] of sessions) {
          if (entry.owner !== owner) continue;
          sessions.delete(key);
          void entry.pending.then(session => session.abort()).catch(() => {});
        }
      });
    }
    const entry = { owner: event.sender.id, pending, release: () => sessions.delete(id) };
    sessions.set(id, entry);
    try { const session = await pending; return { id, encoder: session.encoder }; }
    catch (error) { entry.release(); throw error; }
  });
  ipcMain.handle('video:frame', async (event, id, bytes) => (await get(event, id).pending).frame(bytes));
  ipcMain.handle('video:finish', async (event, id) => {
    const entry = get(event, id);
    try { return await (await entry.pending).finish(); } finally { entry.release(); }
  });
  ipcMain.handle('video:abort', async (event, id) => {
    if (!sessions.has(id)) return;
    const entry = get(event, id);
    try { await (await entry.pending).abort(); } finally { entry.release(); }
  });
  ipcMain.handle('video:save', async (event, buffer, options = {}) => {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
      throw new Error('動画データが空です。もう一度書き出してください。');
    }
    if (options.wavPath) {
      if (typeof options.wavPath !== 'string' || !path.isAbsolute(options.wavPath) || !/\.wav$/i.test(options.wavPath)) {
        throw new Error('音声の保存先が不正です。');
      }
      const outputPath = resolveExportFilePath(path.dirname(options.wavPath), path.basename(options.wavPath).replace(/\.wav$/i, '.mp4'));
      await writeFile(outputPath, Buffer.from(buffer), { flag: 'wx' });
      return outputPath;
    }
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      defaultPath: 'マイタ_口パク.mp4',
      filters: [{ name: 'MP4 動画', extensions: ['mp4'] }],
    });
    if (canceled || !filePath) return null;
    const outputPath = /\.mp4$/i.test(filePath) ? filePath : `${filePath}.mp4`;
    // A path modified after the dialog has not gone through its overwrite confirmation.
    await writeFile(outputPath, Buffer.from(buffer), { flag: outputPath === filePath ? 'w' : 'wx' });
    return outputPath;
  });
}

module.exports = { registerVideoIpc };
