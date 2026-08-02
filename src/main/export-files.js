const fs = require('fs');
const path = require('path');
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

function uniqueFilePath(directoryPath, filename, companionText = false) {
  const { stem, ext } = splitExtension(filename);
  let candidate = path.join(directoryPath, `${stem}${ext}`);
  let n = 1;
  const hasConflict = () =>
    fs.existsSync(candidate) || (companionText && fs.existsSync(companionTextPath(candidate)));
  while (hasConflict()) {
    candidate = path.join(directoryPath, `${stem}_${String(n).padStart(3, '0')}${ext}`);
    n += 1;
  }
  return candidate;
}

function directFilePath(directoryPath, filename) {
  const { stem, ext } = splitExtension(filename);
  return path.join(directoryPath, `${stem}${ext}`);
}

function resolveExportFilePath(directoryPath, defaultName, options = {}) {
  if (!directoryPath || typeof directoryPath !== 'string') {
    throw new Error('書き出しフォルダーが設定されていません');
  }
  fs.mkdirSync(directoryPath, { recursive: true });
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
