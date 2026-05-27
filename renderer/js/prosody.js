import { postCoeiroink } from './coeiroink-api.js';
import {
  MAITA_UUID,
  MORA_PITCH_DEFAULT,
  MORA_PITCH_MAX,
  MORA_PITCH_MIN,
} from './constants.js';
import { getSentenceParams } from './segments.js';
import {
  activeSentenceKey,
  prosodyFetchGeneration,
  prosodyFetchInFlight,
  prosodyScheduleTimer,
  setProsodyScheduleTimer,
} from './state.js';
import * as appState from './state.js';
import { showToast } from './utils.js';
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
 * @param {number} pitch
 */
function moraPitchToHz(pitch) {
  return 200 * 2 ** (pitch - MORA_PITCH_DEFAULT);
}

/**
 * @param {import('./state.js').SegmentMora[][]} detail
 */
export function prosodyDetailForApi(detail) {
  return detail.map((phrase) =>
    phrase.map(({ phoneme, hira, accent }) => ({ phoneme, hira, accent })),
  );
}

/**
 * @param {import('./state.js').SegmentProsody} src
 */
export function cloneSegmentProsody(src) {
  return {
    text: src.text,
    detail: cloneProsodyDetail(src.detail),
    baseF0: src.baseF0 ? [...src.baseF0] : undefined,
    baselinePitch: src.baselinePitch ? [...src.baselinePitch] : undefined,
    moraWavRanges: src.moraWavRanges ? src.moraWavRanges.map((r) => ({ ...r })) : undefined,
    f0TotalSamples: src.f0TotalSamples,
    f0SpeedScale: src.f0SpeedScale,
  };
}

/**
 * @param {import('./state.js').SegmentProsody} prosody
 */
export function hasProsodyPitchEdits(prosody) {
  const flat = prosody.detail?.flat() ?? [];
  const baseline = prosody.baselinePitch;
  if (!baseline?.length || baseline.length !== flat.length) return false;
  for (let i = 0; i < flat.length; i += 1) {
    const cur = getMoraPitch(flat[i]);
    const base = baseline[i];
    if (Math.abs(cur - base) > 0.001) return true;
  }
  return false;
}

/**
 * @param {import('./state.js').SegmentProsody} prosody
 * @returns {number[] | null}
 */
export function buildAdjustedF0ForSynthesis(prosody) {
  const { baseF0, moraWavRanges, f0TotalSamples, baselinePitch, detail } = prosody;
  if (!baseF0?.length || !moraWavRanges?.length || !f0TotalSamples || !detail?.length) return null;

  const flat = detail.flat();
  const adjusted = [...baseF0];
  for (let mi = 0; mi < moraWavRanges.length; mi += 1) {
    if (mi >= flat.length) break;
    const { start, end } = moraWavRanges[mi];
    const i0 = Math.floor((start / f0TotalSamples) * adjusted.length);
    const i1 = Math.min(adjusted.length - 1, Math.ceil((end / f0TotalSamples) * adjusted.length));
    const delta =
      moraPitchToHz(getMoraPitch(flat[mi])) - moraPitchToHz(baselinePitch[mi] ?? MORA_PITCH_DEFAULT);
    if (Math.abs(delta) <= 0.01) continue;
    for (let i = i0; i <= i1; i += 1) {
      if (adjusted[i] > 50) adjusted[i] = Math.max(50, adjusted[i] + delta);
    }
  }
  return adjusted;
}

/**
 * @param {import('./state.js').SegmentMora[][]} detail
 * @param {{ hira?: string, phonemePitches?: { wavRange: { start: number, end: number } }[] }[]} moraDurations
 * @param {number[]} f0
 * @param {import('./state.js').SegmentProsody} entry
 */
function storeF0Metadata(entry, detail, moraDurations, f0) {
  const flat = detail.flat();
  let totalSamples = 1;
  for (const md of moraDurations) {
    const pp = md.phonemePitches;
    if (!pp?.length) continue;
    totalSamples = Math.max(totalSamples, pp[pp.length - 1].wavRange.end);
  }

  /** @type {import('./state.js').MoraWavRange[]} */
  const moraWavRanges = [];
  /** @type {number[]} */
  const baselinePitch = [];
  let moraIdx = 0;

  for (const md of moraDurations) {
    const hira = (md.hira || '').trim();
    if (!hira || moraIdx >= flat.length) continue;
    const pp = md.phonemePitches;
    if (!pp?.length) continue;
    const start = pp[0].wavRange.start;
    const end = pp[pp.length - 1].wavRange.end;
    moraWavRanges.push({ start, end });
    baselinePitch.push(hzToMoraPitch(medianF0InRange(f0, start, end, totalSamples)));
    moraIdx += 1;
  }

  entry.baseF0 = [...f0];
  entry.baselinePitch = baselinePitch;
  entry.moraWavRanges = moraWavRanges;
  entry.f0TotalSamples = totalSamples;
}

