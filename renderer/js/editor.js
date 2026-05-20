import { INTONATION_CHAR_WIDTH, MORA_PITCH_MAX, MORA_PITCH_MIN, PARAM_DEFAULTS } from './constants.js';
import { els, segmentParamControls } from './dom.js';
import {
  applyParamsToControls,
  cloneParams,
  paramsEqual,
  refreshValueLabelsFor,
  snapshotParamsFromControls,
} from './params.js';
import {
  findRangeAtCursor,
  getSentenceParams,
  hasCustomSentenceParams,
  migrateSentenceParamsForProject,
  remapSentenceParams,
  sentenceRangesFromText,
} from './segments.js';
import {
  buildHiraganaCellsFromDetail,
  buildMoraSpansFromDetail,
  ensureSegmentProsody,
  getMoraPitch,
  getSegmentProsody,
  remapSentenceProsody,
  scheduleProsodyForRanges,
  scheduleProsodyKanaReestimate,
  setMoraPitch,
} from './prosody.js';
import {
  activeProject,
  activeSentenceKey,
  lastSentenceRanges,
  setActiveSentenceKey,
  setRefreshIntonationUi,
} from './state.js';
import { escapeHtml } from './utils.js';
import { bumpActiveUpdatedAt, setEditorHooks } from './projects.js';
import { schedulePersist } from './persist.js';

export function updateSegmentPanelsVisibility() {
  const hasSelection = activeSentenceKey != null;
  els.paramPane.classList.toggle('is-inactive', !hasSelection);
  els.intonationDock.classList.toggle('is-inactive', !hasSelection);
}

export function saveActiveSegmentParams() {
  if (activeSentenceKey == null) return;
  const p = activeProject();
  if (!p) return;
  if (!p.sentenceParamsByKey) p.sentenceParamsByKey = {};
  const saved = snapshotParamsFromControls(segmentParamControls);
  const base = cloneParams(p.params);
  if (paramsEqual(saved, base)) {
    delete p.sentenceParamsByKey[activeSentenceKey];
  } else {
    p.sentenceParamsByKey[activeSentenceKey] = cloneParams(saved);
  }
  bumpActiveUpdatedAt();
  schedulePersist();
}

export function clearSentenceSelection() {
  if (activeSentenceKey != null) saveActiveSegmentParams();
  setActiveSentenceKey(null);
  updateSegmentPanelsVisibility();
  renderIntonationUI();
  renderSegmentOverlay();
}

/**
 * @param {string} key
 */
export function selectSentence(key) {
  if (activeSentenceKey != null && activeSentenceKey !== key) {
    saveActiveSegmentParams();
  }
  const p = activeProject();
  if (!p) return;

  setActiveSentenceKey(key);
  const params = getSentenceParams(p, key);
  applyParamsToControls(segmentParamControls, params);
  refreshValueLabelsFor(segmentParamControls);
  updateSegmentPanelsVisibility();
  renderIntonationUI();
  const range = sentenceRangesFromText(els.editor.value).find((r) => r.key === key);
  if (range) void ensureSegmentProsody(p, key, range.text);
  renderSegmentOverlay();
}

export function resetActiveSegmentParams() {
  if (activeSentenceKey == null) return;
  const p = activeProject();
  if (!p) return;
  if (p.sentenceParamsByKey) delete p.sentenceParamsByKey[activeSentenceKey];
  applyParamsToControls(segmentParamControls, p.params);
  refreshValueLabelsFor(segmentParamControls);
  if (p.sentenceProsodyByKey) delete p.sentenceProsodyByKey[activeSentenceKey];
  const range = sentenceRangesFromText(els.editor.value).find((r) => r.key === activeSentenceKey);
  if (range) void ensureSegmentProsody(p, activeSentenceKey, range.text, { force: true });
  bumpActiveUpdatedAt();
  schedulePersist();
  renderSegmentOverlay();
  renderIntonationUI();
}

export function syncSelectionFromEditorCursor() {
  const text = els.editor.value;
  const ranges = sentenceRangesFromText(text);
  const pos = els.editor.selectionStart;
  const r = findRangeAtCursor(pos, ranges);
  if (r) {
    if (r.key !== activeSentenceKey) selectSentence(r.key);
    return;
  }
  if (activeSentenceKey != null) clearSentenceSelection();
}

/**
 * @param {string} text
 * @param {import('./state.js').SentenceRange[]} ranges
 */
function buildMirrorHtml(text, ranges) {
  if (!text) return '';
  const p = activeProject();
  let html = '';
  let cursor = 0;
  for (const r of ranges) {
    if (cursor < r.start) html += escapeHtml(text.slice(cursor, r.start));
    const cls = ['segment-sent'];
    if (activeSentenceKey === r.key) cls.push('active');
    if (hasCustomSentenceParams(p, r.key)) cls.push('custom');
    html += `<span class="${cls.join(' ')}" data-key="${r.key}" data-index="${r.index}">${escapeHtml(text.slice(r.start, r.end))}</span>`;
    cursor = r.end;
  }
  if (cursor < text.length) html += escapeHtml(text.slice(cursor));
  return html;
}

