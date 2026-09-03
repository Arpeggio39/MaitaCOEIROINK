import { postCoeiroink } from './coeiroink-api.js';
import {
  buildEstimateF0Payload,
  buildPredictWithDurationPayload,
  buildProsodyPayload,
  parseWorldF0Response,
} from './coeiroink-contract.mjs';
import {
  MAITA_UUID,
  MORA_PITCH_DEFAULT,
  MORA_PITCH_MAX,
  MORA_PITCH_MIN,
} from './constants.js';
import { getSentenceParams, sentenceRangesFromText } from './segments.js';
import {
  activeSentenceKey,
  prosodyFetchGeneration,
  prosodyFetchInFlight,
  prosodyFetchPromises,
  prosodyScheduleTimer,
  setProsodyScheduleTimer,
} from './state.js';
import * as appState from './state.js';
import { showOperationError } from './coeiroink-warning.js';
import { resolveMaitaStyleId } from './engine.js';
import { schedulePersist } from './persist.js';
import { prosodyRequestKey } from './prosody-request-key.mjs';
import {
  hasProsodyPitchEditsState,
  pitchEditMask,
  normalizeIntonationEditorMode,
  remapProsodyEntries,
  resolveIntonationEditorMode,
  shouldReconcileDefaultPitches,
} from './prosody-edit-utils.mjs';

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
 * @param {import('./state.js').SegmentProsody} prosody
 */
export function markProsodyPitchEdited(prosody) {
  prosody.pitchEditedByUser = true;
  prosody.intonationEditorMode = 'pitch';
}

/**
 * @param {import('./state.js').SegmentProsody} prosody
 * @param {unknown} mode
 */
export function setProsodyIntonationEditorMode(prosody, mode) {
  prosody.intonationEditorMode = normalizeIntonationEditorMode(mode);
}

/**
 * アクセント変更後は、変更前のアクセントから推定した F0 基準値だけを破棄する。
 * 詳細ピッチの値自体は残すため、詳細モードへ戻したときに再取得して復元できる。
 * @param {import('./state.js').SegmentProsody} prosody
 */
export function markProsodyAccentEdited(prosody) {
  prosody.intonationEditorMode = 'accent';
  clearF0Metadata(prosody);
}

/**
 * @param {import('./state.js').SegmentProsody | null | undefined} prosody
 * @param {unknown} preferredMode
 */
export function getProsodyIntonationEditorMode(prosody, preferredMode) {
  return resolveIntonationEditorMode(prosody, preferredMode);
}

/**
 * @param {import('./state.js').SegmentProsody} prosody
 */
