import {
  DEFAULT_API_BASE,
  MAITA_UUID,
  PLAYBACK_SAMPLE_RATE,
} from './constants.js';
import { els } from './dom.js';
import { cloneParams, snapshotParamsFromControls } from './params.js';
import { segmentParamControls } from './dom.js';
import { getSentenceParams, sentenceRangesFromText } from './segments.js';
import {
  cloneProsodyDetail,
  ensureSegmentProsody,
  getSegmentProsody,
} from './prosody.js';
import { activeProject, maitaStyleId } from './state.js';
import * as appState from './state.js';
import { coerceSampleRate, showToast } from './utils.js';
import { saveActiveSegmentParams } from './editor.js';
import { bridge } from './bridge.js';
import { getExportSamplingRate, persistAppSettings } from './settings.js';
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
 * @param {import('./state.js').ParamSet} [paramsOverride]
 * @param {import('./state.js').SegmentProsody | null} [prosodyOverride]
 * @param {number} [outputSamplingRate]
 */
async function synthesizeLine(
  textLine,
  paramsOverride,
  prosodyOverride = null,
  outputSamplingRate = PLAYBACK_SAMPLE_RATE,
) {
  if (!maitaStyleId) {
    throw new Error(
      'COEIROINK から琵音マイタのスタイルを取得できません。左下の接続状態を確認してエンジンを起動してから再度お試しください。',
    );
  }
  const url = `${DEFAULT_API_BASE}/v1/synthesis`;
  const params = paramsOverride ?? snapshotParamsFromControls(segmentParamControls);
  const detail = prosodyOverride?.detail?.length ? cloneProsodyDetail(prosodyOverride.detail) : [];
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
    appState.waveformRaf = null;
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
  appState.waveformPhases = Array.from({ length: 56 }, () => Math.random() * Math.PI * 2);
  /** @param {number} now */
  function loop(now) {
    if (!els.waveformCanvas.classList.contains('is-active')) return;
    drawWaveformFrame(now);
    appState.waveformRaf = requestAnimationFrame(loop);
  }
  appState.waveformRaf = requestAnimationFrame(loop);
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
  if (appState.currentBlobUrl) {
    URL.revokeObjectURL(appState.currentBlobUrl);
    appState.currentBlobUrl = null;
  }
  appState.currentAudio = null;
}

export function stopPlayback() {
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
    appState.currentAudio = null;
  }
  if (appState.currentBlobUrl) {
    URL.revokeObjectURL(appState.currentBlobUrl);
    appState.currentBlobUrl = null;
  }
}

function isAudioPlaying() {
  return !!(appState.currentAudio && !appState.currentAudio.paused && !appState.currentAudio.ended);
}

export async function togglePlayback() {
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
    appState.currentBlobUrl = url;
    const au = new Audio(url);
    appState.currentAudio = au;
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
    showToast(e instanceof Error ? e.message : String(e));
  } finally {
    els.btnPlay.disabled = false;
  }
}

export async function exportAudio() {
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
