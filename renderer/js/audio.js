import {
  MAITA_UUID,
  PLAYBACK_SAMPLE_RATE,
} from './constants.js';
import { postCoeiroink } from './coeiroink-api.js';
import { buildSynthesisPayload } from './coeiroink-contract.mjs';
import { els } from './dom.js';
import { snapshotParamsFromControls } from './params.js';
import { segmentParamControls } from './dom.js';
import { getSentenceParams, sentenceRangesFromText } from './segments.js';
import { playbackRangesForSelection } from './segment-parser.mjs';
import {
  buildAdjustedF0ForSynthesis,
  ensureProsodyF0Metadata,
  ensureSegmentProsody,
  getProsodyIntonationEditorMode,
  getSegmentProsody,
  hasProsodyPitchEdits,
  prosodyDetailForApi,
} from './prosody.js';
import { resolveMaitaStyleId } from './engine.js';
import { activeProject, activeSentenceKey } from './state.js';
import * as appState from './state.js';
import { isCoeiroinkRelatedError, showOperationError } from './coeiroink-warning.js';
import { coerceSampleRate, showToast } from './utils.js';
import { concatWavBuffers } from './wav-utils.mjs';
import { exportRangesSequentially } from './export-sequence.mjs';
import { saveActiveSegmentParams } from './editor.js';
import { bridge } from './bridge.js';
import { getExportSamplingRate, persistAppSettings } from './settings.js';
import {
  combinedExportFilename,
  segmentExportFilename,
  selectedExportFilename,
  textFilePathForWav,
} from './export-utils.mjs';

/**
 * @param {string} textLine
 * @param {import('./state.js').ParamSet} [paramsOverride]
 * @param {import('./state.js').SegmentProsody | null} [prosodyOverride]
 * @param {number} [outputSamplingRate]
 */