export function hasProsodyPitchEdits(prosody) {
  const flat = prosody.detail?.flat() ?? [];
  return hasProsodyPitchEditsState(
    prosody.pitchEditedByUser,
    flat.map((m) => getMoraPitch(m)),
    prosody.baselinePitch,
  );
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
    const range = moraWavRanges[mi];
    const baseline = baselinePitch?.[mi];
    if (!range || !Number.isFinite(baseline)) continue;
    const { start, end } = range;
    const i0 = Math.floor((start / f0TotalSamples) * adjusted.length);
    const i1 = Math.min(adjusted.length - 1, Math.ceil((end / f0TotalSamples) * adjusted.length));
    const delta =
      moraPitchToHz(getMoraPitch(flat[mi])) - moraPitchToHz(baseline);
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
      body: JSON.stringify(buildProsodyPayload(text)),
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
      body: JSON.stringify(buildProsodyPayload(kana)),
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
  const requestKey = prosodyRequestKey(project, key);
  if (prosodyFetchInFlight.has(requestKey)) {
    await prosodyFetchPromises.get(requestKey);
  }
  if (kanaReestimateInFlight.has(requestKey)) return kanaReestimateInFlight.get(requestKey);
  const initialEntry = project.sentenceProsodyByKey?.[key];
  if (!initialEntry?.detail?.length) return;
  if (!initialEntry.detail.flat().some((m) => (m.hira || '').trim())) return;

  const run = (async () => {
    if (activeSentenceKey === key) notifyIntonationUi();
    try {
      do {
        kanaReestimatePending.delete(requestKey);
        const entry = project.sentenceProsodyByKey?.[key];
        if (!entry?.detail?.length) return;
        const kana = entry.detail.flat().map((m) => m.hira || '').join('').trim();
        if (!kana) return;

        const temporary = { text: entry.text, detail: await fetchEstimateProsodyFromKana(kana) };
        applyDefaultMoraPitches(temporary.detail);
        try {
          await fetchPredictF0ForProsody(
            temporary.text,
            temporary.detail,
            temporary,
            getSentenceParams(project, key).speedScale,
          );
        } catch (_) {
          clearF0Metadata(temporary);
        }

        const current = project.sentenceProsodyByKey?.[key];
        if (!current?.detail?.length) return;
        const latestKana = current.detail.flat().map((m) => m.hira || '').join('').trim();
        if (latestKana !== kana) continue;

        const preservePitches = hasProsodyPitchEdits(current)
          ? current.detail.flat().map((m) => getMoraPitch(m))
          : null;
        if (preservePitches) {
          const flat = temporary.detail.flat();
          for (let i = 0; i < Math.min(flat.length, preservePitches.length); i += 1) {
            flat[i].pitch = preservePitches[i];
          }
          temporary.pitchEditedByUser = true;
        }

        for (const name of ['baseF0', 'baselinePitch', 'moraWavRanges', 'f0TotalSamples', 'f0SpeedScale', 'pitchEditedByUser']) {
          delete current[name];
        }
        Object.assign(current, temporary);
        schedulePersist();
      } while (kanaReestimatePending.has(requestKey));
    } catch (e) {
      if (activeSentenceKey === key) showOperationError(e);
    } finally {
      kanaReestimateInFlight.delete(requestKey);
      if (activeSentenceKey === key) notifyIntonationUi();
    }
  })();
  kanaReestimateInFlight.set(requestKey, run);
  return run;
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const kanaReestimateTimers = new Map();
/** @type {Map<string, { project: import('./state.js').Project, key: string }>} */
const kanaReestimatePending = new Map();
/** @type {Map<string, Promise<void>>} */
const kanaReestimateInFlight = new Map();

/**
 * @param {import('./state.js').Project} project
 * @param {string} key
 */
export function scheduleProsodyKanaReestimate(project, key) {
  const requestKey = prosodyRequestKey(project, key);
  kanaReestimatePending.set(requestKey, { project, key });
  clearTimeout(kanaReestimateTimers.get(requestKey));
  kanaReestimateTimers.set(requestKey, setTimeout(() => {
    kanaReestimateTimers.delete(requestKey);
    const pending = kanaReestimatePending.get(requestKey);
    if (!pending) return;
    void reestimateProsodyFromKana(pending.project, pending.key);
  }, 420));
}

/**
 * @param {string} text
 * @param {import('./state.js').SegmentMora[][]} detail
 * @param {import('./state.js').SegmentProsody} entry
 * @param {number} [speedScale]
 */
async function fetchPredictF0ForProsody(text, detail, entry, speedScale = 1, signal) {
  const initialPitches = detail.flat().map((m) => getMoraPitch(m));
  const previousBaseline = entry.baselinePitch ? [...entry.baselinePitch] : undefined;
  const styleId = await resolveMaitaStyleId();
  const res = await postCoeiroink(
    '/v1/predict_with_duration',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPredictWithDurationPayload({
        speakerUuid: MAITA_UUID,
        styleId,
        text,
        prosodyDetail: prosodyDetailForApi(detail),
        speedScale,
      })),
      signal,
    },
    120000,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `ピッチ推定に失敗 (${res.status})`);
  }
  /** @type {{ wavBase64?: string, moraDurations?: unknown[], startTrimBuffer?: number, endTrimBuffer?: number }} */
  const pred = await res.json();
  const f0Payload = buildEstimateF0Payload(pred);
  const f0Res = await postCoeiroink(
    '/v1/estimate_f0',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f0Payload),
      signal,
    },
    60000,
  );
  if (!f0Res.ok) {
    const errText = await f0Res.text().catch(() => f0Res.statusText);
    throw new Error(errText || `F0 推定に失敗 (${f0Res.status})`);
  }
  const f0data = parseWorldF0Response(await f0Res.json());
  if (f0data.f0.length === 0) throw new Error('F0 データが空です');
  const currentPitches = detail.flat().map((m) => getMoraPitch(m));
  const editsToPreserve = pitchEditMask(
    initialPitches,
    currentPitches,
    previousBaseline,
    MORA_PITCH_DEFAULT,
  );
  applyF0ToProsodyDetail(
    detail,
    /** @type {{ hira?: string, phonemePitches?: { wavRange: { start: number, end: number } }[] }[]} */ (f0data.moraDurations),
    f0data.f0,
    entry,
  );
  const flat = detail.flat();
  for (let i = 0; i < flat.length; i += 1) {
    if (editsToPreserve[i]) flat[i].pitch = currentPitches[i];
  }
  if (editsToPreserve.some(Boolean)) entry.pitchEditedByUser = true;
  entry.f0SpeedScale = speedScale;
}

