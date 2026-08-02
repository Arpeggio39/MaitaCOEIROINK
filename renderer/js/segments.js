import { PARAM_DEFAULTS } from './constants.js';
import { cloneParams } from './params.js';
import {
  findRangeAtCursor,
  isSegmentPunctuation,
  sentenceRangesFromText,
  sentencesFromText,
} from './segment-parser.mjs';

export { findRangeAtCursor, isSegmentPunctuation, sentenceRangesFromText, sentencesFromText };

/**
 * @param {import('./state.js').Project} project
 */
export function migrateSentenceParamsForProject(project) {
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
 * @param {import('./state.js').Project} project
 * @param {import('./state.js').SentenceRange[]} prevRanges
 * @param {import('./state.js').SentenceRange[]} newRanges
 */
export function remapSentenceParams(project, prevRanges, newRanges) {
  const oldMap = project.sentenceParamsByKey || {};
  /** @type {Record<string, import('./state.js').ParamSet>} */
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
 * @param {import('./state.js').Project | null} project
 * @param {string} key
 */
export function getSentenceParams(project, key) {
  if (!project) return cloneParams(PARAM_DEFAULTS);
  const base = cloneParams(project.params);
  const custom = project.sentenceParamsByKey?.[key];
  return custom ? cloneParams(custom) : base;
}

/**
 * @param {import('./state.js').Project | null} project
 * @param {string} key
 */
export function hasCustomSentenceParams(project, key) {
  return !!(project?.sentenceParamsByKey?.[key]);
}
