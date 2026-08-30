import { MAITA_UUID } from './constants.js';
import { probeCoeiroinkReachable, resetApiBaseCache } from './coeiroink-api.js';
import { els } from './dom.js';
import { fetchWithTimeout } from './utils.js';

/** @typedef {'checking' | 'online' | 'no-maita' | 'offline'} CoeiroinkStatusKind */

const POLL_INTERVAL_MS = 5000;

/** @type {CoeiroinkStatusKind | null} */
let lastRenderedKind = null;

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

async function refreshCoeiroinkStatus({ initial = false } = {}) {
  renderCoeiroinkStatus('checking', { showChecking: initial });

  const base = await probeCoeiroinkReachable();
  if (!base) {
    resetApiBaseCache();
    renderCoeiroinkStatus('offline');
    return;
  }

  try {
    const res = await fetchWithTimeout(`${base}/v1/speakers_path_variant`, {}, 5000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  /** @type {{ speakerUuid: string; styles?: unknown[] }[]} */
    const list = await res.json();
    const maita = list.find((s) => s.speakerUuid === MAITA_UUID);
    if (!maita?.styles?.length) {
      renderCoeiroinkStatus('no-maita');
      return;
    }
    renderCoeiroinkStatus('online');
  } catch {
    resetApiBaseCache();
    renderCoeiroinkStatus('offline');
  }
}

/** サイドバー左下の COEIROINK 起動ステータス表示を開始する */
export function initCoeiroinkStatus() {
  void refreshCoeiroinkStatus({ initial: true });
  setInterval(() => {
    void refreshCoeiroinkStatus();
  }, POLL_INTERVAL_MS);
}
