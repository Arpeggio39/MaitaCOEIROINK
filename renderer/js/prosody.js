import {
  DEFAULT_API_BASE,
  MAITA_UUID,
  MORA_PITCH_DEFAULT,
  MORA_PITCH_MAX,
  MORA_PITCH_MIN,
} from './constants.js';
import {
  activeSentenceKey,
  prosodyFetchGeneration,
  prosodyFetchInFlight,
  prosodyScheduleTimer,
  setProsodyScheduleTimer,
} from './state.js';
import * as appState from './state.js';
import { fetchWithTimeout, showToast } from './utils.js';
import { resolveMaitaStyleId } from './engine.js';
import { schedulePersist } from './persist.js';

/**
 * @param {import('./state.js').SegmentMora[][]} detail
 */
export function cloneProsodyDetail(detail) {
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
 * @param {import('./state.js').SegmentMora[][]} detail
 */
export function applyDefaultMoraPitches(detail) {
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
 * @param {import('./state.js').SegmentMora[][]} detail
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
  /** @type {{ detail?: import('./state.js').SegmentMora[][] }} */
  const data = await res.json();
  if (!Array.isArray(data.detail) || data.detail.length === 0) {
    throw new Error('韻律データが空です');
  }
  return cloneProsodyDetail(data.detail);
}

/**
 * @param {string} kana
 */
async function fetchEstimateProsodyFromKana(kana) {
  const res = await fetchWithTimeout(
    `${DEFAULT_API_BASE}/v1/estimate_prosody_from_kana`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: kana }),
    },
    30000,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `かなからの韻律推定に失敗 (${res.status})`);
  }
  /** @type {{ detail?: import('./state.js').SegmentMora[][] }} */
  const data = await res.json();
  if (!Array.isArray(data.detail) || data.detail.length === 0) {
    throw new Error('韻律データが空です');
  }
  return cloneProsodyDetail(data.detail);
}

/**
 * @param {import('./state.js').Project} project
 * @param {string} key
 */
export async function reestimateProsodyFromKana(project, key) {
  const entry = project.sentenceProsodyByKey?.[key];
  if (!entry?.detail?.length || prosodyFetchInFlight.has(key)) return;

  const kana = entry.detail.flat().map((m) => m.hira || '').join('').trim();
  if (!kana) return;

  kanaReestimateInFlight.add(key);
  if (activeSentenceKey === key) notifyIntonationUi();

  const oldPitches = entry.detail.flat().map((m) => getMoraPitch(m));

  try {
    const newDetail = await fetchEstimateProsodyFromKana(kana);
    applyDefaultMoraPitches(newDetail);
    const flatNew = newDetail.flat();
    for (let i = 0; i < flatNew.length; i += 1) {
      if (i < oldPitches.length) flatNew[i].pitch = oldPitches[i];
    }
    entry.detail = newDetail;
    schedulePersist();
  } catch (e) {
    if (activeSentenceKey === key) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  } finally {
    kanaReestimateInFlight.delete(key);
    if (activeSentenceKey === key) notifyIntonationUi();
  }
}

/** @type {ReturnType<typeof setTimeout> | null} */
let kanaReestimateTimer = null;
/** @type {{ project: import('./state.js').Project, key: string } | null} */
let kanaReestimatePending = null;
/** @type {Set<string>} */
export const kanaReestimateInFlight = new Set();

/**
 * @param {import('./state.js').Project} project
 * @param {string} key
 */
export function scheduleProsodyKanaReestimate(project, key) {
  kanaReestimatePending = { project, key };
  clearTimeout(kanaReestimateTimer);
  kanaReestimateTimer = setTimeout(() => {
    const pending = kanaReestimatePending;
    kanaReestimatePending = null;
    if (!pending) return;
    void reestimateProsodyFromKana(pending.project, pending.key);
  }, 420);
}

/**
 * @param {string} text
 * @param {import('./state.js').SegmentMora[][]} detail
 */
