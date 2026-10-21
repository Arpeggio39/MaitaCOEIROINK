const fs = require('node:fs/promises');
const path = require('node:path');
const iconv = require('iconv-lite');

function splitExtension(filename) {
  const ext = path.extname(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  return { stem: stem || 'export', ext: ext || '.wav' };
}

function companionTextPath(filePath) {
  const ext = path.extname(filePath);
  return ext ? `${filePath.slice(0, -ext.length)}.txt` : `${filePath}.txt`;
}

async function uniqueFilePath(directoryPath, filename, companionText = false) {
  const { stem, ext } = splitExtension(filename);
  let candidate = path.join(directoryPath, `${stem}${ext}`);
  let n = 1;
  const exists = async (filePath) => {
    try { await fs.stat(filePath); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  };
  const hasConflict = async () =>
    await exists(candidate) || (companionText && await exists(companionTextPath(candidate)));
  while (await hasConflict()) {
    candidate = path.join(directoryPath, `${stem}_${String(n).padStart(3, '0')}${ext}`);
    n += 1;
  }
  return candidate;
}

function directFilePath(directoryPath, filename) {
  const { stem, ext } = splitExtension(filename);
  return path.join(directoryPath, `${stem}${ext}`);
}

async function resolveExportFilePath(directoryPath, defaultName, options = {}) {
  if (!directoryPath || typeof directoryPath !== 'string') {
    throw new Error('書き出しフォルダーが設定されていません');
  }
  await fs.mkdir(directoryPath, { recursive: true });
  const filename = path.basename(defaultName || 'export.wav');
  return options.unique === false
    ? directFilePath(directoryPath, filename)
    : uniqueFilePath(directoryPath, filename, options.companionText === true);
}

function encodeText(text, encoding = 'utf8') {
  const normalizedEncoding = encoding === 'shift_jis' ? 'shift_jis' : 'utf8';
  return iconv.encode(String(text ?? ''), normalizedEncoding);
}

module.exports = {
  companionTextPath,
  directFilePath,
  encodeText,
  resolveExportFilePath,
  splitExtension,
  uniqueFilePath,
};
