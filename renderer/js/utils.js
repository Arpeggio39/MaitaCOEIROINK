import { EXPORT_SAMPLE_RATE_DEFAULT, SAMPLE_RATE_OPTIONS } from './constants.js';
import { els } from './dom.js';

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {number} [ms]
 */
export function fetchWithTimeout(url, init = {}, ms = 8000) {
  const ctrl = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () => ctrl.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const id = setTimeout(() => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => {
    clearTimeout(id);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  });
}

export function coerceSampleRate(value) {
  const num = Number(value);
  if (Number.isFinite(num) && SAMPLE_RATE_OPTIONS.includes(num)) return num;
  if (!Number.isFinite(num)) return EXPORT_SAMPLE_RATE_DEFAULT;
  let best = EXPORT_SAMPLE_RATE_DEFAULT;
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
