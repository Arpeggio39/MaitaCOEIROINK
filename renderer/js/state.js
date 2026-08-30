import { EXPORT_SAMPLE_RATE_DEFAULT } from './constants.js';

/** @typedef {Record<string, number|string>} ParamSet */
/** @typedef {{ key: string, start: number, end: number, text: string, index: number }} SentenceRange */
/** @typedef {{ phoneme: string, hira: string, accent: number, pitch?: number }} SegmentMora */
/** @typedef {{ start: number, end: number }} MoraWavRange */
/** @typedef {{ text: string, detail: SegmentMora[][], baseF0?: number[], baselinePitch?: number[], moraWavRanges?: MoraWavRange[], f0TotalSamples?: number, f0SpeedScale?: number, pitchEditedByUser?: boolean }} SegmentProsody */
/** @typedef {{ id: string, title: string, text: string, titleEdited?: boolean, params: ParamSet, sentenceParamsByKey?: Record<string, ParamSet>, sentenceProsodyByKey?: Record<string, SegmentProsody>, updatedAt: string }} Project */

/** @type {Project[]} */
export let projects = [];
/** @type {string | null} */
export let activeId = null;
/** @type {string | null} */
export let activeSentenceKey = null;
/** @type {SentenceRange[]} */
export let lastSentenceRanges = [];
/** @type {ReturnType<typeof setTimeout> | null} */
export let saveTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
export let prosodyScheduleTimer = null;
/** @type {Map<string, number>} */
export const prosodyFetchGeneration = new Map();
/** @type {Set<string>} */
export const prosodyFetchInFlight = new Set();
/** @type {Map<string, Promise<void>>} */
export const prosodyFetchPromises = new Map();

/** @type {{ word: string, yomi: string, accent: number }[]} */
export let dictionaryEntries = [];

/** @type {number} */
export let exportSamplingRate = EXPORT_SAMPLE_RATE_DEFAULT;
/** @type {string} */
export let exportDirectory = '';
/** @type {boolean} */
export let exportDirectoryEnabled = false;
/** @type {boolean} */
export let preventExportOverwrite = false;
/** @type {boolean} */
export let exportTextFileEnabled = false;
/** @type {'utf8' | 'shift_jis'} */
export let exportTextEncoding = 'utf8';

/** 琵音マイタの API styleId */
/** @type {number | null} */
export let maitaStyleId = null;

/** @type {HTMLAudioElement | null} */
export let currentAudio = null;
/** @type {string | null} */
export let currentBlobUrl = null;
/** @type {number | null} */
export let waveformRaf = null;
/** @type {number[]} */
export let waveformPhases = [];
/** @type {AbortController | null} */
export let currentSynthesisController = null;
/** @type {number} */
export let playbackGeneration = 0;
/** @type {(() => void) | null} */
export let cancelPlayback = null;

/** UI 更新コールバック（循環 import 回避） */
/** @type {(() => void) | null} */
export let refreshIntonationUi = null;

export function activeProject() {
  return projects.find((p) => p.id === activeId) || null;
}

export function setProjects(list) {
  projects = list;
}

export function setActiveId(id) {
  activeId = id;
}

export function setActiveSentenceKey(key) {
  activeSentenceKey = key;
}

export function setSaveTimer(timer) {
  saveTimer = timer;
}

export function setProsodyScheduleTimer(timer) {
  prosodyScheduleTimer = timer;
}

export function setDictionaryEntries(entries) {
  dictionaryEntries = entries;
}

export function setExportSamplingRate(rate) {
  exportSamplingRate = rate;
}

export function setExportDirectory(directory) {
  exportDirectory = String(directory || '');
}

export function setExportDirectoryEnabled(enabled) {
  exportDirectoryEnabled = Boolean(enabled);
}

export function setPreventExportOverwrite(enabled) {
  preventExportOverwrite = Boolean(enabled);
}

export function setExportTextFileEnabled(enabled) {
  exportTextFileEnabled = Boolean(enabled);
}

export function setExportTextEncoding(encoding) {
  exportTextEncoding = encoding === 'shift_jis' ? 'shift_jis' : 'utf8';
}

export function setMaitaStyleId(styleId) {
  maitaStyleId = styleId;
}

export function setCurrentAudio(audio) {
  currentAudio = audio;
}

export function setCurrentBlobUrl(url) {
  currentBlobUrl = url;
}

export function setWaveformRaf(raf) {
  waveformRaf = raf;
}

export function setWaveformPhases(phases) {
  waveformPhases = phases;
}

export function setCurrentSynthesisController(controller) {
  currentSynthesisController = controller;
}

export function nextPlaybackGeneration() {
  playbackGeneration += 1;
  return playbackGeneration;
}

export function setCancelPlayback(fn) {
  cancelPlayback = fn;
}

export function setRefreshIntonationUi(fn) {
  refreshIntonationUi = fn;
}