/**
 * @param {import('./state.js').SegmentProsody} entry
 */
function clearF0Metadata(entry) {
  delete entry.baseF0;
  delete entry.baselinePitch;
  delete entry.moraWavRanges;
  delete entry.f0TotalSamples;
  delete entry.f0SpeedScale;
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
 * @param {import('./state.js').SegmentProsody} entry
 */
function applyF0ToProsodyDetail(detail, moraDurations, f0, entry) {
  storeF0Metadata(entry, detail, moraDurations, f0);
  const flat = detail.flat();
  for (let i = 0; i < (entry.baselinePitch?.length ?? 0); i += 1) {
    if (i < flat.length) flat[i].pitch = entry.baselinePitch[i];
  }
}

/**
 * @param {string} text
 */
async function fetchEstimateProsody(text) {
  const res = await postCoeiroink(
    '/v1/estimate_prosody',
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
  const res = await postCoeiroink(
    '/v1/estimate_prosody_from_kana',
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
    const savedPitches = entry.detail.flat().map((m) => getMoraPitch(m));
    try {
      await fetchPredictF0ForProsody(
        entry.text,
        entry.detail,
        entry,
        getSentenceParams(project, key).speedScale,
      );
      const flatAfter = entry.detail.flat();
      for (let i = 0; i < flatAfter.length; i += 1) {
        if (i < savedPitches.length) flatAfter[i].pitch = savedPitches[i];
      }
    } catch (_) {
      clearF0Metadata(entry);
    }
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
const kanaReestimateInFlight = new Set();

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
 * @param {import('./state.js').SegmentProsody} entry
 * @param {number} [speedScale]
 */
async function fetchPredictF0ForProsody(text, detail, entry, speedScale = 1) {
  const styleId = await resolveMaitaStyleId();
  const res = await postCoeiroink(
    '/v1/predict_with_duration',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakerUuid: MAITA_UUID,
        styleId: styleId,
        text,
        prosodyDetail: prosodyDetailForApi(detail),
        speedScale,
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
  const f0Res = await postCoeiroink(
    '/v1/estimate_f0',
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
    entry,
  );
  entry.f0SpeedScale = speedScale;
}

/**
 * スライダー調整を合成に反映するため、保存済みの F0 メタデータがなければ取得する。
 * @param {string} text
 * @param {import('./state.js').SegmentProsody} entry
 * @param {number} [speedScale]
 */
export async function ensureProsodyF0Metadata(text, entry, speedScale = 1) {
  const speedChanged = entry.f0SpeedScale != null && entry.f0SpeedScale !== speedScale;
  if (
    !speedChanged &&
    entry.baseF0?.length &&
    entry.moraWavRanges?.length &&
    entry.f0TotalSamples
  ) {
    return;
  }
  if (!entry.detail?.length) return;
  const savedPitches = speedChanged ? null : entry.detail.flat().map((m) => getMoraPitch(m));
  try {
    await fetchPredictF0ForProsody(text, entry.detail, entry, speedScale);
    if (savedPitches) {
      const flat = entry.detail.flat();
      for (let i = 0; i < flat.length; i += 1) {
        if (i < savedPitches.length) flat[i].pitch = savedPitches[i];
      }
    }
  } catch (_) {
    /* 合成時のフォールバック失敗は adjustedF0 なしで続行 */
  }
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
      next[nr.key] = cloneSegmentProsody(oldMap[nr.key]);
      continue;
    }
    const prev = prevRanges.find((pr) => pr.text === nr.text && !usedOldKeys.has(pr.key));
    if (prev && oldMap[prev.key] && oldMap[prev.key].text === nr.text) {
      next[nr.key] = cloneSegmentProsody(oldMap[prev.key]);
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
  prosodyFetchInFlight.add(key);
  notifyIntonationUi();

  try {
    const detail = await fetchEstimateProsody(trimmed);
    applyDefaultMoraPitches(detail);

    if (prosodyFetchGeneration.get(key) !== gen) return;
    project.sentenceProsodyByKey[key] = { text: trimmed, detail };
    notifyIntonationUi();

    try {
      const speedScale = getSentenceParams(project, key).speedScale;
      await fetchPredictF0ForProsody(trimmed, detail, project.sentenceProsodyByKey[key], speedScale);
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
