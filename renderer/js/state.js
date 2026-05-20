import { EXPORT_SAMPLE_RATE_DEFAULT } from './constants.js';

/** @typedef {Record<string, number|string>} ParamSet */
/** @typedef {{ key: string, start: number, end: number, text: string, index: number }} SentenceRange */
/** @typedef {{ phoneme: string, hira: string, accent: number, pitch?: number }} SegmentMora */
/** @typedef {{ text: string, detail: SegmentMora[][], loading?: boolean }} SegmentProsody */
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

/** @type {{ word: string, yomi: string, accent: number }[]} */
export let dictionaryEntries = [];

/** @type {number} */
export let exportSamplingRate = EXPORT_SAMPLE_RATE_DEFAULT;

/** 琵音マイタの API styleId */
export let maitaStyleId = 0;

/** @type {HTMLAudioElement | null} */
export let currentAudio = null;
/** @type {string | null} */
export let currentBlobUrl = null;
/** @type {number | null} */
export let waveformRaf = null;
/** @type {number[]} */
export let waveformPhases = [];

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
