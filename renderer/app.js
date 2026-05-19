(() => {
  const MAITA_UUID = '24e48b20-c14c-11f0-a12e-0242ac1c000c';

  const PARAM_DEFAULTS = {
    speedScale: 1,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
    outputSamplingRate: 24000,
    processingAlgorithm: 'td-psola',
  };

  const GAP_SILENCE_SEC = 0.28;
  const DEFAULT_API_BASE = 'http://127.0.0.1:50032';

  /**
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {number} [ms]
   */
  function fetchWithTimeout(url, init = {}, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(id));
  }

  /** 読みからモーラ数のおおよその数（送信時のみ使用。ひらがな・カタカナ想定・拗音などは直前までを1モーラとみなす簡易版） */
  function countMorasFromYomi(yomi) {
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

  /** OpenAPI 上は整数のみ。COEIROINK でよく使う値から選択（プロジェクト保存値は最寄りに丸める） */
  const SAMPLE_RATE_OPTIONS = [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000];

  /** @type {typeof window.maita} */
  const bridge = window.maita;

  const els = {
    projectList: document.getElementById('projectList'),
    btnNewProject: document.getElementById('btnNewProject'),
    projectTitle: document.getElementById('projectTitle'),
    editor: document.getElementById('editor'),
    btnUndo: document.getElementById('btnUndo'),
    btnRedo: document.getElementById('btnRedo'),
    btnPlay: document.getElementById('btnPlay'),
    btnExport: document.getElementById('btnExport'),
    processingAlgorithm: document.getElementById('processingAlgorithm'),
    toast: document.getElementById('toast'),
    outputSamplingRate: document.getElementById('outputSamplingRate'),
    speedScale: document.getElementById('speedScale'),
    pitchScale: document.getElementById('pitchScale'),
    intonationScale: document.getElementById('intonationScale'),
    volumeScale: document.getElementById('volumeScale'),
    prePhonemeLength: document.getElementById('prePhonemeLength'),
    postPhonemeLength: document.getElementById('postPhonemeLength'),
    speedScaleVal: document.getElementById('speedScaleVal'),
    pitchScaleVal: document.getElementById('pitchScaleVal'),
    intonationScaleVal: document.getElementById('intonationScaleVal'),
    volumeScaleVal: document.getElementById('volumeScaleVal'),
    prePhonemeLengthVal: document.getElementById('prePhonemeLengthVal'),
    postPhonemeLengthVal: document.getElementById('postPhonemeLengthVal'),
    btnDictionary: document.getElementById('btnDictionary'),
    dictionaryModal: document.getElementById('dictionaryModal'),
    dictionaryRows: document.getElementById('dictionaryRows'),
    btnDictDismiss: document.getElementById('btnDictDismiss'),
    btnDictClose: document.getElementById('btnDictClose'),
    btnDictApply: document.getElementById('btnDictApply'),
    btnDictAddRow: document.getElementById('btnDictAddRow'),
    engineDot: document.getElementById('engineDot'),
    engineStatusText: document.getElementById('engineStatusText'),
    editorWrap: document.getElementById('editorWrap'),
    segmentMirror: document.getElementById('segmentMirror'),
    segmentBars: document.getElementById('segmentBars'),
    sentenceParamFloat: document.getElementById('sentenceParamFloat'),
    sentenceParamFloatPreview: document.getElementById('sentenceParamFloatPreview'),
    btnSentenceParamClose: document.getElementById('btnSentenceParamClose'),
    btnSentenceParamReset: document.getElementById('btnSentenceParamReset'),
    floatSpeedScale: document.getElementById('floatSpeedScale'),
    floatPitchScale: document.getElementById('floatPitchScale'),
    floatIntonationScale: document.getElementById('floatIntonationScale'),
    floatVolumeScale: document.getElementById('floatVolumeScale'),
    floatPrePhonemeLength: document.getElementById('floatPrePhonemeLength'),
    floatPostPhonemeLength: document.getElementById('floatPostPhonemeLength'),
    floatOutputSamplingRate: document.getElementById('floatOutputSamplingRate'),
    floatProcessingAlgorithm: document.getElementById('floatProcessingAlgorithm'),
    floatSpeedScaleVal: document.getElementById('floatSpeedScaleVal'),
    floatPitchScaleVal: document.getElementById('floatPitchScaleVal'),
    floatIntonationScaleVal: document.getElementById('floatIntonationScaleVal'),
    floatVolumeScaleVal: document.getElementById('floatVolumeScaleVal'),
    floatPrePhonemeLengthVal: document.getElementById('floatPrePhonemeLengthVal'),
    floatPostPhonemeLengthVal: document.getElementById('floatPostPhonemeLengthVal'),
  };

  els.btnPlayIconPlay = els.btnPlay.querySelector('.icon-play');
  els.btnPlayIconStop = els.btnPlay.querySelector('.icon-stop');
  els.waveformCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('waveformCanvas'));

  /** 琵音マイタの API styleId（話者一覧から自動決定、「のーまる」優先） */
  let maitaStyleId = 0;

  /** @type {HTMLAudioElement | null} */
  let currentAudio = null;
  /** @type {string | null} */
  let currentBlobUrl = null;
  /** @type {number | null} */
  let waveformRaf = null;
  /** @type {number[]} */
  let waveformPhases = [];

  /** @typedef {Record<string, number|string>} ParamSet */
  /** @typedef {{ key: string, start: number, end: number, text: string, index: number }} SentenceRange */
  /** @typedef {{ id: string, title: string, text: string, params: ParamSet, sentenceParamsByKey?: Record<string, ParamSet>, updatedAt: string }} Project */

  /** @type {Project[]} */
  let projects = [];
  /** @type {string | null} */
  let activeId = null;
  /** @type {string | null} */
  let activeSentenceKey = null;
  /** @type {string | null} */
  let floatSentenceKey = null;
  /** @type {SentenceRange[]} */
  let lastSentenceRanges = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let saveTimer = null;

  /** @type {{ word: string, yomi: string, accent: number }[]} */
  let dictionaryEntries = [];

  function showToast(msg, ms = 3400) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      els.toast.hidden = true;
    }, ms);
  }

  function coerceSampleRate(value) {
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

  function snapshotParams() {
    return snapshotParamsFromControls(mainParamControls);
  }

  /** @param {ParamSet} a @param {ParamSet} b */
  function paramsEqual(a, b) {
    const keys = [
      'speedScale',
      'pitchScale',
      'intonationScale',
      'volumeScale',
      'prePhonemeLength',
      'postPhonemeLength',
      'outputSamplingRate',
      'processingAlgorithm',
    ];
    for (const k of keys) {
      if (String(a[k]) !== String(b[k])) return false;
    }
    return true;
  }

  /** @param {ParamSet} params */
  function cloneParams(params) {
    return { ...PARAM_DEFAULTS, ...params };
  }

  /**
   * @param {Record<string, HTMLElement | null>} root
   */
  function snapshotParamsFromControls(root) {
    return {
      speedScale: Number(root.speedScale.value),
      pitchScale: Number(root.pitchScale.value),
      intonationScale: Number(root.intonationScale.value),
      volumeScale: Number(root.volumeScale.value),
      prePhonemeLength: Number(root.prePhonemeLength.value),
      postPhonemeLength: Number(root.postPhonemeLength.value),
      outputSamplingRate: Number(root.outputSamplingRate.value),
      processingAlgorithm: root.processingAlgorithm.value,
    };
  }

  /**
   * @param {Record<string, HTMLElement | null>} root
   * @param {ParamSet} params
   */
  function applyParamsToControls(root, params) {
    const par = { ...PARAM_DEFAULTS, ...params };
    root.speedScale.value = String(par.speedScale);
    root.pitchScale.value = String(par.pitchScale);
    root.intonationScale.value = String(par.intonationScale);
    root.volumeScale.value = String(par.volumeScale);
    root.prePhonemeLength.value = String(par.prePhonemeLength);
    root.postPhonemeLength.value = String(par.postPhonemeLength);
    root.outputSamplingRate.value = String(coerceSampleRate(par.outputSamplingRate ?? PARAM_DEFAULTS.outputSamplingRate));
    root.processingAlgorithm.value = String(par.processingAlgorithm);
  }

  /**
   * @param {Record<string, HTMLElement | null>} root
   */
  function refreshValueLabelsFor(root) {
    const fmt = (n, d = 2) => Number(n).toFixed(d);
    root.speedScaleVal.textContent = fmt(root.speedScale.value);
    root.pitchScaleVal.textContent = fmt(root.pitchScale.value);
    root.intonationScaleVal.textContent = fmt(root.intonationScale.value);
    root.volumeScaleVal.textContent = fmt(root.volumeScale.value);
    root.prePhonemeLengthVal.textContent = fmt(root.prePhonemeLength.value);
    root.postPhonemeLengthVal.textContent = fmt(root.postPhonemeLength.value);
  }

  const mainParamControls = {
    speedScale: els.speedScale,
    pitchScale: els.pitchScale,
    intonationScale: els.intonationScale,
    volumeScale: els.volumeScale,
    prePhonemeLength: els.prePhonemeLength,
    postPhonemeLength: els.postPhonemeLength,
    outputSamplingRate: els.outputSamplingRate,
    processingAlgorithm: els.processingAlgorithm,
    speedScaleVal: els.speedScaleVal,
    pitchScaleVal: els.pitchScaleVal,
    intonationScaleVal: els.intonationScaleVal,
    volumeScaleVal: els.volumeScaleVal,
    prePhonemeLengthVal: els.prePhonemeLengthVal,
    postPhonemeLengthVal: els.postPhonemeLengthVal,
  };

  const floatParamControls = {
    speedScale: els.floatSpeedScale,
    pitchScale: els.floatPitchScale,
    intonationScale: els.floatIntonationScale,
    volumeScale: els.floatVolumeScale,
    prePhonemeLength: els.floatPrePhonemeLength,
    postPhonemeLength: els.floatPostPhonemeLength,
    outputSamplingRate: els.floatOutputSamplingRate,
    processingAlgorithm: els.floatProcessingAlgorithm,
    speedScaleVal: els.floatSpeedScaleVal,
    pitchScaleVal: els.floatPitchScaleVal,
    intonationScaleVal: els.floatIntonationScaleVal,
    volumeScaleVal: els.floatVolumeScaleVal,
    prePhonemeLengthVal: els.floatPrePhonemeLengthVal,
    postPhonemeLengthVal: els.floatPostPhonemeLengthVal,
  };

  function deriveTitle(text) {
    const line = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (!line) return '無題';
    return line.length > 42 ? `${line.slice(0, 42)}…` : line;
  }

  function bumpActiveUpdatedAt() {
    const p = activeProject();
    if (p) p.updatedAt = new Date().toISOString();
  }

  /**
   * @param {string} iso
   */
  function formatUpdatedLabel(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  /**
   * @param {unknown[]} list
   */
  function migrateProjects(list) {
    const now = new Date().toISOString();
    for (const raw of list) {
      const p = /** @type {Project} */ (raw);
      if (!p.updatedAt) p.updatedAt = now;
      if (p.params && p.params.outputSamplingRate != null) {
        p.params.outputSamplingRate = coerceSampleRate(p.params.outputSamplingRate);
      }
      if (!Array.isArray(p.sentenceParams) && !p.sentenceParamsByKey) p.sentenceParamsByKey = {};
      migrateSentenceParamsForProject(p);
    }
  }

  /**
   * @param {Project} project
   */
  function migrateSentenceParamsForProject(project) {
    if (project.sentenceParamsByKey) return;
    project.sentenceParamsByKey = {};
    const ranges = sentenceRangesFromText(project.text || '');
    if (Array.isArray(project.sentenceParams)) {
      for (let i = 0; i < ranges.length; i++) {
        const custom = project.sentenceParams[i];
        if (custom && typeof custom === 'object') {
          project.sentenceParamsByKey[ranges[i].key] = cloneParams(custom);
        }
      }
    }
    delete project.sentenceParams;
  }

  /**
   * @param {string} text
   * @returns {SentenceRange[]}
   */
  function sentenceRangesFromText(text) {
    /** @type {SentenceRange[]} */
    const ranges = [];
    let buf = '';
    let segStart = 0;
    let index = 0;
    for (let i = 0; i < text.length; i++) {
      buf += text[i];
      if (text[i] === '。') {
        const trimmed = buf.trim();
        if (trimmed) {
          const lead = buf.length - buf.trimStart().length;
          const start = segStart + lead;
          const end = i + 1;
          ranges.push({
            key: `s${start}`,
            start,
            end,
            text: text.slice(start, end),
            index: index++,
          });
        }
        buf = '';
        segStart = i + 1;
      }
    }
    const tail = buf.trim();
    if (tail) {
      const lead = buf.length - buf.trimStart().length;
      const start = segStart + lead;
      ranges.push({
        key: `s${start}`,
        start,
        end: text.length,
        text: text.slice(start, text.length),
        index: index++,
      });
    }
    return ranges;
  }

  /**
   * @param {string} text
   */
  function sentencesFromText(text) {
    return sentenceRangesFromText(text).map((r) => r.text);
  }

  /**
   * @param {Project} project
   * @param {SentenceRange[]} prevRanges
   * @param {SentenceRange[]} newRanges
   */
  function remapSentenceParams(project, prevRanges, newRanges) {
    const oldMap = project.sentenceParamsByKey || {};
    /** @type {Record<string, ParamSet>} */
    const next = {};
    const usedOldKeys = new Set();

    for (const nr of newRanges) {
      if (oldMap[nr.key]) {
        next[nr.key] = cloneParams(oldMap[nr.key]);
        continue;
      }
      const prev = prevRanges.find((pr) => pr.text === nr.text && !usedOldKeys.has(pr.key));
      if (prev && oldMap[prev.key]) {
        next[nr.key] = cloneParams(oldMap[prev.key]);
        usedOldKeys.add(prev.key);
      }
    }
    project.sentenceParamsByKey = next;
  }

  /**
   * @param {Project | null} project
   * @param {string} key
   */
  function getSentenceParams(project, key) {
    if (!project) return cloneParams(snapshotParams());
    const base = cloneParams(project.params);
    const custom = project.sentenceParamsByKey?.[key];
    return custom ? cloneParams(custom) : base;
  }

  /**
   * @param {Project | null} project
   * @param {string} key
   */
  function hasCustomSentenceParams(project, key) {
    return !!(project?.sentenceParamsByKey?.[key]);
  }

  /**
   * @param {string} s
   */
  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {string} text
   * @param {SentenceRange[]} ranges
   */
  function buildMirrorHtml(text, ranges) {
    if (!text) return '';
    let html = '';
    let cursor = 0;
    for (const r of ranges) {
      if (cursor < r.start) html += escapeHtml(text.slice(cursor, r.start));
      html += `<span class="segment-sent" data-key="${r.key}" data-index="${r.index}">${escapeHtml(text.slice(r.start, r.end))}</span>`;
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

  function syncEditorOverlayScroll() {
    const st = els.editor.scrollTop;
    const transform = `translate3d(0, ${-st}px, 0)`;
    els.segmentMirror.style.transform = transform;
    els.segmentBars.style.transform = transform;
    positionInlineBars();
  }

  function positionInlineBars() {
    const wrapRect = els.editorWrap.getBoundingClientRect();
    const mirrorSpans = els.segmentMirror.querySelectorAll('.segment-sent');
    const bars = els.segmentBars.querySelectorAll('.segment-inline-bar');
    mirrorSpans.forEach((span, i) => {
      const bar = bars[i];
      if (!bar) return;
      const rect = span.getBoundingClientRect();
      bar.style.left = `${rect.left - wrapRect.left}px`;
      bar.style.top = `${rect.bottom - wrapRect.top + 3}px`;
      bar.style.width = `${Math.max(rect.width, 28)}px`;
    });
  }

  function renderSegmentOverlay() {
    syncMirrorStyles();
    const text = els.editor.value;
    const p = activeProject();
    const ranges = sentenceRangesFromText(text);

    if (p) {
      if (lastSentenceRanges.length) remapSentenceParams(p, lastSentenceRanges, ranges);
      else migrateSentenceParamsForProject(p);
    }
    lastSentenceRanges = ranges;

    if (floatSentenceKey != null && !ranges.some((r) => r.key === floatSentenceKey)) {
      closeSentenceParamFloat();
    }

    els.segmentMirror.innerHTML = buildMirrorHtml(text, ranges);
    els.segmentBars.innerHTML = '';

    if (!text || ranges.length === 0) {
      activeSentenceKey = null;
      return;
    }

    for (const r of ranges) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'segment-inline-bar';
      btn.dataset.key = r.key;
      if (activeSentenceKey === r.key) btn.classList.add('active');
      if (hasCustomSentenceParams(p, r.key)) btn.classList.add('custom');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', activeSentenceKey === r.key ? 'true' : 'false');
      const preview = r.text.length > 48 ? `${r.text.slice(0, 48)}…` : r.text;
      btn.title = preview;
      btn.setAttribute('aria-label', `文 ${r.index + 1}: ${preview}`);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openSentenceParamFloat(r.key, r.index, r.text, btn.getBoundingClientRect());
      });
      els.segmentBars.appendChild(btn);
    }

    syncEditorOverlayScroll();
  }

  function saveFloatParamsToProject() {
    if (floatSentenceKey == null) return;
    const p = activeProject();
    if (!p) return;
    if (!p.sentenceParamsByKey) p.sentenceParamsByKey = {};
    const saved = snapshotParamsFromControls(floatParamControls);
    const base = cloneParams(p.params);
    if (paramsEqual(saved, base)) {
      delete p.sentenceParamsByKey[floatSentenceKey];
    } else {
      p.sentenceParamsByKey[floatSentenceKey] = cloneParams(saved);
    }
    bumpActiveUpdatedAt();
    schedulePersist();
    updateInlineBarStates();
  }

  function updateInlineBarStates() {
    const p = activeProject();
    for (const btn of els.segmentBars.querySelectorAll('.segment-inline-bar')) {
      const key = btn.dataset.key;
      if (!key) continue;
      btn.classList.toggle('active', key === activeSentenceKey);
      btn.classList.toggle('custom', hasCustomSentenceParams(p, key));
      btn.setAttribute('aria-selected', key === activeSentenceKey ? 'true' : 'false');
    }
  }

  /**
   * @param {string} key
   * @param {number} index
   * @param {string} previewText
   * @param {DOMRect} anchorRect
   */
  function openSentenceParamFloat(key, index, previewText, anchorRect) {
    if (floatSentenceKey != null && floatSentenceKey !== key) {
      saveFloatParamsToProject();
    }
    const p = activeProject();
    if (!p) return;

    floatSentenceKey = key;
    activeSentenceKey = key;
    const params = getSentenceParams(p, key);
    applyParamsToControls(floatParamControls, params);
    refreshValueLabelsFor(floatParamControls);

    els.sentenceParamFloatPreview.textContent =
      previewText.length > 56 ? `${previewText.slice(0, 56)}…` : previewText;

    els.sentenceParamFloat.classList.remove('hidden');
    positionSentenceParamFloat(anchorRect);
    renderSegmentOverlay();
  }

  /** @param {DOMRect} anchorRect */
  function positionSentenceParamFloat(anchorRect) {
    const panel = els.sentenceParamFloat;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left = anchorRect.left + anchorRect.width / 2 - pw / 2;
    let top = anchorRect.bottom + 10;
    if (top + ph > window.innerHeight - 12) {
      top = anchorRect.top - ph - 10;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - ph - 12));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function closeSentenceParamFloat() {
    saveFloatParamsToProject();
    floatSentenceKey = null;
    els.sentenceParamFloat.classList.add('hidden');
    renderSegmentOverlay();
  }

  function resetFloatSentenceParams() {
    if (floatSentenceKey == null) return;
    const p = activeProject();
    if (!p?.sentenceParamsByKey) return;
    delete p.sentenceParamsByKey[floatSentenceKey];
    applyParamsToControls(floatParamControls, p.params);
    refreshValueLabelsFor(floatParamControls);
    bumpActiveUpdatedAt();
    schedulePersist();
    renderSegmentOverlay();
  }

  function activeProject() {
    return projects.find((p) => p.id === activeId) || null;
  }

  function syncActiveProjectFromUi() {
    const p = activeProject();
    if (!p) return;
    p.text = els.editor.value;
    p.title = deriveTitle(p.text);
    p.params = snapshotParams();
    els.projectTitle.textContent = p.title;
    renderProjectList();
    renderSegmentOverlay();
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistProjects(), 320);
  }

  async function persistProjects() {
    syncActiveProjectFromUi();
    await bridge.saveProjects({ projects, activeId });
  }

  function renderProjectList() {
    els.projectList.innerHTML = '';
    const sorted = [...projects].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    for (const p of sorted) {
      const li = document.createElement('li');
      li.className = `project-item${p.id === activeId ? ' active' : ''}`;
      li.setAttribute('role', 'option');
      li.dataset.id = p.id;
      const updatedLabel = formatUpdatedLabel(p.updatedAt);
      li.innerHTML = `
        <div class="project-item-main">
          <div class="project-item-title"></div>
          <div class="project-item-meta"></div>
        </div>
        <button type="button" class="project-item-delete" aria-label="プロジェクトを削除">×</button>
      `;
      li.querySelector('.project-item-title').textContent = p.title || '無題';
      li.querySelector('.project-item-meta').textContent = updatedLabel ? `更新 ${updatedLabel}` : '';
      li.addEventListener('click', (ev) => {
        if (/** @type {Element} */ (ev.target).closest('.project-item-delete')) return;
        selectProject(p.id);
      });
      li.querySelector('.project-item-delete').addEventListener('click', (ev) => {
        ev.stopPropagation();
        void deleteProject(p.id);
      });
      els.projectList.appendChild(li);
    }
  }

  async function deleteProject(id) {
    if (projects.length <= 1) {
      showToast('最後のプロジェクトは削除できません');
      return;
    }
    const confirmed = await bridge.confirmDeleteProject();
    if (!confirmed) return;

    const wasActive = activeId === id;
    projects = projects.filter((p) => p.id !== id);

    if (wasActive) {
      activeId = projects[0].id;
      selectProject(activeId);
    } else {
      renderProjectList();
      void persistProjects();
    }
  }

  function selectProject(id) {
    if (activeId !== id) {
      closeSentenceParamFloat();
      syncActiveProjectFromUi();
    }
    activeId = id;
    activeSentenceKey = null;
    lastSentenceRanges = [];
    const p = activeProject();
    if (!p) return;
    migrateSentenceParamsForProject(p);
    els.editor.value = p.text || '';
    applyParamsToControls(mainParamControls, p.params);
    refreshValueLabels();
    els.projectTitle.textContent = p.title || '無題';
    renderProjectList();
    renderSegmentOverlay();
    schedulePersist();
  }

  function newProject() {
    syncActiveProjectFromUi();
    const now = new Date().toISOString();
    /** @type {Project} */
    const p = {
      id: crypto.randomUUID(),
      title: '無題',
      text: '',
      params: { ...PARAM_DEFAULTS },
      sentenceParamsByKey: {},
      updatedAt: now,
    };
    projects.unshift(p);
    activeId = p.id;
    selectProject(p.id);
    els.editor.focus();
  }

  function refreshValueLabels() {
    refreshValueLabelsFor(mainParamControls);
  }

  /**
   * @param {ArrayBuffer} ab
   */
  function parseWav(ab) {
    const u8 = new Uint8Array(ab);
    const dv = new DataView(ab);
    if (u8.length < 44) throw new Error('WAV が短すぎます');
    /** @type {{ audioFormat: number, numChannels: number, sampleRate: number, bitsPerSample: number }} */
    let fmt = null;
    let dataOffset = 0;
    let dataSize = 0;
    let offset = 12;
    while (offset + 8 <= u8.length) {
      const id = String.fromCharCode(u8[offset], u8[offset + 1], u8[offset + 2], u8[offset + 3]);
      const chunkSize = dv.getUint32(offset + 4, true);
      if (id === 'fmt ') {
        fmt = {
          audioFormat: dv.getUint16(offset + 8, true),
          numChannels: dv.getUint16(offset + 10, true),
          sampleRate: dv.getUint32(offset + 12, true),
          bitsPerSample: dv.getUint16(offset + 22, true),
        };
      } else if (id === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
    }
    if (!fmt || !dataSize) throw new Error('WAV の解析に失敗しました');
    const pcm = u8.slice(dataOffset, dataOffset + dataSize);
    return { ...fmt, pcm, pcmByteLength: pcm.byteLength };
  }

  /**
   * @param {number} sampleRate
   * @param {number} numChannels
   * @param {number} bitsPerSample
   * @param {Uint8Array} pcmData
   */
  function buildStandardWav(sampleRate, numChannels, bitsPerSample, pcmData) {
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(buffer);
    const out = new Uint8Array(buffer);
    const wstr = (pos, s) => {
      for (let i = 0; i < s.length; i++) out[pos + i] = s.charCodeAt(i);
    };
    wstr(0, 'RIFF');
    dv.setUint32(4, 36 + dataSize, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, numChannels, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, byteRate, true);
    dv.setUint16(32, blockAlign, true);
    dv.setUint16(34, bitsPerSample, true);
    wstr(36, 'data');
    dv.setUint32(40, dataSize, true);
    out.set(pcmData, 44);
    return buffer;
  }

  /**
   * @param {{ sampleRate: number, numChannels: number, bitsPerSample: number }} meta
   * @param {number} seconds
   */
  function silenceBuffer(meta, seconds) {
    const bytesPerSample = meta.bitsPerSample / 8;
    const n = Math.floor(seconds * meta.sampleRate) * meta.numChannels * bytesPerSample;
    return buildStandardWav(meta.sampleRate, meta.numChannels, meta.bitsPerSample, new Uint8Array(n));
  }

  /**
   * @param {ArrayBuffer[]} buffers
   */
  function concatWavBuffers(buffers) {
    if (buffers.length === 0) throw new Error('結合する音声がありません');
    if (buffers.length === 1) return buffers[0];
    const parsed = buffers.map(parseWav);
    const m0 = parsed[0];
    for (let i = 1; i < parsed.length; i++) {
      const m = parsed[i];
      if (m.sampleRate !== m0.sampleRate || m.numChannels !== m0.numChannels || m.bitsPerSample !== m0.bitsPerSample) {
        throw new Error('行ごとの WAV 形式が一致しません。サンプルレートを固定して再試行してください。');
      }
    }
    const totalPcm = parsed.reduce((s, p) => s + p.pcmByteLength, 0);
    const merged = new Uint8Array(totalPcm);
    let off = 0;
    for (const p of parsed) {
      merged.set(p.pcm, off);
      off += p.pcmByteLength;
    }
    return buildStandardWav(m0.sampleRate, m0.numChannels, m0.bitsPerSample, merged);
  }

  /**
   * @param {string} textLine
   * @param {ParamSet} [paramsOverride]
   */
  async function synthesizeLine(textLine, paramsOverride) {
    if (!maitaStyleId) {
      throw new Error('COEIROINK から琵音マイタのスタイルを取得できません。左下の接続状態を確認してエンジンを起動してから再度お試しください。');
    }
    const url = `${DEFAULT_API_BASE}/v1/synthesis`;
    const params = paramsOverride ?? snapshotParams();
    const body = {
      speakerUuid: MAITA_UUID,
      styleId: maitaStyleId,
      text: textLine,
      speedScale: params.speedScale,
      volumeScale: params.volumeScale,
      pitchScale: params.pitchScale,
      intonationScale: params.intonationScale,
      prePhonemeLength: params.prePhonemeLength,
      postPhonemeLength: params.postPhonemeLength,
      outputSamplingRate: params.outputSamplingRate,
      processingAlgorithm: params.processingAlgorithm,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(errText || `HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  }

  async function buildFullUtterance() {
    saveFloatParamsToProject();
    const p = activeProject();
    const ranges = sentenceRangesFromText(els.editor.value);
    if (ranges.length === 0) {
      throw new Error('読み上げるテキストがありません（「。」で区切った文が必要です）。');
    }
    /** @type {ArrayBuffer[]} */
    const parts = [];
    for (const r of ranges) {
      const params = getSentenceParams(p, r.key);
      const wav = await synthesizeLine(r.text, params);
      parts.push(wav);
    }
    return concatWavBuffers(parts);
  }

  /** @param {{ silentToast?: boolean }} [opts] */
  async function refreshCoeiroinkStatus(opts = {}) {
    const silent = !!opts.silentToast;
    els.engineDot.classList.remove('ok', 'warn', 'err');
    els.engineStatusText.textContent = 'COEIROINK を確認しています…';

    try {
      const root = await fetchWithTimeout(`${DEFAULT_API_BASE}/`, {}, 6000);
      if (!root.ok) throw new Error(`HTTP ${root.status}`);
      let rootStatus = 'OK';
      try {
        const j = await root.json();
        if (j && typeof j.status === 'string') rootStatus = j.status;
      } catch (_) {
        /* plain text の場合もある */
      }

      try {
        const res = await fetchWithTimeout(`${DEFAULT_API_BASE}/v1/speakers`, {}, 9000);
        if (!res.ok) throw new Error(`speakers ${res.status}`);
        /** @type {{ speakerUuid: string, styles: { styleId: number, styleName: string }[]}[]} */
        const list = await res.json();
        const maita = list.find((s) => s.speakerUuid === MAITA_UUID);
        if (!maita?.styles?.length) {
          maitaStyleId = 0;
          els.engineDot.classList.add('warn');
          els.engineStatusText.textContent = `エンジン応答あり（琵音マイタが一覧に見つかりません）· ${DEFAULT_API_BASE}`;
          if (!silent) {
            showToast(`この COEIROINK に琵音マイタが見つかりません。（${MAITA_UUID}）`);
          }
          return;
        }
        const preferred =
          maita.styles.find((s) => s.styleName === 'のーまる') ||
          maita.styles.find((s) => s.styleName.includes('のーまる'));
        maitaStyleId = preferred ? preferred.styleId : maita.styles[0].styleId;
        els.engineDot.classList.add('ok');
        els.engineStatusText.textContent = `COEIROINK と通信中 · ${rootStatus}`;
      } catch (_) {
        maitaStyleId = 0;
        els.engineDot.classList.add('warn');
        els.engineStatusText.textContent = `API は応答したが話者一覧を取得できません · ${DEFAULT_API_BASE}`;
        if (!silent) showToast('話者一覧（/v1/speakers）を取得できませんでした');
      }
    } catch (_) {
      maitaStyleId = 0;
      els.engineDot.classList.add('err');
      els.engineStatusText.textContent = `COEIROINK に接続できません（エンジンまたは ${DEFAULT_API_BASE}）`;
      if (!silent) {
        showToast('COEIROINK に接続できません。COEIROINK を起動してから再度お試しください。');
      }
    }
  }

  function resizeWaveformCanvas() {
    const canvas = els.waveformCanvas;
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    const cssH = 22;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function stopWaveformAnimation() {
    if (waveformRaf != null) {
      cancelAnimationFrame(waveformRaf);
      waveformRaf = null;
    }
    const ctx = els.waveformCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, els.waveformCanvas.width, els.waveformCanvas.height);
  }

  /**
   * @param {number} t
   */
  function drawWaveformFrame(t) {
    const canvas = els.waveformCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width < 2 || waveformPhases.length === 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const n = waveformPhases.length;
    const slot = canvas.width / n;
    const barW = slot * 0.52;
    const mid = canvas.height / 2;
    ctx.fillStyle = 'rgba(232, 72, 142, 0.82)';
    for (let i = 0; i < n; i++) {
      const blend =
        0.28 * Math.sin(t * 0.003 + waveformPhases[i]) +
        0.18 * Math.sin(t * 0.005 + i * 0.5) +
        0.14 * Math.sin(t * 0.008 + i * 0.35);
      const h = Math.max(4 * (window.devicePixelRatio || 1), (0.34 + blend * 0.26) * canvas.height);
      const x = i * slot + (slot - barW) / 2;
      ctx.fillRect(x, mid - h / 2, barW, h);
    }
  }

  function startWaveformAnimation() {
    resizeWaveformCanvas();
    waveformPhases = Array.from({ length: 56 }, () => Math.random() * Math.PI * 2);
    /** @param {number} now */
    function loop(now) {
      if (!els.waveformCanvas.classList.contains('is-active')) return;
      drawWaveformFrame(now);
      waveformRaf = requestAnimationFrame(loop);
    }
    waveformRaf = requestAnimationFrame(loop);
  }

  function setPlaybackUi(playing) {
    els.btnPlay.title = playing ? '停止' : '再生';
    els.btnPlayIconPlay.classList.toggle('hidden', playing);
    els.btnPlayIconStop.classList.toggle('hidden', !playing);
    els.waveformCanvas.classList.toggle('is-active', playing);
  }

  function cleanupPlaybackNatural() {
    stopWaveformAnimation();
    setPlaybackUi(false);
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    currentAudio = null;
  }

  function stopPlayback() {
    stopWaveformAnimation();
    setPlaybackUi(false);
    if (currentAudio) {
      try {
        currentAudio.onended = null;
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch (_) {
        /* ignore */
      }
      currentAudio = null;
    }
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
  }

  function isAudioPlaying() {
    return !!(currentAudio && !currentAudio.paused && !currentAudio.ended);
  }

  async function togglePlayback() {
    if (isAudioPlaying()) {
      stopPlayback();
      return;
    }
    await playAudio();
  }

  async function playAudio() {
    els.btnPlay.disabled = true;
    try {
      stopPlayback();

      const buf = await buildFullUtterance();
      const blob = new Blob([buf], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      currentBlobUrl = url;
      const au = new Audio(url);
      currentAudio = au;
      au.onended = () => {
        if (currentAudio !== au) return;
        cleanupPlaybackNatural();
      };
      await au.play();
      resizeWaveformCanvas();
      setPlaybackUi(true);
      startWaveformAnimation();
    } catch (e) {
      stopPlayback();
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      els.btnPlay.disabled = false;
    }
  }

  async function exportAudio() {
    els.btnExport.disabled = true;
    try {
      const buf = await buildFullUtterance();
      const safe = deriveTitle(els.editor.value).replace(/[/\\?%*:|"<>]/g, '_');
      const name = `${safe || 'export'}.wav`;
      const filePath = await bridge.saveWavDialog(name);
      if (!filePath) return;
      await bridge.writeWavFile(filePath, buf);
      showToast(`書き出しました: ${filePath}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      els.btnExport.disabled = false;
    }
  }

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

  async function loadDictionaryFromDisk() {
    try {
      const blob = await bridge.loadDictionary();
      dictionaryEntries = normalizeDictionaryEntries(blob?.dictionaryWords);
    } catch (_) {
      dictionaryEntries = [];
    }
  }

  async function persistDictionaryToDisk() {
    await bridge.saveDictionary({
      dictionaryWords: dictionaryEntries.map((e) => ({
        word: e.word.trim(),
        yomi: e.yomi.trim(),
        accent: e.accent,
      })),
    });
  }

  function updateRowMoraCell(tr) {
    const yomi = /** @type {HTMLInputElement | null} */ (tr.querySelector('.dict-input-yomi'))?.value ?? '';
    const cell = tr.querySelector('.dict-mora-val');
    if (cell) cell.textContent = String(countMorasFromYomi(yomi));
  }

  function renderDictionaryRows() {
    els.dictionaryRows.innerHTML = '';
    const rows =
      dictionaryEntries.length > 0 ? dictionaryEntries : [{ word: '', yomi: '', accent: 1 }];
    for (const e of rows) appendDictionaryRow(e);
  }

  /**
   * @param {{ word: string, yomi: string, accent: number }} entry
   */
  function appendDictionaryRow(entry) {
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
    const payload = {
      dictionaryWords: rows.map((e) => ({
        word: e.word,
        yomi: e.yomi,
        accent: e.accent,
        numMoras: countMorasFromYomi(e.yomi),
      })),
    };
    const res = await fetchWithTimeout(
      `${DEFAULT_API_BASE}/v1/set_dictionary`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      20000,
    );
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `辞書の保存に失敗しました (${res.status})`);
    }
    dictionaryEntries = rows;
    await persistDictionaryToDisk();
  }

  function openDictionaryModal() {
    renderDictionaryRows();
    els.dictionaryModal.classList.remove('hidden');
  }

  function closeDictionaryModal() {
    els.dictionaryModal.classList.add('hidden');
  }

  function bindEvents() {
    els.btnNewProject.addEventListener('click', () => newProject());
    els.btnUndo.addEventListener('click', () => {
      els.editor.focus();
      void bridge.nativeUndo();
    });
    els.btnRedo.addEventListener('click', () => {
      els.editor.focus();
      void bridge.nativeRedo();
    });
    els.btnPlay.addEventListener('click', () => void togglePlayback());
    els.btnExport.addEventListener('click', () => void exportAudio());

    els.editor.addEventListener('input', () => {
      syncActiveProjectFromUi();
      bumpActiveUpdatedAt();
      schedulePersist();
    });

    els.editor.addEventListener('scroll', () => syncEditorOverlayScroll());

    const paramIds = [
      'speedScale',
      'pitchScale',
      'intonationScale',
      'volumeScale',
      'prePhonemeLength',
      'postPhonemeLength',
    ];
    for (const id of paramIds) {
      els[id].addEventListener('input', () => {
        refreshValueLabels();
        syncActiveProjectFromUi();
        bumpActiveUpdatedAt();
        schedulePersist();
      });
    }

    els.outputSamplingRate.addEventListener('change', () => {
      syncActiveProjectFromUi();
      bumpActiveUpdatedAt();
      schedulePersist();
    });

    els.processingAlgorithm.addEventListener('change', () => {
      syncActiveProjectFromUi();
      bumpActiveUpdatedAt();
      schedulePersist();
    });

    const floatParamIds = [
      'floatSpeedScale',
      'floatPitchScale',
      'floatIntonationScale',
      'floatVolumeScale',
      'floatPrePhonemeLength',
      'floatPostPhonemeLength',
    ];
    for (const id of floatParamIds) {
      els[id].addEventListener('input', () => {
        refreshValueLabelsFor(floatParamControls);
        saveFloatParamsToProject();
      });
    }
    els.floatOutputSamplingRate.addEventListener('change', () => saveFloatParamsToProject());
    els.floatProcessingAlgorithm.addEventListener('change', () => saveFloatParamsToProject());

    els.btnSentenceParamClose.addEventListener('click', () => closeSentenceParamFloat());
    els.btnSentenceParamReset.addEventListener('click', () => resetFloatSentenceParams());

    els.sentenceParamFloat.addEventListener('click', (ev) => ev.stopPropagation());

    document.addEventListener('click', (ev) => {
      if (floatSentenceKey == null) return;
      const t = /** @type {Element} */ (ev.target);
      if (els.sentenceParamFloat.contains(t)) return;
      if (t.closest('.segment-inline-bar')) return;
      closeSentenceParamFloat();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && floatSentenceKey != null) {
        closeSentenceParamFloat();
      }
    });

    window.addEventListener('resize', () => {
      resizeWaveformCanvas();
      renderSegmentOverlay();
      if (floatSentenceKey != null) {
        const activeBtn = els.segmentBars.querySelector('.segment-inline-bar.active');
        if (activeBtn) positionSentenceParamFloat(activeBtn.getBoundingClientRect());
      }
    });

    els.btnDictionary.addEventListener('click', () => openDictionaryModal());
    els.btnDictDismiss.addEventListener('click', () => closeDictionaryModal());
    els.btnDictClose.addEventListener('click', () => closeDictionaryModal());
    els.btnDictAddRow.addEventListener('click', () => appendDictionaryRow({ word: '', yomi: '', accent: 1 }));
    els.btnDictApply.addEventListener('click', () =>
      void (async () => {
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
      })(),
    );
    els.dictionaryModal.addEventListener('click', (ev) => {
      if (ev.target === els.dictionaryModal) closeDictionaryModal();
    });
  }

  async function boot() {
    bindEvents();
    refreshValueLabels();
    resizeWaveformCanvas();

    await loadDictionaryFromDisk();

    const blob = await bridge.loadProjects();
    if (blob && Array.isArray(blob.projects) && blob.projects.length > 0) {
      projects = blob.projects;
      migrateProjects(projects);
      activeId = blob.activeId && projects.some((p) => p.id === blob.activeId) ? blob.activeId : projects[0].id;
    } else {
      const now = new Date().toISOString();
      projects = [
        {
          id: crypto.randomUUID(),
          title: '無題',
          text: '',
          params: { ...PARAM_DEFAULTS },
          sentenceParamsByKey: {},
          updatedAt: now,
        },
      ];
      activeId = projects[0].id;
    }

    await refreshCoeiroinkStatus({ silentToast: false });
    setInterval(() => void refreshCoeiroinkStatus({ silentToast: true }), 45000);

    selectProject(activeId);
  }

  void boot();
})();
