import { DEFAULT_API_BASE } from './constants.js';
import { countMorasFromYomi, fetchWithTimeout } from './utils.js';

/** @type {string | null} */
let resolvedApiBase = null;

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
 * @param {{ word: string, yomi: string, accent: number }[]} rows
 */
export function buildDictionaryPayload(rows) {
  return {
    dictionaryWords: rows.map((e) => ({
      word: e.word,
      yomi: e.yomi,
      accent: e.accent,
      numMoras: countMorasFromYomi(e.yomi),
    })),
  };
}

/**
 * @param {string} path
 * @param {RequestInit} init
 * @param {number} [timeoutMs]
 */
export async function postCoeiroink(path, init, timeoutMs = 30000) {
  const base = await resolveApiBase();
  return fetchWithTimeout(`${base}${path}`, init, timeoutMs);
}