async function synthesizeLine(
  textLine,
  paramsOverride,
  prosodyOverride = null,
  outputSamplingRate = PLAYBACK_SAMPLE_RATE,
  signal,
) {
  signal?.throwIfAborted();
  const styleId = await resolveMaitaStyleId();
  const params = paramsOverride ?? snapshotParamsFromControls(segmentParamControls);
  const applyDetailedPitch =
    prosodyOverride?.detail?.length &&
    getProsodyIntonationEditorMode(prosodyOverride, appState.intonationEditorMode) === 'pitch' &&
    hasProsodyPitchEdits(prosodyOverride);
  if (applyDetailedPitch) {
    await ensureProsodyF0Metadata(textLine, prosodyOverride, params.speedScale, signal);
  }
  const detail = prosodyOverride?.detail?.length ? prosodyDetailForApi(prosodyOverride.detail) : [];
  let adjustedF0 = [];
  if (prosodyOverride && applyDetailedPitch) {
    adjustedF0 = buildAdjustedF0ForSynthesis(prosodyOverride);
    if (!adjustedF0) {
      throw new Error(
        'ピッチ調整を合成に反映できませんでした。文章を選択して「韻律を再取得」を試してください。',
      );
    }
  }
  const body = buildSynthesisPayload({
    speakerUuid: MAITA_UUID,
    styleId,
    text: textLine,
    prosodyDetail: detail,
    params,
    outputSamplingRate: coerceSampleRate(outputSamplingRate),
    adjustedF0,
  });
  const res = await postCoeiroink(
    '/v1/synthesis',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify(body),
      signal,
    },
    180000,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

async function buildPlaybackUtterance(outputSamplingRate = PLAYBACK_SAMPLE_RATE, signal) {
  saveActiveSegmentParams();
  const p = activeProject();
  const allRanges = sentenceRangesFromText(els.editor.value);
  const ranges = playbackRangesForSelection(allRanges, activeSentenceKey);
  if (ranges.length === 0) {
    throw new Error('読み上げるテキストがありません（句読点・スペース・改行で区切られた部分が必要です）。');
  }
  /** @type {ArrayBuffer[]} */
  const parts = [];
  for (const r of ranges) {
    signal?.throwIfAborted();
    const params = getSentenceParams(p, r.key);
    let prosody = getSegmentProsody(p, r.key);
    if (!prosody || prosody.text !== r.text.trim()) {
      await ensureSegmentProsody(p, r.key, r.text);
      signal?.throwIfAborted();
      prosody = getSegmentProsody(p, r.key);
    }
    const wav = await synthesizeLine(r.text, params, prosody, outputSamplingRate, signal);
    parts.push(wav);
  }
  return concatWavBuffers(parts);
}

export function resizeWaveformCanvas() {
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
  if (appState.waveformRaf != null) {
    cancelAnimationFrame(appState.waveformRaf);
    appState.setWaveformRaf(null);
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
  if (!ctx || canvas.width < 2 || appState.waveformPhases.length === 0) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const n = appState.waveformPhases.length;
  const slot = canvas.width / n;
  const barW = slot * 0.52;
  const mid = canvas.height / 2;
  ctx.fillStyle = 'rgba(232, 72, 142, 0.82)';
  for (let i = 0; i < n; i++) {
    const blend =
      0.28 * Math.sin(t * 0.003 + appState.waveformPhases[i]) +
      0.18 * Math.sin(t * 0.005 + i * 0.5) +
      0.14 * Math.sin(t * 0.008 + i * 0.35);
    const h = Math.max(4 * (window.devicePixelRatio || 1), (0.34 + blend * 0.26) * canvas.height);
    const x = i * slot + (slot - barW) / 2;
    ctx.fillRect(x, mid - h / 2, barW, h);
  }
}

function startWaveformAnimation() {
  resizeWaveformCanvas();
  appState.setWaveformPhases(Array.from({ length: 56 }, () => Math.random() * Math.PI * 2));
  /** @param {number} now */
  function loop(now) {
    if (!els.waveformCanvas.classList.contains('is-active')) return;
    drawWaveformFrame(now);
    appState.setWaveformRaf(requestAnimationFrame(loop));
  }
  appState.setWaveformRaf(requestAnimationFrame(loop));
}

function setPlaybackUi(playing) {
  els.btnPlay.title = playing ? '停止' : '選択中の部分を再生（未選択時は全文）';
  els.btnPlayIconPlay.classList.toggle('hidden', playing);
  els.btnPlayIconStop.classList.toggle('hidden', !playing);
  els.waveformCanvas.classList.toggle('is-active', playing);
}

function cleanupPlaybackNatural() {
  stopWaveformAnimation();
  setPlaybackUi(false);
  if (appState.currentBlobUrl) {
    URL.revokeObjectURL(appState.currentBlobUrl);
    appState.setCurrentBlobUrl(null);
  }
  appState.setCurrentAudio(null);
}

export function stopPlayback() {
  appState.nextPlaybackGeneration();
  if (appState.currentSynthesisController) {
    appState.currentSynthesisController.abort();
    appState.setCurrentSynthesisController(null);
  }
  stopWaveformAnimation();
  setPlaybackUi(false);
  if (appState.currentAudio) {
    try {
      appState.currentAudio.onended = null;
      appState.currentAudio.pause();
      appState.currentAudio.currentTime = 0;
    } catch (_) {
      /* ignore */
    }
    appState.setCurrentAudio(null);
  }
  if (appState.currentBlobUrl) {
    URL.revokeObjectURL(appState.currentBlobUrl);
    appState.setCurrentBlobUrl(null);
  }
}

function isAudioPlaying() {
  return !!(appState.currentAudio && !appState.currentAudio.paused && !appState.currentAudio.ended);
}

export async function togglePlayback() {
  if (isAudioPlaying() || appState.currentSynthesisController) {
    stopPlayback();
    return;
  }
  await playAudio();
}

async function playAudio() {
  stopPlayback();
  const generation = appState.nextPlaybackGeneration();
  const controller = new AbortController();
  appState.setCurrentSynthesisController(controller);
  setPlaybackUi(true);
  try {
    const buf = await buildPlaybackUtterance(PLAYBACK_SAMPLE_RATE, controller.signal);
    if (controller.signal.aborted || appState.playbackGeneration !== generation) return;
    const blob = new Blob([buf], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    appState.setCurrentBlobUrl(url);
    const au = new Audio(url);
    appState.setCurrentAudio(au);
    au.onended = () => {
      if (appState.currentAudio !== au) return;
      cleanupPlaybackNatural();
    };
    await au.play();
    resizeWaveformCanvas();
    setPlaybackUi(true);
    startWaveformAnimation();
  } catch (e) {
    stopPlayback();
    if (e?.name !== 'AbortError') showOperationError(e);
  } finally {
    if (appState.currentSynthesisController === controller) {
      appState.setCurrentSynthesisController(null);
    }
  }
}

appState.setCancelPlayback(stopPlayback);

let exportInProgress = false;

function setExportProgress(message, kind = '') {
  els.exportProgress.textContent = message;
  els.exportProgress.hidden = !message;
  els.exportProgress.className = `export-progress${kind ? ` is-${kind}` : ''}`;
}

function exportErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 140 ? `${message.slice(0, 137)}…` : message;
}

function showExportError(error) {
  setExportProgress(`書き出しに失敗しました: ${exportErrorMessage(error)}`, 'error');
  showOperationError(error);
}

function isLikelyConnectionError(error) {
  if (isCoeiroinkRelatedError(error)) return true;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /fetch failed|failed to fetch|network|econn|timed out|timeout/i.test(message)
  );
}

export function openExportChoiceModal() {
  els.btnExportSelected.disabled = activeSentenceKey == null;
  setExportProgress('');
  els.exportChoiceModal.classList.remove('hidden');
}

export function closeExportChoiceModal({ force = false } = {}) {
  if (exportInProgress && !force) return;
  els.exportChoiceModal.classList.add('hidden');
}

function setExportButtonsDisabled(disabled) {
  exportInProgress = disabled;
  els.btnExportCombined.disabled = disabled;
  els.btnExportAll.disabled = disabled;
  els.btnExportSelected.disabled = disabled || activeSentenceKey == null;
  els.btnExportChoiceDismiss.disabled = disabled;
  els.exportChoiceModal.setAttribute('aria-busy', String(disabled));
}

async function resolveSingleExportPath(defaultName) {
  return appState.exportDirectoryEnabled && appState.exportDirectory
    ? bridge.resolveExportFilePath(appState.exportDirectory, defaultName, {
        unique: appState.preventExportOverwrite,
        companionText: appState.exportTextFileEnabled,
      })
    : bridge.saveWavDialog(defaultName);
}

export async function exportCombinedAudio() {
  const ranges = sentenceRangesFromText(els.editor.value);
  if (ranges.length === 0) {
    showToast('書き出す文章がありません');
    return;
  }

  setExportButtonsDisabled(true);
  try {
    setExportProgress('保存先を確認しています…');
    await persistAppSettings();
    const p = activeProject();
    if (!p) {
      setExportProgress('');
      return;
    }
    const filePath = await resolveSingleExportPath(combinedExportFilename(p.title));
    if (!filePath) {
      setExportProgress('');
      return;
    }

    saveActiveSegmentParams();
    const parts = [];
    for (let index = 0; index < ranges.length; index += 1) {
      setExportProgress(`${index + 1}/${ranges.length}件目を合成しています…`);
      parts.push(await synthesizeRange(p, ranges[index]));
    }
    await writeExportFiles(filePath, concatWavBuffers(parts), els.editor.value);
    closeExportChoiceModal({ force: true });
    const artifactLabel = appState.exportTextFileEnabled ? 'WAVとtxtを' : 'WAVを';
    showToast(`全文を1つの${artifactLabel}書き出しました: ${filePath}`);
  } catch (e) {
    showExportError(e);
  } finally {
    setExportButtonsDisabled(false);
  }
}

export async function exportAllAudio() {
  const ranges = sentenceRangesFromText(els.editor.value);
  if (ranges.length === 0) {
    showToast('書き出す文章がありません');
    return;
  }

  setExportButtonsDisabled(true);
  try {
    setExportProgress('保存先を確認しています…');
    await persistAppSettings();
    const directory = appState.exportDirectoryEnabled && appState.exportDirectory
      ? appState.exportDirectory
      : await bridge.selectExportDirectory();
    if (!directory) {
      setExportProgress('');
      return;
    }

    const p = activeProject();
    if (!p) {
      setExportProgress('');
      return;
    }
    saveActiveSegmentParams();
    const result = await exportRangesSequentially(ranges, {
      prepare: async (range) => {
        const buf = await synthesizeRange(p, range);
        const filePath = await bridge.resolveExportFilePath(
          directory,
          segmentExportFilename(p.title, range),
          {
            unique: appState.preventExportOverwrite,
            companionText: appState.exportTextFileEnabled,
          },
        );
        return { filePath, buf, text: range.text };
      },
      save: async (artifact) => {
        await writeExportFiles(artifact.filePath, artifact.buf, artifact.text);
      },
      onProgress: ({ phase, current, total, savedCount }) => {
        if (phase === 'preparing') {
          setExportProgress(`${current}/${total}件目を合成しています…`);
        } else if (phase === 'saved') {
          setExportProgress(`${savedCount}/${total}件を保存しました`);
        }
      },
      shouldStopOnError: (error) => isLikelyConnectionError(error),
    });

    if (result.failures.length > 0) {
      const failedNumbers = result.failures
        .slice(0, 5)
        .map((failure) => failure.index + 1)
        .join('、');
      const firstError = result.failures[0].error;
      const skipped = result.skippedCount > 0 ? `、後続${result.skippedCount}件は未処理` : '';
      const summary =
        `${result.savedCount}/${ranges.length}件を保存しました。` +
        `${failedNumbers}件目で失敗${skipped}: ${exportErrorMessage(firstError)}`;
      setExportProgress(summary, 'error');
      showOperationError(firstError);
      return;
    }
    closeExportChoiceModal({ force: true });
    const artifactLabel = appState.exportTextFileEnabled ? 'WAVとtxt' : 'WAV';
    showToast(`${ranges.length}件の${artifactLabel}を書き出しました: ${directory}`);
  } catch (e) {
    showExportError(e);
  } finally {
    setExportButtonsDisabled(false);
  }
}

async function synthesizeRange(project, range) {
  let prosody = getSegmentProsody(project, range.key);
  if (!prosody || prosody.text !== range.text.trim()) {
    await ensureSegmentProsody(project, range.key, range.text);
    prosody = getSegmentProsody(project, range.key);
  }
  const params = getSentenceParams(project, range.key);
  return synthesizeLine(range.text, params, prosody, getExportSamplingRate());
}

export async function exportSelectedAudio() {
  if (activeSentenceKey == null) {
    showToast('書き出す文章を選択してください');
    return;
  }

  saveActiveSegmentParams();
  const p = activeProject();
  if (!p) return;

  const range = sentenceRangesFromText(els.editor.value).find((r) => r.key === activeSentenceKey);
  if (!range) {
    showToast('選択した文章が見つかりません');
    return;
  }

  setExportButtonsDisabled(true);
  try {
    setExportProgress('選択中の文章を合成しています…');
    await persistAppSettings();
    const buf = await synthesizeRange(p, range);
    const defaultName = selectedExportFilename(p.title, range);
    const filePath = await resolveSingleExportPath(defaultName);
    if (!filePath) {
      setExportProgress('');
      return;
    }
    await writeExportFiles(filePath, buf, range.text);
    closeExportChoiceModal({ force: true });
    const artifactLabel = appState.exportTextFileEnabled ? 'WAVとtxtを' : '';
    showToast(`${artifactLabel}書き出しました: ${filePath}`);
  } catch (e) {
    showExportError(e);
  } finally {
    setExportButtonsDisabled(false);
  }
}

async function writeExportFiles(filePath, buffer, text) {
  // WAVをかんしくんが検知する時点で同名txtが読めるよう、txtを先に書く。
  if (appState.exportTextFileEnabled) {
    await bridge.writeTextFile(
      textFilePathForWav(filePath),
      text.trim(),
      appState.exportTextEncoding,
    );
  }
  await bridge.writeWavFile(filePath, buffer);
}
