import { els } from './dom.js';
import { showToast } from './utils.js';

/** @typedef {'offline' | 'no-maita'} CoeiroinkWarningKind */
/** @typedef {'checking' | 'online' | 'no-maita' | 'offline' | null} CoeiroinkStatusKind */

const STATUS_COPY = {
  offline: {
    title: 'COEIROINK が起動していません',
    message:
      '音声の再生・書き出しには COEIROINK の起動が必要です。COEIROINK を起動してから「再接続」を押してください。',
  },
  'no-maita': {
    title: '琵音マイタが見つかりません',
    message:
      'COEIROINK は起動していますが、琵音マイタのボイスが検出されませんでした。ボイスパックをインストールしてください。',
  },
};

/** @type {(() => void | Promise<void>) | null} */
let retryHandler = null;

let userDismissed = false;

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isCoeiroinkRelatedError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('COEIROINK に接続できません') ||
    msg.includes('COEIROINK が起動') ||
    msg.includes('琵音マイタ')
  );
}

/**
 * @param {CoeiroinkWarningKind} kind
 * @param {string} [detail]
 */
export function showCoeiroinkWarningForStatus(kind, detail) {
  const copy = STATUS_COPY[kind];
  els.coeiroinkWarningTitle.textContent = copy.title;
  els.coeiroinkWarningMessage.textContent = detail ?? copy.message;
  els.coeiroinkWarningModal.classList.remove('is-hidden');
  els.coeiroinkWarningFeedback.hidden = true;
  els.coeiroinkWarningSpinner.classList.add('hidden');
}

export function hideCoeiroinkWarning() {
  els.coeiroinkWarningModal.classList.add('is-hidden');
  els.coeiroinkWarningFeedback.hidden = true;
  els.coeiroinkWarningSpinner.classList.add('hidden');
}

/** COEIROINK がオンラインになったときに呼ぶ（閉じた状態をリセット） */
export function onCoeiroinkOnline() {
  userDismissed = false;
  hideCoeiroinkWarning();
}

export function dismissCoeiroinkWarning() {
  userDismissed = true;
  hideCoeiroinkWarning();
}

/**
 * @param {CoeiroinkWarningKind} kind
 * @param {{ initial?: boolean, previousKind?: CoeiroinkStatusKind }} [opts]
 */
export function maybeShowCoeiroinkWarningForStatus(kind, opts = {}) {
  const { initial = false, previousKind = null } = opts;
  if (userDismissed && !initial) return;
  const transitioned = previousKind === 'online' || (initial && previousKind === null);
  if (!initial && !transitioned) return;
  userDismissed = false;
  showCoeiroinkWarningForStatus(kind);
}

/**
 * COEIROINK 接続エラーなら警告ポップアップを表示する
 * @param {unknown} err
 * @returns {boolean} 警告を表示した場合 true
 */
export function notifyCoeiroinkError(err) {
  if (!isCoeiroinkRelatedError(err)) return false;
  userDismissed = false;
  const msg = err instanceof Error ? err.message : String(err);
  const kind = msg.includes('琵音マイタ') ? 'no-maita' : 'offline';
  showCoeiroinkWarningForStatus(kind, msg);
  return true;
}

/**
 * 操作エラーをトーストまたは COEIROINK 警告で表示する
 * @param {unknown} err
 */
export function showOperationError(err) {
  if (notifyCoeiroinkError(err)) return;
  const msg = err instanceof Error ? err.message : String(err);
  showToast(msg);
}

/**
 * @param {() => void | Promise<void>} handler
 */
export function initCoeiroinkWarning(handler) {
  retryHandler = handler;

  els.btnCoeiroinkDismiss.addEventListener('click', () => {
    dismissCoeiroinkWarning();
  });

  els.btnCoeiroinkRetry.addEventListener('click', async () => {
    if (!retryHandler) return;
    els.coeiroinkWarningSpinner.classList.remove('hidden');
    els.coeiroinkWarningFeedback.hidden = true;
    try {
      await retryHandler();
      const isHidden = els.coeiroinkWarningModal.classList.contains('is-hidden');
      if (!isHidden) {
        els.coeiroinkWarningFeedback.textContent =
          'まだ接続できません。COEIROINK が起動しているか確認してください。';
        els.coeiroinkWarningFeedback.className = 'connect-prompt-feedback is-err';
        els.coeiroinkWarningFeedback.hidden = false;
      }
    } finally {
      els.coeiroinkWarningSpinner.classList.add('hidden');
    }
  });
}
