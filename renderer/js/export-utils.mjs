export function safeFilenameStem(text, maxLength = 40) {
  const normalized = String(text || 'export').trim().slice(0, maxLength);
  return normalized.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_') || 'export';
}

export function safeFilenamePart(text, maxLength = 24) {
  return safeFilenameStem(String(text || '').trim(), maxLength);
}

export function segmentExportFilename(projectTitle, range) {
  const title = safeFilenameStem(projectTitle || 'export');
  const sequence = String(Number(range.index || 0) + 1).padStart(3, '0');
  const snippet = safeFilenamePart(range.text) || `part${sequence}`;
  return `${title}_${sequence}_${snippet}.wav`;
}

export function selectedExportFilename(projectTitle, range) {
  const title = safeFilenameStem(projectTitle || 'export');
  const snippet = safeFilenamePart(range.text) || `part${Number(range.index || 0) + 1}`;
  return `${title}_${snippet}.wav`;
}

export function combinedExportFilename(projectTitle) {
  const title = safeFilenameStem(projectTitle || 'export');
  return `${title}_全文.wav`;
}

export function textFilePathForWav(filePath) {
  return /\.wav$/i.test(filePath) ? filePath.replace(/\.wav$/i, '.txt') : `${filePath}.txt`;
}

export function normalizeExportSettings(blob) {
  const directory = typeof blob?.exportDirectory === 'string' ? blob.exportDirectory : '';
  return {
    exportDirectory: directory,
    exportDirectoryEnabled: Boolean(directory && blob?.exportDirectoryEnabled),
    preventExportOverwrite: Boolean(blob?.preventExportOverwrite),
    exportTextFileEnabled: Boolean(blob?.exportTextFileEnabled),
    exportTextEncoding: blob?.exportTextEncoding === 'shift_jis' ? 'shift_jis' : 'utf8',
  };
}