/**
 * スライダー調整を合成に反映するため、保存済みの F0 メタデータがなければ取得する。
 * @param {string} text
 * @param {import('./state.js').SegmentProsody} entry
 * @param {number} [speedScale]
 */
export function reconcileDefaultPitchesWithBaseline(prosody) {
  if (prosody.pitchEditedByUser) return;
  const baseline = prosody.baselinePitch;
  const flat = prosody.detail?.flat() ?? [];
  if (!shouldReconcileDefaultPitches(
    prosody.pitchEditedByUser,
    flat.map((m) => getMoraPitch(m)),
    baseline,
    MORA_PITCH_DEFAULT,
  )) return;
  for (let i = 0; i < Math.min(flat.length, baseline.length); i += 1) {
    if (Number.isFinite(baseline[i])) flat[i].pitch = baseline[i];
  }
}

export async function ensureProsodyF0Metadata(text, entry, speedScale = 1, signal) {
  const speedChanged = entry.f0SpeedScale != null && entry.f0SpeedScale !== speedScale;
  if (
    !speedChanged &&
    entry.baseF0?.length &&
    entry.moraWavRanges?.length &&
    entry.f0TotalSamples
  ) {
    reconcileDefaultPitchesWithBaseline(entry);
    return;
  }
  if (!entry.detail?.length) return;
  const hadUserEdits = hasProsodyPitchEdits(entry);
  const savedPitches =
    speedChanged || !hadUserEdits ? null : entry.detail.flat().map((m) => getMoraPitch(m));
  try {
    await fetchPredictF0ForProsody(text, entry.detail, entry, speedScale, signal);
    if (savedPitches) {
      const flat = entry.detail.flat();
      for (let i = 0; i < flat.length; i += 1) {
        if (i < savedPitches.length) flat[i].pitch = savedPitches[i];
      }
      entry.pitchEditedByUser = true;
    }
  } catch (e) {
    if (hasProsodyPitchEdits(entry)) {
      throw new Error(
        'ピッチ調整を反映するための F0 取得に失敗しました。COEIROINK の状態を確認して「韻律を再取得」を試してください。',
        { cause: e },
      );
    }
  }
}

/**
 * @param {import('./state.js').Project} project
 * @param {import('./state.js').SentenceRange[]} prevRanges
 * @param {import('./state.js').SentenceRange[]} newRanges
 */
