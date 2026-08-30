import { MAITA_UUID } from './constants.js';
import { probeCoeiroinkReachable, resetApiBaseCache } from './coeiroink-api.js';
import { parseSpeakersPathVariant } from './coeiroink-contract.mjs';
import {
  initCoeiroinkWarning,
  maybeShowCoeiroinkWarningForStatus,
  onCoeiroinkOnline,
} from './coeiroink-warning.js';
import { els } from './dom.js';
import { fetchWithTimeout } from './utils.js';

/** @typedef {'checking' | 'online' | 'no-maita' | 'offline'} CoeiroinkStatusKind */

const POLL_INTERVAL_MS = 5000;

/** @type {CoeiroinkStatusKind | null} */
let lastRenderedKind = null;
/** @type {Promise<void> | null} */
let refreshInFlight = null;
/** @type {(() => void | Promise<void>) | null} */
let onlineHandler = null;
/** @type {Promise<void> | null} */
let onlineHandlerInFlight = null;
let onlineHandlerSucceeded = false;

/**
 * @param {CoeiroinkStatusKind} kind
 * @param {{ showChecking?: boolean }} [opts]
 */
function renderCoeiroinkStatus(kind, opts = {}) {
  const dot = els.coeiroinkStatusDot;
  const text = els.coeiroinkStatusText;

  if (kind === 'checking' && !opts.showChecking && lastRenderedKind !== null) {
    return;
  }

  lastRenderedKind = kind;

  switch (kind) {
    case 'checking':
      dot.className = 'status-dot';
      text.textContent = '確認中…';
      break;
    case 'online':
      dot.className = 'status-dot ok';
      text.textContent = 'COEIROINK 起動中';
      break;
    case 'no-maita':
      dot.className = 'status-dot warn';
      text.textContent = '琵音マイタ未検出';
      break;
    case 'offline':
      dot.className = 'status-dot err';
      text.textContent = 'COEIROINK 未起動';
      break;
    default: {
      const _exhaustive = kind;
      throw new Error(`Unknown status: ${_exhaustive}`);
    }
  }
}

/**
 * @param {CoeiroinkStatusKind} kind
 * @param {{ initial?: boolean, previousKind?: CoeiroinkStatusKind | null }} opts
 */
function applyCoeiroinkWarning(kind, { initial = false, previousKind = null } = {}) {
  if (kind === 'online') {
    onCoeiroinkOnline();
    if (!onlineHandlerSucceeded && !onlineHandlerInFlight && onlineHandler) {
      onlineHandlerInFlight = Promise.resolve(onlineHandler())
        .then(() => {
          onlineHandlerSucceeded = true;
        })
        .catch(() => {})
        .finally(() => {
          onlineHandlerInFlight = null;
        });
    }
    return;
  }
  if (kind === 'offline' || kind === 'no-maita') {
    onlineHandlerSucceeded = false;
    maybeShowCoeiroinkWarningForStatus(kind, { initial, previousKind });
  }
}

async function runCoeiroinkStatusRefresh({ initial = false } = {}) {
  const previousKind = lastRenderedKind;
  renderCoeiroinkStatus('checking', { showChecking: initial });

  const base = await probeCoeiroinkReachable();
  if (!base) {
    resetApiBaseCache();
    renderCoeiroinkStatus('offline');
    applyCoeiroinkWarning('offline', { initial, previousKind });
    return;
  }

  try {
    const res = await fetchWithTimeout(`${base}/v1/speakers_path_variant`, {}, 5000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {{ speakerUuid: string; styles?: unknown[] }[]} */
    const list = parseSpeakersPathVariant(await res.json());
    const maita = list.find((s) => s.speakerUuid === MAITA_UUID);
    if (!maita?.styles?.length) {
      renderCoeiroinkStatus('no-maita');
      applyCoeiroinkWarning('no-maita', { initial, previousKind });
      return;
    }
    renderCoeiroinkStatus('online');
    applyCoeiroinkWarning('online', { initial, previousKind });
  } catch {
    resetApiBaseCache();
    renderCoeiroinkStatus('offline');
    applyCoeiroinkWarning('offline', { initial, previousKind });
  }
}

function refreshCoeiroinkStatus(options = {}) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = runCoeiroinkStatusRefresh(options).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** サイドバー左下の COEIROINK 起動ステータス表示を開始する */
export function initCoeiroinkStatus(onOnline) {
  onlineHandler = onOnline ?? null;
  onlineHandlerSucceeded = false;
  initCoeiroinkWarning(() => refreshCoeiroinkStatus());
  void refreshCoeiroinkStatus({ initial: true });
  setInterval(() => {
    void refreshCoeiroinkStatus();
  }, POLL_INTERVAL_MS);
}
