const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonWithBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch (primaryError) {
    const backupPath = `${filePath}.bak`;
    try {
      if (fs.existsSync(backupPath)) return readJson(backupPath);
    } catch (_) {
      /* Report the primary parse failure below. */
    }
    throw primaryError;
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const backupPath = `${filePath}.bak`;
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(temporaryPath, serialized, 'utf8');

  let movedPrevious = false;
  try {
    if (fs.existsSync(filePath)) {
      let primaryIsValid = false;
      try {
        readJson(filePath);
        primaryIsValid = true;
      } catch (_) {
        /* Preserve the corrupt file below instead of replacing the backup. */
      }
      if (primaryIsValid) {
        fs.rmSync(backupPath, { force: true });
        fs.renameSync(filePath, backupPath);
        movedPrevious = true;
      } else {
        const corruptPath = `${filePath}.corrupt-${Date.now()}`;
        fs.renameSync(filePath, corruptPath);
      }
    }
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (movedPrevious && !fs.existsSync(filePath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, filePath);
    }
    throw error;
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

module.exports = { readJsonWithBackup, writeJsonAtomic };
