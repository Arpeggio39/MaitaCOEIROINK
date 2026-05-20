const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { appSettingsPath } = require('../paths');

const MAITA_UUID = '24e48b20-c14c-11f0-a12e-0242ac1c000c';
const DEFAULT_PORT = 50032;
const DEFAULT_HOSTS = ['127.0.0.1', 'localhost'];

/** @type {boolean} */
let launchAttempted = false;

function readAppSettings() {
  try {
    const p = appSettingsPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {string[]} */
function apiBaseCandidates() {
  const settings = readAppSettings();
  const configured = settings?.apiBase;
  const bases = [];
  if (typeof configured === 'string' && configured.trim()) {
    bases.push(configured.trim().replace(/\/$/, ''));
  }
  for (const host of DEFAULT_HOSTS) {
    bases.push(`http://${host}:${DEFAULT_PORT}`);
  }
  return [...new Set(bases)];
}

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 */
function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          ok: res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

async function pingCoeiroink() {
  for (const base of apiBaseCandidates()) {
    try {
      const root = await httpGet(`${base}/`, 2500);
      if (root.ok) {
        let rootStatus = 'OK';
        try {
          const parsed = JSON.parse(root.body);
          if (parsed && typeof parsed.status === 'string') rootStatus = parsed.status;
        } catch {
          /* plain text の場合もある */
        }
        return { ok: true, apiBase: base, rootStatus };
      }
    } catch {
      /* 次の候補へ */
    }
  }
  return { ok: false };
}

async function probeCoeiroink() {
  for (const base of apiBaseCandidates()) {
    try {
      const root = await httpGet(`${base}/`);
      if (!root.ok) continue;

      let rootStatus = 'OK';
      try {
        const parsed = JSON.parse(root.body);
        if (parsed && typeof parsed.status === 'string') rootStatus = parsed.status;
      } catch {
        /* plain text の場合もある */
      }

      const speakersRes = await httpGet(`${base}/v1/speakers_path_variant`, 6000);
      if (!speakersRes.ok) {
        return { status: 'warn', reason: 'speakers_failed', rootStatus, apiBase: base, maitaStyleId: 0 };
      }

      /** @type {{ speakerUuid: string, styles: { styleId: number, styleName: string }[]}[]} */
      const list = JSON.parse(speakersRes.body);
      const maita = list.find((s) => s.speakerUuid === MAITA_UUID);
      if (!maita?.styles?.length) {
        return { status: 'warn', reason: 'maita_not_found', rootStatus, apiBase: base, maitaStyleId: 0 };
      }

      const preferred =
        maita.styles.find((s) => s.styleName === 'のーまる') ||
        maita.styles.find((s) => s.styleName.includes('のーまる'));
      return {
        status: 'ok',
        rootStatus,
        apiBase: base,
        maitaStyleId: preferred ? preferred.styleId : maita.styles[0].styleId,
      };
    } catch {
      /* 次の候補へ */
    }
  }

  return { status: 'err' };
}

/** @returns {string | null} */
function resolveCoeiroinkExePath() {
  const settings = readAppSettings();
  const configured = settings?.coeiroinkExePath;
  if (typeof configured === 'string' && configured.trim()) {
    const resolved = path.resolve(configured.trim());
    if (fs.existsSync(resolved)) return resolved;
  }

  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'COEIROINK', 'COEIROINKv2.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'COEIROINK', 'COEIROINKv2.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'COEIROINK', 'COEIROINKv2.exe'),
    ];
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function launchCoeiroink() {
  if (launchAttempted) {
    return { ok: false, reason: 'already_attempted' };
  }
  launchAttempted = true;

  const exePath = resolveCoeiroinkExePath();
  if (!exePath) {
    return { ok: false, reason: 'path_not_found' };
  }

  try {
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return { ok: true, path: exePath };
  } catch (err) {
    return { ok: false, reason: 'spawn_failed', message: String(err) };
  }
}

function registerEngineIpc() {
  ipcMain.handle('engine:pingCoeiroink', () => pingCoeiroink());
  ipcMain.handle('engine:probeCoeiroink', () => probeCoeiroink());
  ipcMain.handle('engine:launchCoeiroink', () => launchCoeiroink());
}

module.exports = { registerEngineIpc, launchCoeiroink, pingCoeiroink, probeCoeiroink };
