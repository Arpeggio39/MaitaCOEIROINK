const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const pending = new Map();

// 同じファイルの読書きを直列化し、保存順とバックアップを維持する。
function withFile(filePath, operation) {
  const key = path.resolve(filePath);
  const previous = pending.get(key) || Promise.resolve();
  const result = previous.catch(() => {}).then(operation);
  pending.set(key, result);
  const release = () => { if (pending.get(key) === result) pending.delete(key); };
  void result.then(release, release);
  return result;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function readJsonWithBackup(filePath) {
  return withFile(filePath, async () => {
    try {
      return await readJson(filePath);
    } catch (primaryError) {
      try {
        return await readJson(`${filePath}.bak`);
      } catch (backupError) {
        if (primaryError.code === 'ENOENT' && backupError.code === 'ENOENT') return null;
        throw primaryError.code === 'ENOENT' ? backupError : primaryError;
      }
    }
  });
}

function writeJsonAtomic(filePath, data) {
  const serialized = JSON.stringify(data, null, 2);
  return withFile(filePath, async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const backupPath = `${filePath}.bak`;
    let movedPrevious = false;
    try {
      await fs.writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
      let primaryExists = true;
      let primaryIsValid = false;
      try {
        await readJson(filePath);
        primaryIsValid = true;
      } catch (error) {
        if (error.code === 'ENOENT') primaryExists = false;
      }
      if (primaryIsValid) {
        await fs.rm(backupPath, { force: true });
        await fs.rename(filePath, backupPath);
        movedPrevious = true;
      } else if (primaryExists) {
        await fs.rename(filePath, `${filePath}.corrupt-${Date.now()}`);
      }
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      if (movedPrevious) await fs.rename(backupPath, filePath);
      throw error;
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  });
}

module.exports = { readJsonWithBackup, writeJsonAtomic };
