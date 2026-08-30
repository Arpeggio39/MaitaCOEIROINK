import { PARAM_DEFAULTS } from './constants.js';
import { normalizeProcessingAlgorithm } from './coeiroink-contract.mjs';

const PARAM_BOUNDS = Object.freeze({
  speedScale: [0.5, 2],
  pitchScale: [-0.15, 0.15],
  intonationScale: [0, 2],
  volumeScale: [0, 2],
  prePhonemeLength: [0, 1],
  postPhonemeLength: [0, 1],
});

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

/**
 * @param {import('./state.js').ParamSet} a
 * @param {import('./state.js').ParamSet} b
 */
export function paramsEqual(a, b) {
  const left = cloneParams(a);
  const right = cloneParams(b);
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
    if (left[k] !== right[k]) return false;
  }
  return true;
}

/**
 * @param {import('./state.js').ParamSet} params
 */
export function cloneParams(params = {}) {
  const merged = { ...PARAM_DEFAULTS, ...params };
  return {
    speedScale: normalizeNumber(
      merged.speedScale,
      PARAM_DEFAULTS.speedScale,
      ...PARAM_BOUNDS.speedScale,
    ),
    pitchScale: normalizeNumber(
      merged.pitchScale,
      PARAM_DEFAULTS.pitchScale,
      ...PARAM_BOUNDS.pitchScale,
    ),
    intonationScale: normalizeNumber(
      merged.intonationScale,
      PARAM_DEFAULTS.intonationScale,
      ...PARAM_BOUNDS.intonationScale,
    ),
    volumeScale: normalizeNumber(
      merged.volumeScale,
      PARAM_DEFAULTS.volumeScale,
      ...PARAM_BOUNDS.volumeScale,
    ),
    prePhonemeLength: normalizeNumber(
      merged.prePhonemeLength,
      PARAM_DEFAULTS.prePhonemeLength,
      ...PARAM_BOUNDS.prePhonemeLength,
    ),
    postPhonemeLength: normalizeNumber(
      merged.postPhonemeLength,
      PARAM_DEFAULTS.postPhonemeLength,
      ...PARAM_BOUNDS.postPhonemeLength,
    ),
    processingAlgorithm: normalizeProcessingAlgorithm(merged.processingAlgorithm),
  };
}

/**
 * @param {Record<string, HTMLElement | null>} root
 */
export function snapshotParamsFromControls(root) {
  return cloneParams({
    speedScale: Number(root.speedScale.value),
    pitchScale: Number(root.pitchScale.value),
    intonationScale: Number(root.intonationScale.value),
    volumeScale: Number(root.volumeScale.value),
    prePhonemeLength: Number(root.prePhonemeLength.value),
    postPhonemeLength: Number(root.postPhonemeLength.value),
    processingAlgorithm: root.processingAlgorithm.value,
  });
}

/**
 * @param {Record<string, HTMLElement | null>} root
 * @param {import('./state.js').ParamSet} params
 */
export function applyParamsToControls(root, params) {
  const par = cloneParams(params);
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
export function refreshValueLabelsFor(root) {
  const fmt = (n, d = 2) => Number(n).toFixed(d);
  root.speedScaleVal.textContent = fmt(root.speedScale.value);
  root.pitchScaleVal.textContent = fmt(root.pitchScale.value);
  root.intonationScaleVal.textContent = fmt(root.intonationScale.value);
  root.volumeScaleVal.textContent = fmt(root.volumeScale.value);
  root.prePhonemeLengthVal.textContent = fmt(root.prePhonemeLength.value);
  root.postPhonemeLengthVal.textContent = fmt(root.postPhonemeLength.value);
}