async function fetchPredictF0ForProsody(text, detail) {
  const styleId = await resolveMaitaStyleId();
  const res = await fetchWithTimeout(
    `${DEFAULT_API_BASE}/v1/predict_with_duration`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakerUuid: MAITA_UUID,
        styleId: styleId,
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
 * @param {import('./state.js').Project} project
 * @param {import('./state.js').SentenceRange[]} prevRanges
 * @param {import('./state.js').SentenceRange[]} newRanges
 */
export function remapSentenceProsody(project, prevRanges, newRanges) {
  const oldMap = project.sentenceProsodyByKey || {};
  /** @type {Record<string, import('./state.js').SegmentProsody>} */
  const next = {};
  const usedOldKeys = new Set();

  for (const nr of newRanges) {
    if (oldMap[nr.key] && oldMap[nr.key].text === nr.text) {
      const src = oldMap[nr.key];
      next[nr.key] = { text: nr.text, detail: cloneProsodyDetail(src.detail) };
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
 * @param {import('./state.js').Project | null} project
 * @param {string} key
 */
export function getSegmentProsody(project, key) {
  return project?.sentenceProsodyByKey?.[key] ?? null;
}

/**
 * @param {import('./state.js').SegmentMora} mora
 */
export function getMoraPitch(mora) {
  return mora.pitch ?? MORA_PITCH_DEFAULT;
}

/**
 * @param {import('./state.js').SegmentMora} mora
 * @param {number} pitch
 */
export function setMoraPitch(mora, pitch) {
  mora.pitch = Math.max(MORA_PITCH_MIN, Math.min(MORA_PITCH_MAX, pitch));
}

/**
 * @param {import('./state.js').SegmentMora[][]} phrases
 */
export function buildMoraSpansFromDetail(phrases) {
  /** @type {{ mora: import('./state.js').SegmentMora, charStart: number, charEnd: number }[]} */
  const spans = [];
  let charIdx = 0;
  for (const phrase of phrases) {
    for (const m of phrase) {
      const len = Math.max(1, [...(m.hira || '')].length);
      spans.push({ mora: m, charStart: charIdx, charEnd: charIdx + len });
      charIdx += len;
    }
  }
  return spans;
}

/**
 * @param {import('./state.js').SegmentMora[][]} phrases
 */
export function buildHiraganaCellsFromDetail(phrases) {
  /** @type {{ char: string, phraseIndex: number, mora: import('./state.js').SegmentMora }[]} */
  const cells = [];
  for (let pi = 0; pi < phrases.length; pi += 1) {
    for (const m of phrases[pi]) {
      for (const ch of [...(m.hira || '')]) {
        cells.push({ char: ch, phraseIndex: pi, mora: m });
      }
    }
  }
  return cells;
}

function notifyIntonationUi() {
  appState.refreshIntonationUi?.();
}

/**
 * @param {import('./state.js').Project} project
 * @param {string} key
 * @param {string} text
 * @param {{ force?: boolean }} [opts]
 */
export async function ensureSegmentProsody(project, key, text, opts = {}) {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (!project.sentenceProsodyByKey) project.sentenceProsodyByKey = {};
  const existing = project.sentenceProsodyByKey[key];
  if (opts.force && existing) delete project.sentenceProsodyByKey[key];
  const cached = project.sentenceProsodyByKey[key];
  if (!opts.force && cached && cached.text === trimmed && cached.detail?.length) return;
  if (!opts.force && prosodyFetchInFlight.has(key)) return;

  if (opts.force) {
    prosodyFetchGeneration.set(key, (prosodyFetchGeneration.get(key) || 0) + 1);
    prosodyFetchInFlight.delete(key);
  }

  const gen = (prosodyFetchGeneration.get(key) || 0) + 1;
  prosodyFetchGeneration.set(key, gen);

  project.sentenceProsodyByKey[key] = {
    text: trimmed,
    detail: !opts.force && cached?.text === trimmed ? cloneProsodyDetail(cached.detail) : [],
  };
  delete project.sentenceProsodyByKey[key].loading;
  prosodyFetchInFlight.add(key);
  notifyIntonationUi();

  try {
    const detail = await fetchEstimateProsody(trimmed);
    applyDefaultMoraPitches(detail);

    if (prosodyFetchGeneration.get(key) !== gen) return;
    project.sentenceProsodyByKey[key] = { text: trimmed, detail };
    notifyIntonationUi();

    try {
      await fetchPredictF0ForProsody(trimmed, detail);
    } catch (e) {
      if (prosodyFetchGeneration.get(key) === gen) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    }

    if (prosodyFetchGeneration.get(key) !== gen) return;
    schedulePersist();
    notifyIntonationUi();
  } catch (e) {
    if (prosodyFetchGeneration.get(key) !== gen) return;
    delete project.sentenceProsodyByKey[key];
    showToast(e instanceof Error ? e.message : String(e));
  } finally {
    if (prosodyFetchGeneration.get(key) === gen) {
      prosodyFetchInFlight.delete(key);
      notifyIntonationUi();
    }
  }
}

/**
 * @param {import('./state.js').Project} project
 * @param {import('./state.js').SentenceRange[]} ranges
 */
export function scheduleProsodyForRanges(project, ranges) {
  clearTimeout(prosodyScheduleTimer);
  setProsodyScheduleTimer(setTimeout(() => {
    for (const r of ranges) {
      const entry = project.sentenceProsodyByKey?.[r.key];
      if (!entry || entry.text !== r.text) {
        void ensureSegmentProsody(project, r.key, r.text);
      }
    }
  }, 420));
}
