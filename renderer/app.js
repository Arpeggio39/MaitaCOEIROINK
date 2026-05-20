(() => {
  const MAITA_UUID = '24e48b20-c14c-11f0-a12e-0242ac1c000c';

  const PARAM_DEFAULTS = {
    speedScale: 1,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
    processingAlgorithm: 'td-psola',
  };

  const PLAYBACK_SAMPLE_RATE = 44100;
  const EXPORT_SAMPLE_RATE_DEFAULT = 44100;

  const GAP_SILENCE_SEC = 0.28;
  const DEFAULT_API_BASE = 'http://127.0.0.1:50032';
  const MORA_PITCH_DEFAULT = 6;
  const MORA_PITCH_MIN = 3;
  const MORA_PITCH_MAX = 9;

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
    projectTitleInput: document.getElementById('projectTitleInput'),
    editor: document.getElementById('editor'),
    btnUndo: document.getElementById('btnUndo'),
    btnRedo: document.getElementById('btnRedo'),
    btnPlay: document.getElementById('btnPlay'),
    btnExport: document.getElementById('btnExport'),
    processingAlgorithm: document.getElementById('processingAlgorithm'),
    toast: document.getElementById('toast'),
    exportSamplingRate: document.getElementById('exportSamplingRate'),
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
    workspace: document.getElementById('workspace'),
    paramPane: document.getElementById('paramPane'),
    btnSegmentParamReset: document.getElementById('btnSegmentParamReset'),
    btnRegenerateProsody: document.getElementById('btnRegenerateProsody'),
    intonationDock: document.getElementById('intonationDock'),
    intonationMoras: document.getElementById('intonationMoras'),
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
  /** @typedef {{ phoneme: string, hira: string, accent: number, pitch?: number }} SegmentMora */
  /** @typedef {{ text: string, detail: SegmentMora[][], loading?: boolean }} SegmentProsody */
  /** @typedef {{ id: string, title: string, text: string, titleEdited?: boolean, params: ParamSet, sentenceParamsByKey?: Record<string, ParamSet>, sentenceProsodyByKey?: Record<string, SegmentProsody>, updatedAt: string }} Project */

  /** @type {Project[]} */
  let projects = [];
  /** @type {string | null} */
  let activeId = null;
  /** @type {string | null} */
  let activeSentenceKey = null;
  /** @type {SentenceRange[]} */
  let lastSentenceRanges = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let saveTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let prosodyScheduleTimer = null;
  /** @type {Map<string, number>} */
  const prosodyFetchGeneration = new Map();

  /** @type {{ word: string, yomi: string, accent: number }[]} */
  let dictionaryEntries = [];

  /** @type {number} */
  let exportSamplingRate = EXPORT_SAMPLE_RATE_DEFAULT;

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
    return snapshotParamsFromControls(segmentParamControls);
  }

  /** 句読点（区切りに含める） */
  const SEGMENT_PUNCT_RE =
    /[。、．.,!?！？…：:；;「」『』【】()（）\[\]{}'"‘’“”〜～]/u;

  /** @param {string} ch */
  function isSegmentPunctuation(ch) {
    return SEGMENT_PUNCT_RE.test(ch);
  }

  /** @param {string} ch */
  function isSegmentWhitespace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\u3000';
  }

  /** @param {string} ch */
  function isSegmentNewline(ch) {
    return ch === '\n' || ch === '\r';
  }

  /** @param {string} ch */
  function isSegmentBreakChar(ch) {
    return isSegmentPunctuation(ch) || isSegmentWhitespace(ch) || isSegmentNewline(ch);
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
      'processingAlgorithm',
    ];
    for (const k of keys) {
      if (String(a[k]) !== String(b[k])) return false;
    }
    return true;
  }

  /** @param {ParamSet} params */
  function cloneParams(params) {
    const merged = { ...PARAM_DEFAULTS, ...params };
    delete merged.outputSamplingRate;
    return merged;
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

  const segmentParamControls = {
    speedScale: els.speedScale,
    pitchScale: els.pitchScale,
    intonationScale: els.intonationScale,
    volumeScale: els.volumeScale,
    prePhonemeLength: els.prePhonemeLength,
    postPhonemeLength: els.postPhonemeLength,
    processingAlgorithm: els.processingAlgorithm,
    speedScaleVal: els.speedScaleVal,
    pitchScaleVal: els.pitchScaleVal,
    intonationScaleVal: els.intonationScaleVal,
    volumeScaleVal: els.volumeScaleVal,
    prePhonemeLengthVal: els.prePhonemeLengthVal,
    postPhonemeLengthVal: els.postPhonemeLengthVal,
  };

  function deriveDefaultTitle(text) {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (!flat) return '無題';
    return flat.length > 10 ? flat.slice(0, 10) : flat;
  }

  /**
   * @param {Project} project
   */
  function syncTitleFromTextIfAuto(project) {
    if (project.titleEdited) return;
    project.title = deriveDefaultTitle(project.text || '');
  }

  function renderProjectTitleDisplay() {
    const p = activeProject();
    els.projectTitle.textContent = p?.title || '無題';
  }

  function startProjectTitleEdit() {
    const p = activeProject();
    if (!p) return;
    els.projectTitleInput.value = p.title || '無題';
    els.projectTitle.hidden = true;
    els.projectTitleInput.hidden = false;
    els.projectTitleInput.focus();
    els.projectTitleInput.select();
  }

  function commitProjectTitleEdit() {
    if (els.projectTitleInput.hidden) return;
    const p = activeProject();
    if (!p) return;
    const next = els.projectTitleInput.value.trim() || '無題';
    p.title = next;
    p.titleEdited = true;
    els.projectTitleInput.hidden = true;
    els.projectTitle.hidden = false;
    renderProjectTitleDisplay();
    renderProjectList();
    bumpActiveUpdatedAt();
    schedulePersist();
  }

  function cancelProjectTitleEdit() {
    els.projectTitleInput.hidden = true;
    els.projectTitle.hidden = false;
    renderProjectTitleDisplay();
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
      if (p.params) delete p.params.outputSamplingRate;
      if (p.sentenceParamsByKey) {
        for (const k of Object.keys(p.sentenceParamsByKey)) {
          delete p.sentenceParamsByKey[k].outputSamplingRate;
        }
      }
      if (!Array.isArray(p.sentenceParams) && !p.sentenceParamsByKey) p.sentenceParamsByKey = {};
      if (!p.sentenceProsodyByKey) p.sentenceProsodyByKey = {};
      if (p.titleEdited == null) p.titleEdited = false;
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

    /** @param {number} breakEnd */
    function flushSegment(breakEnd) {
      const trimmed = buf.trim();
      if (!trimmed) {
        buf = '';
        segStart = breakEnd;
        return;
      }
      const lead = buf.length - buf.trimStart().length;
      const start = segStart + lead;
      const end = start + trimmed.length;
      ranges.push({
        key: `s${start}`,
        start,
        end,
        text: text.slice(start, end),
        index: index++,
      });
      buf = '';
      segStart = breakEnd;
    }

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (isSegmentPunctuation(ch)) {
        buf += ch;
        flushSegment(i + 1);
        continue;
      }
      if (isSegmentWhitespace(ch) || isSegmentNewline(ch)) {
        flushSegment(i + 1);
        while (i + 1 < text.length && (isSegmentWhitespace(text[i + 1]) || isSegmentNewline(text[i + 1]))) {
          i += 1;
        }
        segStart = i + 1;
        continue;
      }
      buf += ch;
    }

    flushSegment(text.length);
    return ranges;
  }

  /**
   * @param {number} pos
   * @param {SentenceRange[]} ranges
   */
  function findRangeAtCursor(pos, ranges) {
    for (const r of ranges) {
      if (pos >= r.start && pos < r.end) return r;
    }
    return null;
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
    if (!project) return cloneParams(PARAM_DEFAULTS);
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
   * @param {SegmentMora[][]} detail
   */
  function cloneProsodyDetail(detail) {
    return detail.map((phrase) =>
      phrase.map((m) => ({
        phoneme: m.phoneme,
        hira: m.hira,
        accent: m.accent,
        pitch: Number.isFinite(m.pitch) ? m.pitch : MORA_PITCH_DEFAULT,
      })),
    );
  }

  /**
   * @param {SegmentMora[][]} detail
   */
  function applyDefaultMoraPitches(detail) {
    for (const phrase of detail) {
      for (const m of phrase) {
        if (!Number.isFinite(m.pitch)) m.pitch = MORA_PITCH_DEFAULT;
      }
    }
  }

  /**
   * @param {number} hz
   */
  function hzToMoraPitch(hz) {
    if (!Number.isFinite(hz) || hz < 50) return MORA_PITCH_DEFAULT;
    const pitch = MORA_PITCH_DEFAULT + Math.log2(hz / 200);
    return Math.max(MORA_PITCH_MIN, Math.min(MORA_PITCH_MAX, pitch));
  }

  /**
   * @param {number[]} f0
   * @param {number} wavStart
   * @param {number} wavEnd
   * @param {number} totalSamples
   */
  function medianF0InRange(f0, wavStart, wavEnd, totalSamples) {
    if (!f0.length || totalSamples <= 0) return 0;
    const i0 = Math.floor((wavStart / totalSamples) * f0.length);
    const i1 = Math.min(f0.length - 1, Math.ceil((wavEnd / totalSamples) * f0.length));
    const slice = f0.slice(i0, i1 + 1).filter((v) => v > 50);
    if (!slice.length) return 0;
    slice.sort((a, b) => a - b);
    return slice[Math.floor(slice.length / 2)];
  }

  /**
   * @param {SegmentMora[][]} detail
   * @param {{ hira?: string, phonemePitches?: { wavRange: { start: number, end: number } }[] }[]} moraDurations
   * @param {number[]} f0
   */
  function applyF0ToProsodyDetail(detail, moraDurations, f0) {
    const flat = detail.flat();
    let totalSamples = 1;
    for (const md of moraDurations) {
      const pp = md.phonemePitches;
      if (!pp?.length) continue;
      totalSamples = Math.max(totalSamples, pp[pp.length - 1].wavRange.end);
    }
    let moraIdx = 0;
    for (const md of moraDurations) {
      const hira = (md.hira || '').trim();
      if (!hira || moraIdx >= flat.length) continue;
      const pp = md.phonemePitches;
      if (!pp?.length) continue;
      const start = pp[0].wavRange.start;
      const end = pp[pp.length - 1].wavRange.end;
      flat[moraIdx].pitch = hzToMoraPitch(medianF0InRange(f0, start, end, totalSamples));
      moraIdx += 1;
    }
  }

  /**
   * @param {string} text
   */
  async function fetchEstimateProsody(text) {
    const res = await fetchWithTimeout(
      `${DEFAULT_API_BASE}/v1/estimate_prosody`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      },
      30000,
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(errText || `韻律推定に失敗 (${res.status})`);
    }
    /** @type {{ detail?: SegmentMora[][] }} */
    const data = await res.json();
    if (!Array.isArray(data.detail) || data.detail.length === 0) {
      throw new Error('韻律データが空です');
    }
    return cloneProsodyDetail(data.detail);
  }

  /**
   * @param {string} text
   * @param {SegmentMora[][]} detail
   */
  async function fetchPredictF0ForProsody(text, detail) {
    if (!maitaStyleId) throw new Error('話者スタイルが未設定です');
    const res = await fetchWithTimeout(
      `${DEFAULT_API_BASE}/v1/predict_with_duration`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakerUuid: MAITA_UUID,
          styleId: maitaStyleId,
          text,
          prosodyDetail: detail,
          speedScale: 1,
        }),
      },
      120000,
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(errText || `ピッチ推定に失敗 (${res.status})`);
    }
    /** @type {{ wavBase64?: string, moraDurations?: unknown[] }} */
    const pred = await res.json();
    if (!pred.wavBase64 || !Array.isArray(pred.moraDurations)) {
      throw new Error('ピッチ推定の応答が不正です');
    }
    const f0Res = await fetchWithTimeout(
      `${DEFAULT_API_BASE}/v1/estimate_f0`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wavBase64: pred.wavBase64,
          moraDurations: pred.moraDurations,
        }),
      },
      60000,
    );
    if (!f0Res.ok) {
      const errText = await f0Res.text().catch(() => f0Res.statusText);
      throw new Error(errText || `F0 推定に失敗 (${f0Res.status})`);
    }
    /** @type {{ f0?: number[], moraDurations?: { hira?: string, phonemePitches?: { wavRange: { start: number, end: number } }[] }[] }} */
    const f0data = await f0Res.json();
    if (!Array.isArray(f0data.f0)) throw new Error('F0 データが空です');
    applyF0ToProsodyDetail(
      detail,
      /** @type {typeof f0data.moraDurations} */ (f0data.moraDurations || pred.moraDurations),
      f0data.f0,
    );
  }

  /**
   * @param {Project} project
   * @param {SentenceRange[]} prevRanges
   * @param {SentenceRange[]} newRanges
   */
  function remapSentenceProsody(project, prevRanges, newRanges) {
    const oldMap = project.sentenceProsodyByKey || {};
    /** @type {Record<string, SegmentProsody>} */
    const next = {};
    const usedOldKeys = new Set();

    for (const nr of newRanges) {
      if (oldMap[nr.key] && oldMap[nr.key].text === nr.text) {
        next[nr.key] = { text: nr.text, detail: cloneProsodyDetail(oldMap[nr.key].detail) };
        continue;
      }
      const prev = prevRanges.find((pr) => pr.text === nr.text && !usedOldKeys.has(pr.key));
      if (prev && oldMap[prev.key] && oldMap[prev.key].text === nr.text) {
        next[nr.key] = { text: nr.text, detail: cloneProsodyDetail(oldMap[prev.key].detail) };
        usedOldKeys.add(prev.key);
      }
    }
    project.sentenceProsodyByKey = next;
  }

  /**
   * @param {Project | null} project
   * @param {string} key
   */
  function getSegmentProsody(project, key) {
    return project?.sentenceProsodyByKey?.[key] ?? null;
  }

  function renderIntonationUI() {
    const p = activeProject();
    const key = activeSentenceKey;
    els.intonationMoras.innerHTML = '';
    els.intonationMoras.classList.remove('is-loading');

    if (!p || key == null) return;

    const entry = getSegmentProsody(p, key);
    if (!entry) {
      els.intonationMoras.classList.add('is-loading');
      return;
    }

    if (entry.loading) {
      els.intonationMoras.classList.add('is-loading');
    } else {
      els.intonationMoras.classList.remove('is-loading');
    }

    let moraIndex = 0;
    for (const phrase of entry.detail) {
      for (const m of phrase) {
        const wrap = document.createElement('div');
        wrap.className = 'intonation-mora';
        wrap.dataset.moraIndex = String(moraIndex);

        const pitchVal = document.createElement('span');
        pitchVal.className = 'intonation-mora-pitch';
        pitchVal.textContent = Number(m.pitch ?? MORA_PITCH_DEFAULT).toFixed(2);

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'intonation-mora-slider-wrap';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'intonation-mora-slider';
        slider.min = String(MORA_PITCH_MIN);
        slider.max = String(MORA_PITCH_MAX);
        slider.step = '0.05';
        slider.value = String(m.pitch ?? MORA_PITCH_DEFAULT);
        slider.disabled = !!entry.loading;
        slider.setAttribute('aria-label', `${m.hira} のピッチ`);

        const hira = document.createElement('span');
        hira.className = 'intonation-mora-hira';
        hira.textContent = m.hira;

        const accent = document.createElement('span');
        accent.className = 'intonation-mora-accent';
        accent.textContent = `A${m.accent}`;

        slider.addEventListener('input', () => {
          const v = Number(slider.value);
          m.pitch = v;
          pitchVal.textContent = v.toFixed(2);
          bumpActiveUpdatedAt();
          schedulePersist();
        });

        sliderWrap.appendChild(slider);
        wrap.append(pitchVal, sliderWrap, hira, accent);
        els.intonationMoras.appendChild(wrap);
        moraIndex += 1;
      }
    }

  }

  /**
   * @param {Project} project
   * @param {string} key
   * @param {string} text
   * @param {{ force?: boolean }} [opts]
   */
  async function ensureSegmentProsody(project, key, text, opts = {}) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!project.sentenceProsodyByKey) project.sentenceProsodyByKey = {};
    const existing = project.sentenceProsodyByKey[key];
    if (opts.force && existing) delete project.sentenceProsodyByKey[key];
    const cached = project.sentenceProsodyByKey[key];
    if (!opts.force && cached && cached.text === trimmed && !cached.loading) return;

    const gen = (prosodyFetchGeneration.get(key) || 0) + 1;
    prosodyFetchGeneration.set(key, gen);

    project.sentenceProsodyByKey[key] = {
      text: trimmed,
      detail: !opts.force && cached?.text === trimmed ? cloneProsodyDetail(cached.detail) : [],
      loading: true,
    };
    if (activeSentenceKey === key) renderIntonationUI();

    try {
      const detail = await fetchEstimateProsody(trimmed);
      applyDefaultMoraPitches(detail);

      if (prosodyFetchGeneration.get(key) !== gen) return;
      project.sentenceProsodyByKey[key] = { text: trimmed, detail, loading: true };
      if (activeSentenceKey === key) renderIntonationUI();

      if (maitaStyleId) {
        try {
          await fetchPredictF0ForProsody(trimmed, detail);
        } catch (e) {
          if (activeSentenceKey === key) {
            showToast(e instanceof Error ? e.message : String(e));
          }
        }
      }

      if (prosodyFetchGeneration.get(key) !== gen) return;
      project.sentenceProsodyByKey[key] = { text: trimmed, detail };
      schedulePersist();
    } catch (e) {
      if (prosodyFetchGeneration.get(key) !== gen) return;
      delete project.sentenceProsodyByKey[key];
      if (activeSentenceKey === key) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (prosodyFetchGeneration.get(key) === gen && activeSentenceKey === key) {
        renderIntonationUI();
      }
    }
  }

  /**
   * @param {Project} project
   * @param {SentenceRange[]} ranges
   */
  function scheduleProsodyForRanges(project, ranges) {
    clearTimeout(prosodyScheduleTimer);
    prosodyScheduleTimer = setTimeout(() => {
      for (const r of ranges) {
        const entry = project.sentenceProsodyByKey?.[r.key];
        if (!entry || entry.text !== r.text || entry.loading) {
          void ensureSegmentProsody(project, r.key, r.text);
        }
      }
    }, 420);
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

  function syncEditorOverlayScroll() {
    const st = els.editor.scrollTop;
    els.segmentMirror.style.transform = `translate3d(0, ${-st}px, 0)`;
  }

  function updateSegmentPanelsVisibility() {
    const hasSelection = activeSentenceKey != null;
    els.paramPane.classList.toggle('is-inactive', !hasSelection);
    els.intonationDock.classList.toggle('is-inactive', !hasSelection);
  }

  function getExportSamplingRate() {
    return coerceSampleRate(Number(els.exportSamplingRate.value) || exportSamplingRate);
  }

  function applyExportSamplingRateToControl() {
    els.exportSamplingRate.value = String(coerceSampleRate(exportSamplingRate));
  }

  async function persistAppSettings() {
    exportSamplingRate = getExportSamplingRate();
    await bridge.saveAppSettings({ exportSamplingRate });
  }

  async function loadAppSettingsFromDisk() {
    try {
      const blob = await bridge.loadAppSettings();
      if (blob && blob.exportSamplingRate != null) {
        exportSamplingRate = coerceSampleRate(blob.exportSamplingRate);
      }
    } catch (_) {
      exportSamplingRate = EXPORT_SAMPLE_RATE_DEFAULT;
    }
    applyExportSamplingRateToControl();
  }

  function saveActiveSegmentParams() {
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

  function clearSentenceSelection() {
    if (activeSentenceKey != null) saveActiveSegmentParams();
    activeSentenceKey = null;
    updateSegmentPanelsVisibility();
    renderIntonationUI();
    renderSegmentOverlay();
  }

  /**
   * @param {string} key
   * @param {string} previewText
   */
  function selectSentence(key, previewText) {
    if (activeSentenceKey != null && activeSentenceKey !== key) {
      saveActiveSegmentParams();
    }
    const p = activeProject();
    if (!p) return;

    activeSentenceKey = key;
    const params = getSentenceParams(p, key);
    applyParamsToControls(segmentParamControls, params);
    refreshValueLabelsFor(segmentParamControls);
    updateSegmentPanelsVisibility();
    renderIntonationUI();
    const range = sentenceRangesFromText(els.editor.value).find((r) => r.key === key);
    if (range) void ensureSegmentProsody(p, key, range.text);
    renderSegmentOverlay();
  }

  function resetActiveSegmentParams() {
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

  function syncSelectionFromEditorCursor() {
    const text = els.editor.value;
    const ranges = sentenceRangesFromText(text);
    const pos = els.editor.selectionStart;
    const r = findRangeAtCursor(pos, ranges);
    if (r) {
      if (r.key !== activeSentenceKey) selectSentence(r.key, r.text);
      return;
    }
    if (activeSentenceKey != null) clearSentenceSelection();
  }

  function renderSegmentOverlay() {
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
    lastSentenceRanges = ranges;

    if (activeSentenceKey != null && !ranges.some((r) => r.key === activeSentenceKey)) {
      activeSentenceKey = null;
      updateSegmentPanelsVisibility();
    }

    els.segmentMirror.innerHTML = buildMirrorHtml(text, ranges);
    syncEditorOverlayScroll();
  }

  function activeProject() {
    return projects.find((p) => p.id === activeId) || null;
  }

  function syncActiveProjectFromUi() {
    const p = activeProject();
    if (!p) return;
    if (activeSentenceKey != null) saveActiveSegmentParams();
    p.text = els.editor.value;
    syncTitleFromTextIfAuto(p);
    renderProjectTitleDisplay();
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
      if (activeSentenceKey != null) saveActiveSegmentParams();
      syncActiveProjectFromUi();
    }
    activeId = id;
    activeSentenceKey = null;
    lastSentenceRanges = [];
    const p = activeProject();
    if (!p) return;
    migrateSentenceParamsForProject(p);
    els.editor.value = p.text || '';
    updateSegmentPanelsVisibility();
    renderProjectTitleDisplay();
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
      sentenceProsodyByKey: {},
      updatedAt: now,
    };
    projects.unshift(p);
    activeId = p.id;
    selectProject(p.id);
    els.editor.focus();
  }

  function refreshValueLabels() {
    refreshValueLabelsFor(segmentParamControls);
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
   * @param {SegmentProsody | null} [prosodyOverride]
   */
  async function synthesizeLine(textLine, paramsOverride, prosodyOverride = null, outputSamplingRate = PLAYBACK_SAMPLE_RATE) {
    if (!maitaStyleId) {
      throw new Error('COEIROINK から琵音マイタのスタイルを取得できません。左下の接続状態を確認してエンジンを起動してから再度お試しください。');
    }
    const url = `${DEFAULT_API_BASE}/v1/synthesis`;
    const params = paramsOverride ?? snapshotParams();
    const detail = prosodyOverride?.detail?.length
      ? cloneProsodyDetail(prosodyOverride.detail)
      : [];
    const body = {
      speakerUuid: MAITA_UUID,
      styleId: maitaStyleId,
      text: textLine,
      prosodyDetail: detail,
      speedScale: params.speedScale,
      volumeScale: params.volumeScale,
      pitchScale: params.pitchScale,
      intonationScale: params.intonationScale,
      prePhonemeLength: params.prePhonemeLength,
      postPhonemeLength: params.postPhonemeLength,
      outputSamplingRate: coerceSampleRate(outputSamplingRate),
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

  async function buildFullUtterance(outputSamplingRate = PLAYBACK_SAMPLE_RATE) {
    saveActiveSegmentParams();
    const p = activeProject();
    const ranges = sentenceRangesFromText(els.editor.value);
    if (ranges.length === 0) {
      throw new Error('読み上げるテキストがありません（句読点・スペース・改行で区切られた部分が必要です）。');
    }
    /** @type {ArrayBuffer[]} */
    const parts = [];
    for (const r of ranges) {
      const params = getSentenceParams(p, r.key);
      let prosody = getSegmentProsody(p, r.key);
      if (!prosody || prosody.text !== r.text.trim()) {
        await ensureSegmentProsody(p, r.key, r.text);
        prosody = getSegmentProsody(p, r.key);
      }
      const wav = await synthesizeLine(r.text, params, prosody, outputSamplingRate);
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

      const buf = await buildFullUtterance(PLAYBACK_SAMPLE_RATE);
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
      await persistAppSettings();
      const buf = await buildFullUtterance(getExportSamplingRate());
      const p = activeProject();
      const safe = (p?.title || 'export').replace(/[/\\?%*:|"<>]/g, '_');
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
    els.projectTitle.addEventListener('click', () => startProjectTitleEdit());
    els.projectTitleInput.addEventListener('blur', () => commitProjectTitleEdit());
    els.projectTitleInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commitProjectTitleEdit();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        cancelProjectTitleEdit();
      }
    });

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

    els.editor.addEventListener('click', () => syncSelectionFromEditorCursor());
    els.editor.addEventListener('keyup', () => syncSelectionFromEditorCursor());

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
        if (activeSentenceKey == null) return;
        refreshValueLabels();
        saveActiveSegmentParams();
        renderSegmentOverlay();
      });
    }

    els.exportSamplingRate.addEventListener('change', () => void persistAppSettings());

    els.processingAlgorithm.addEventListener('change', () => {
      if (activeSentenceKey == null) return;
      saveActiveSegmentParams();
      renderSegmentOverlay();
    });

    els.btnSegmentParamReset.addEventListener('click', () => resetActiveSegmentParams());

    els.btnRegenerateProsody.addEventListener('click', () => {
      if (activeSentenceKey == null) return;
      const p = activeProject();
      if (!p) return;
      const range = sentenceRangesFromText(els.editor.value).find((r) => r.key === activeSentenceKey);
      if (!range) return;
      els.btnRegenerateProsody.disabled = true;
      void ensureSegmentProsody(p, activeSentenceKey, range.text, { force: true }).finally(() => {
        els.btnRegenerateProsody.disabled = activeSentenceKey == null;
      });
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && activeSentenceKey != null) {
        clearSentenceSelection();
      }
    });

    window.addEventListener('resize', () => {
      resizeWaveformCanvas();
      renderSegmentOverlay();
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
    updateSegmentPanelsVisibility();
    refreshValueLabels();
    resizeWaveformCanvas();

    await loadDictionaryFromDisk();
    await loadAppSettingsFromDisk();

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
          sentenceProsodyByKey: {},
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
