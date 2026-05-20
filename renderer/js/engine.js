import { DEFAULT_API_BASE, MAITA_UUID } from './constants.js';
import { bridge } from './bridge.js';
import { els } from './dom.js';
import * as appState from './state.js';
import { fetchWithTimeout, showToast } from './utils.js';

const BTN_LABEL_DEFAULT = 'COEIROINK を起動しました';
const BTN_LABEL_CHECKING = '接続を確認中…';

function setConnectPromptFeedback(message, tone = '') {
  if (!els.connectPromptFeedback) return;
  els.connectPromptFeedback.textContent = message;
  els.connectPromptFeedback.classList.remove('is-ok', 'is-err');
  if (tone) els.connectPromptFeedback.classList.add(tone);
}

/**
 * @param {{ status: 'ok' | 'warn' | 'err', reason?: string, rootStatus?: string, apiBase?: string, maitaStyleId?: number }} result
 * @param {{ silentToast?: boolean }} [opts]
 * @returns {'ok' | 'warn' | 'err'}
 */
function applyProbeResult(result, opts = {}) {
  const silent = !!opts.silentToast;
  const apiBase = result.apiBase || DEFAULT_API_BASE;
  els.engineDot.classList.remove('ok', 'warn', 'err');

  if (result.status === 'ok') {
    appState.maitaStyleId = result.maitaStyleId ?? 0;
    els.engineDot.classList.add('ok');
    els.engineStatusText.textContent = `COEIROINK と通信中 · ${result.rootStatus ?? 'OK'}`;
    return 'ok';
  }

  if (result.status === 'warn') {
    appState.maitaStyleId = 0;
    els.engineDot.classList.add('warn');
    if (result.reason === 'maita_not_found') {
      els.engineStatusText.textContent = `エンジン応答あり（琵音マイタが一覧に見つかりません）· ${apiBase}`;
      if (!silent) {
        showToast(`この COEIROINK に琵音マイタが見つかりません。（${MAITA_UUID}）`);
      }
    } else {
      els.engineStatusText.textContent = `API は応答したが話者一覧を取得できません · ${apiBase}`;
      if (!silent) showToast('話者一覧（/v1/speakers）を取得できませんでした');
    }
    return 'warn';
  }

  appState.maitaStyleId = 0;
  els.engineDot.classList.add('err');
  els.engineStatusText.textContent = `COEIROINK に接続できません（エンジンまたは ${DEFAULT_API_BASE}）`;
  if (!silent) {
    showToast('COEIROINK に接続できません。起動してから「COEIROINK を起動しました」を押してください。');
  }
  return 'err';
}

/** @returns {Promise<{ status: 'ok' | 'warn' | 'err', reason?: string, rootStatus?: string, apiBase?: string, maitaStyleId?: number }>} */
async function probeViaMain() {
  return bridge.probeCoeiroink();
}

/** @returns {Promise<{ status: 'ok' | 'warn' | 'err', reason?: string, rootStatus?: string, apiBase?: string, maitaStyleId?: number }>} */
async function probeViaFetch() {
  const bases = [DEFAULT_API_BASE, 'http://localhost:50032'];
  let lastErr;

  for (const base of bases) {
    try {
      const root = await fetchWithTimeout(`${base}/`, {}, 4000);
      if (!root.ok) throw new Error(`HTTP ${root.status}`);
      let rootStatus = 'OK';
      try {
        const j = await root.json();
        if (j && typeof j.status === 'string') rootStatus = j.status;
      } catch (_) {
        /* plain text の場合もある */
      }

      const res = await fetchWithTimeout(`${base}/v1/speakers_path_variant`, {}, 6000);
      if (!res.ok) {
        return { status: 'warn', reason: 'speakers_failed', rootStatus, apiBase: base };
      }
      /** @type {{ speakerUuid: string, styles: { styleId: number, styleName: string }[]}[]} */
      const list = await res.json();
      const maita = list.find((s) => s.speakerUuid === MAITA_UUID);
      if (!maita?.styles?.length) {
        return { status: 'warn', reason: 'maita_not_found', rootStatus, apiBase: base };
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
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr ?? new Error('COEIROINK API unreachable');
}

/**
 * @param {{ silentToast?: boolean }} [opts]
 * @returns {Promise<'ok' | 'warn' | 'err'>}
 */
export async function refreshCoeiroinkStatus(opts = {}) {
  els.engineStatusText.textContent = 'COEIROINK を確認しています…';

  try {
    const result = await probeViaMain();
    return applyProbeResult(result, opts);
  } catch (_) {
    try {
      const result = await probeViaFetch();
      return applyProbeResult(result, opts);
    } catch {
      return applyProbeResult({ status: 'err' }, opts);
    }
  }
}

export function showConnectPrompt() {
  if (!els.connectPrompt) return;
  els.connectPrompt.classList.remove('is-hidden');
}

export function hideConnectPrompt() {
  if (!els.connectPrompt) return;
  els.connectPrompt.classList.add('is-hidden');
}

/** 起動時: 自動検知なし。接続プロンプトを表示する。 */
export function initConnectPrompt() {
  els.engineDot.classList.remove('ok', 'warn');
  els.engineDot.classList.add('err');
  els.engineStatusText.textContent = 'COEIROINK 未接続';
  setConnectPromptFeedback('');
  showConnectPrompt();
}

/** 「COEIROINK を起動しました」押下時 */
export async function checkCoeiroinkManually() {
  const btn = els.btnCoeiroinkStarted;
  if (btn?.disabled) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = BTN_LABEL_CHECKING;
  }
  setConnectPromptFeedback('COEIROINK の API に接続しています…');

  try {
    const status = await refreshCoeiroinkStatus({ silentToast: false });

    if (status === 'ok') {
      setConnectPromptFeedback('接続しました。', 'is-ok');
      hideConnectPrompt();
      return status;
    }

    if (status === 'warn') {
      setConnectPromptFeedback('API には接続できました。', 'is-ok');
      hideConnectPrompt();
      return status;
    }

    setConnectPromptFeedback(
      `${DEFAULT_API_BASE} に接続できません。COEIROINK の起動完了後、もう一度お試しください。`,
      'is-err',
    );
    return status;
  } catch (_) {
    setConnectPromptFeedback('接続確認中にエラーが発生しました。', 'is-err');
    return 'err';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = BTN_LABEL_DEFAULT;
    }
  }
}
