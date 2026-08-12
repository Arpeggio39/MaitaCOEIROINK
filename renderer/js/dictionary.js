import { buildDictionaryPayload, postCoeiroink } from './coeiroink-api.js';
import { bridge } from './bridge.js';
import { els } from './dom.js';
import * as appState from './state.js';
import { countMorasFromYomi, showToast } from './utils.js';

function normalizeDictionaryEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      const a = Number(o?.accent);
      return {
        word: String(o?.word ?? '').trim(),
        yomi: String(o?.yomi ?? '').trim(),
        accent: Number.isFinite(a) && a >= 0 ? Math.floor(a) : 1,
      };
    })
    .filter((e) => e.word || e.yomi);
}

export async function loadDictionaryFromDisk() {
  try {
    const blob = await bridge.loadDictionary();
    appState.setDictionaryEntries(normalizeDictionaryEntries(blob?.dictionaryWords));
  } catch (_) {
    appState.setDictionaryEntries([]);
  }
}

async function persistDictionaryToDisk() {
  await bridge.saveDictionary({
    dictionaryWords: appState.dictionaryEntries.map((e) => ({
      word: e.word.trim(),
      yomi: e.yomi.trim(),
      accent: e.accent,
    })),
  });
}

/**
 * @param {HTMLTableRowElement} tr
 */
function updateRowMoraCell(tr) {
  const yomi = /** @type {HTMLInputElement | null} */ (tr.querySelector('.dict-input-yomi'))?.value ?? '';
  const cell = tr.querySelector('.dict-mora-val');
  if (cell) cell.textContent = String(countMorasFromYomi(yomi));
}

export function renderDictionaryRows() {
  els.dictionaryRows.innerHTML = '';
  const rows =
    appState.dictionaryEntries.length > 0
      ? appState.dictionaryEntries
      : [{ word: '', yomi: '', accent: 1 }];
  for (const e of rows) appendDictionaryRow(e);
}

/**
 * @param {{ word: string, yomi: string, accent: number }} entry
 */
export function appendDictionaryRow(entry) {
  const moras = countMorasFromYomi(entry.yomi);
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td><input type="text" class="input dict-input dict-input-word" lang="en" inputmode="text" autocomplete="off" value="" spellcheck="false" /></td>
      <td><input type="text" class="input dict-input dict-input-yomi" value="" spellcheck="false" /></td>
      <td><input type="number" class="input dict-input dict-input-accent" min="0" step="1" /></td>
      <td class="dict-mora-val col-mora">${moras}</td>
      <td class="col-del"><button type="button" class="btn btn-row-del" title="行を削除">×</button></td>
    `;
  /** @type {HTMLInputElement} */ (tr.querySelector('.dict-input-word')).value = entry.word;
  /** @type {HTMLInputElement} */ (tr.querySelector('.dict-input-yomi')).value = entry.yomi;
  /** @type {HTMLInputElement} */ (tr.querySelector('.dict-input-accent')).value = String(entry.accent);
  tr.querySelector('.dict-input-yomi')?.addEventListener('input', () => updateRowMoraCell(tr));
  tr.querySelector('.btn-row-del')?.addEventListener('click', () => {
    tr.remove();
    if (!els.dictionaryRows.querySelector('tr')) appendDictionaryRow({ word: '', yomi: '', accent: 1 });
  });
  els.dictionaryRows.appendChild(tr);
}

function readDictionaryFromDom() {
  /** @type {{ word: string, yomi: string, accent: number }[]} */
  const rows = [];
  for (const tr of els.dictionaryRows.querySelectorAll('tr')) {
    const word = /** @type {HTMLInputElement} */ (tr.querySelector('.dict-input-word')).value.trim();
    const yomi = /** @type {HTMLInputElement} */ (tr.querySelector('.dict-input-yomi')).value.trim();
    let accentRaw = Number(/** @type {HTMLInputElement} */ (tr.querySelector('.dict-input-accent')).value);
    if (!Number.isFinite(accentRaw)) accentRaw = 1;
    const accent = Math.max(0, Math.floor(accentRaw));
    if (!word && !yomi) continue;
    if (!word || !yomi) {
      throw new Error('辞書では「単語」と「読み」の両方を入力してください（空の行のみスキップできます）。');
    }
    rows.push({ word, yomi, accent });
  }
  return rows;
}

async function applyDictionaryToCoeiroink() {
  const rows = readDictionaryFromDom();
  const res = await postCoeiroink(
    '/v1/set_dictionary',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDictionaryPayload(rows)),
    },
    20000,
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `辞書の保存に失敗しました (${res.status})`);
  }
  appState.setDictionaryEntries(rows);
  await persistDictionaryToDisk();
}

/** ディスク上の辞書を COEIROINK エンジンへ反映する（起動時など） */
export async function syncDictionaryToCoeiroink() {
  const rows = appState.dictionaryEntries;
  const res = await postCoeiroink(
    '/v1/set_dictionary',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDictionaryPayload(rows)),
    },
    20000,
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `辞書の同期に失敗しました (${res.status})`);
  }
}

export function openDictionaryModal() {
  renderDictionaryRows();
  els.dictionaryModal.classList.remove('hidden');
}

export function closeDictionaryModal() {
  els.dictionaryModal.classList.add('hidden');
}

export async function saveDictionaryFromModal() {
  els.btnDictApply.disabled = true;
  try {
    await applyDictionaryToCoeiroink();
    showToast('辞書を保存しました');
    closeDictionaryModal();
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  } finally {
    els.btnDictApply.disabled = false;
  }
}
