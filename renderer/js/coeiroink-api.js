import { createLimiter } from './parallel.mjs';
const scheduleEngine = createLimiter(Math.max(1, Math.min(2, globalThis.navigator?.hardwareConcurrency || 2)));

import { DEFAULT_API_BASE } from './constants.js';
import { buildDictionaryPayload } from './dictionary-variants.mjs';
import { fetchWithTimeout } from './utils.js';

export { buildDictionaryPayload };

/** @type {string | null} */
let resolvedApiBase = null;

/** 接続先キャッシュをクリアする（エンジン停止後の再検出用） */
export function resetApiBaseCache() {
  resolvedApiBase = null;
}

/**
 * エンジン到達性を確認する（キャッシュは更新しない）
 * @param {number} [timeoutMs]
 * @returns {Promise<string | null>}
 */
export async function probeCoeiroinkReachable(timeoutMs = 3000) {
  const bases = [DEFAULT_API_BASE, 'http://localhost:50032'];
  for (const base of bases) {
    try {
      const res = await fetchWithTimeout(`${base}/`, {}, timeoutMs);
      if (res.ok) return base;
    } catch (_) {
      /* 次の候補を試す */
    }
  }
  return null;
}

/** COEIROINK エンジンの API ベース URL（127.0.0.1 → localhost の順で解決） */
export async function resolveApiBase() {
  if (resolvedApiBase) return resolvedApiBase;
  const bases = [DEFAULT_API_BASE, 'http://localhost:50032'];
  let lastErr;
  for (const base of bases) {
    try {
      const res = await fetchWithTimeout(`${base}/`, {}, 4000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resolvedApiBase = base;
      return base;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('COEIROINK に接続できません。COEIROINK を起動してから再度お試しください。');
}

/**
 * @param {string} path
 * @param {RequestInit} init
 * @param {number} [timeoutMs]
 */
export async function postCoeiroink(path, init, timeoutMs = 30000) {
  return scheduleEngine(async () => {
    init?.signal?.throwIfAborted();
    const base = await resolveApiBase();
    const response = await fetchWithTimeout(`${base}${path}`, init, timeoutMs);
    // Hold the slot until the engine has finished streaming the response body.
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
  });
}
