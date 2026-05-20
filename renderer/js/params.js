import { PARAM_DEFAULTS } from './constants.js';

/**
 * @param {import('./state.js').ParamSet} a
 * @param {import('./state.js').ParamSet} b
 */
export function paramsEqual(a, b) {
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

/**
 * @param {import('./state.js').ParamSet} params
 */
export function cloneParams(params) {
  const merged = { ...PARAM_DEFAULTS, ...params };
  delete merged.outputSamplingRate;
  return merged;
}

/**
 * @param {Record<string, HTMLElement | null>} root
 */
export function snapshotParamsFromControls(root) {
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
 * @param {import('./state.js').ParamSet} params
 */
export function applyParamsToControls(root, params) {
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
export function refreshValueLabelsFor(root) {
  const fmt = (n, d = 2) => Number(n).toFixed(d);
  root.speedScaleVal.textContent = fmt(root.speedScale.value);
  root.pitchScaleVal.textContent = fmt(root.pitchScale.value);
  root.intonationScaleVal.textContent = fmt(root.intonationScale.value);
  root.volumeScaleVal.textContent = fmt(root.volumeScale.value);
  root.prePhonemeLengthVal.textContent = fmt(root.prePhonemeLength.value);
  root.postPhonemeLengthVal.textContent = fmt(root.postPhonemeLength.value);
}