export function remapSentenceProsody(project, prevRanges, newRanges) {
  const oldMap = project.sentenceProsodyByKey || {};
  project.sentenceProsodyByKey = remapProsodyEntries(oldMap, prevRanges, newRanges);
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
  const requestKey = prosodyRequestKey(project, key);

  if (!project.sentenceProsodyByKey) project.sentenceProsodyByKey = {};
  const existing = project.sentenceProsodyByKey[key];
  if (opts.force && existing) delete project.sentenceProsodyByKey[key];
  const cached = project.sentenceProsodyByKey[key];
  if (!opts.force && cached && cached.text === trimmed && cached.detail?.length) return;
  if (!opts.force && prosodyFetchInFlight.has(requestKey)) {
    return prosodyFetchPromises.get(requestKey);
  }

  if (opts.force) {
    prosodyFetchGeneration.set(requestKey, (prosodyFetchGeneration.get(requestKey) || 0) + 1);
    prosodyFetchInFlight.delete(requestKey);
  }

  const gen = (prosodyFetchGeneration.get(requestKey) || 0) + 1;
  prosodyFetchGeneration.set(requestKey, gen);
  let resolveCompletion = () => {};
  const completion = new Promise((resolve) => {
    resolveCompletion = resolve;
  });
  prosodyFetchPromises.set(requestKey, completion);

  project.sentenceProsodyByKey[key] = {
    text: trimmed,
    detail: !opts.force && cached?.text === trimmed ? cloneProsodyDetail(cached.detail) : [],
  };
  prosodyFetchInFlight.add(requestKey);
  notifyIntonationUi();

  try {
    const detail = await fetchEstimateProsody(trimmed);
    applyDefaultMoraPitches(detail);

    if (prosodyFetchGeneration.get(requestKey) !== gen) return;
    project.sentenceProsodyByKey[key] = { text: trimmed, detail };
    notifyIntonationUi();

    try {
      const speedScale = getSentenceParams(project, key).speedScale;
      await fetchPredictF0ForProsody(trimmed, detail, project.sentenceProsodyByKey[key], speedScale);
    } catch (e) {
      if (prosodyFetchGeneration.get(requestKey) === gen) {
        showOperationError(e);
      }
    }

    if (prosodyFetchGeneration.get(requestKey) !== gen) return;
    schedulePersist();
    notifyIntonationUi();
  } catch (e) {
    if (prosodyFetchGeneration.get(requestKey) !== gen) return;
    delete project.sentenceProsodyByKey[key];
    showOperationError(e);
  } finally {
    if (prosodyFetchGeneration.get(requestKey) === gen) {
      prosodyFetchInFlight.delete(requestKey);
      notifyIntonationUi();
    }
    if (prosodyFetchPromises.get(requestKey) === completion) {
      prosodyFetchPromises.delete(requestKey);
    }
    resolveCompletion();
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

export function invalidateAllProsodyAfterDictionaryChange() {
  // 辞書更新前に始まった韻律取得が完了して古い読みをキャッシュへ戻すのを防ぐ。
  const pendingKeys = new Set([
    ...prosodyFetchGeneration.keys(),
    ...prosodyFetchInFlight,
    ...prosodyFetchPromises.keys(),
  ]);
  for (const requestKey of pendingKeys) {
    prosodyFetchGeneration.set(requestKey, (prosodyFetchGeneration.get(requestKey) || 0) + 1);
    prosodyFetchInFlight.delete(requestKey);
    prosodyFetchPromises.delete(requestKey);
  }
  for (const timer of kanaReestimateTimers.values()) clearTimeout(timer);
  kanaReestimateTimers.clear();
  kanaReestimatePending.clear();
  kanaReestimateInFlight.clear();

  for (const project of appState.projects) project.sentenceProsodyByKey = {};
  const project = appState.activeProject();
  if (project) scheduleProsodyForRanges(project, sentenceRangesFromText(project.text || ''));
  schedulePersist();
  notifyIntonationUi();
}