function syncMirrorStyles() {
  const cs = getComputedStyle(els.editor);
  const m = els.segmentMirror;
  m.style.font = cs.font;
  m.style.fontSize = cs.fontSize;
  m.style.fontFamily = cs.fontFamily;
  m.style.lineHeight = cs.lineHeight;
  m.style.letterSpacing = cs.letterSpacing;
  m.style.padding = cs.padding;
  m.style.boxSizing = cs.boxSizing;
  m.style.whiteSpace = 'pre-wrap';
  m.style.wordWrap = 'break-word';
  m.style.overflowWrap = cs.overflowWrap;
}

export function syncEditorOverlayScroll() {
  const st = els.editor.scrollTop;
  els.segmentMirror.style.transform = `translate3d(0, ${-st}px, 0)`;
}

export function renderIntonationUI() {
  const p = activeProject();
  const key = activeSentenceKey;
  els.intonationTextStrip.innerHTML = '';
  els.intonationSliderStrip.innerHTML = '';
  els.intonationContent.hidden = false;
  els.btnRegenerateProsody.disabled = key == null;

  if (!p || key == null) {
    els.intonationContent.hidden = true;
    return;
  }

  const entry = getSegmentProsody(p, key);
  if (!entry?.detail?.length) return;

  const cells = buildHiraganaCellsFromDetail(entry.detail);
  if (!cells.length) return;

  const charCount = cells.length;
  const gridCols = `repeat(${charCount}, ${INTONATION_CHAR_WIDTH}px)`;
  els.intonationTextStrip.style.gridTemplateColumns = gridCols;

  const moraSpans = buildMoraSpansFromDetail(entry.detail);

  for (const span of moraSpans) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'intonation-mora-input';
    input.value = span.mora.hira || '';
    input.style.gridColumn = `${span.charStart + 1} / ${span.charEnd + 1}`;
    input.setAttribute('aria-label', `${span.mora.hira || ''} の読み`);
    input.spellcheck = false;
    input.autocomplete = 'off';

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        input.blur();
      }
    });

    input.addEventListener('blur', () => {
      const next = input.value.normalize('NFKC').trim();
      const prev = (span.mora.hira || '').normalize('NFKC').trim();
      if (!next) {
        input.value = span.mora.hira || '';
        return;
      }
      if (next === prev) return;
      span.mora.hira = next;
      bumpActiveUpdatedAt();
      scheduleProsodyKanaReestimate(p, key);
    });

    els.intonationTextStrip.appendChild(input);
  }

  els.intonationSliderStrip.style.gridTemplateColumns = gridCols;

  /** @type {Map<import('./state.js').SegmentMora, { sliders: HTMLInputElement[], pitchVals: HTMLElement[] }>} */
  const moraUi = new Map();

  for (const cell of cells) {
    const col = document.createElement('div');
    col.className = 'intonation-char-col';

    const pitch = getMoraPitch(cell.mora);

    const pitchVal = document.createElement('span');
    pitchVal.className = 'intonation-char-pitch';
    pitchVal.textContent = pitch.toFixed(2);

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'intonation-char-slider-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'intonation-char-slider';
    slider.min = String(MORA_PITCH_MIN);
    slider.max = String(MORA_PITCH_MAX);
    slider.step = '0.05';
    slider.value = String(pitch);
    slider.setAttribute('aria-label', `${cell.char} のピッチ`);

    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      setMoraPitch(cell.mora, v);
      const group = moraUi.get(cell.mora);
      if (group) {
        for (const s of group.sliders) s.value = String(v);
        for (const p of group.pitchVals) p.textContent = v.toFixed(2);
      }
      bumpActiveUpdatedAt();
      schedulePersist();
    });

    sliderWrap.appendChild(slider);
    col.append(pitchVal, sliderWrap);
    els.intonationSliderStrip.appendChild(col);

    if (!moraUi.has(cell.mora)) moraUi.set(cell.mora, { sliders: [], pitchVals: [] });
    moraUi.get(cell.mora).sliders.push(slider);
    moraUi.get(cell.mora).pitchVals.push(pitchVal);
  }
}

export function renderSegmentOverlay() {
  syncMirrorStyles();
  const text = els.editor.value;
  const p = activeProject();
  const ranges = sentenceRangesFromText(text);

  if (p) {
    if (lastSentenceRanges.length) {
      remapSentenceParams(p, lastSentenceRanges, ranges);
      remapSentenceProsody(p, lastSentenceRanges, ranges);
    } else {
      migrateSentenceParamsForProject(p);
    }
    if (!p.sentenceProsodyByKey) p.sentenceProsodyByKey = {};
    scheduleProsodyForRanges(p, ranges);
  }
  lastSentenceRanges.length = 0;
  lastSentenceRanges.push(...ranges);

  if (activeSentenceKey != null && !ranges.some((r) => r.key === activeSentenceKey)) {
    setActiveSentenceKey(null);
    updateSegmentPanelsVisibility();
  }

  els.segmentMirror.innerHTML = buildMirrorHtml(text, ranges);
  syncEditorOverlayScroll();
}

export function refreshValueLabels() {
  refreshValueLabelsFor(segmentParamControls);
}

export function initEditor() {
  setRefreshIntonationUi(renderIntonationUI);
  setEditorHooks({
    saveActiveSegmentParams,
    renderSegmentOverlay,
    updateSegmentPanelsVisibility,
  });
}
