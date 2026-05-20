import { SAMPLE_RATE_OPTIONS } from './constants.js';
import { els } from './dom.js';

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {number} [ms]
 */
export function fetchWithTimeout(url, init = {}, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/** 読みからモーラ数のおおよその数 */
export function countMorasFromYomi(yomi) {
  const s = yomi.normalize('NFKC').replace(/\s+/g, '');
  if (!s.length) return 1;
  const SMALL = /^[ァィゥェォャュョぁぃぅぇぉゃゅょゎ]$/u;
  let i = 0;
  let moras = 0;
  while (i < s.length) {
    moras += 1;
    i += 1;
    if (i < s.length && SMALL.test(s[i])) i += 1;
  }
  return Math.max(moras, 1);
}

export function coerceSampleRate(value) {
  const num = Number(value);
  if (Number.isFinite(num) && SAMPLE_RATE_OPTIONS.includes(num)) return num;
  let best = SAMPLE_RATE_OPTIONS[0];
  let bestDist = Infinity;
  for (const r of SAMPLE_RATE_OPTIONS) {
    const d = Math.abs(r - num);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

/**
 * @param {string} s
 */
export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} msg
 * @param {number} [ms]
 */
export function showToast(msg, ms = 3400) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}
