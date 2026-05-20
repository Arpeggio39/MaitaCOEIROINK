import { PARAM_DEFAULTS, SEGMENT_PUNCT_RE } from './constants.js';
import { cloneParams } from './params.js';

/** @param {string} ch */
export function isSegmentPunctuation(ch) {
  return SEGMENT_PUNCT_RE.test(ch);
}

/** @param {string} ch */
function isSegmentWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\u3000';
}

/** @param {string} ch */
function isSegmentNewline(ch) {
  return ch === '\n' || ch === '\r';
}

/**
 * @param {string} text
 * @returns {import('./state.js').SentenceRange[]}
 */
export function sentenceRangesFromText(text) {
  /** @type {import('./state.js').SentenceRange[]} */
  const ranges = [];
  let buf = '';
  let segStart = 0;
  let index = 0;

  /** @param {number} breakEnd */
  function flushSegment(breakEnd) {
    const trimmed = buf.trim();
    if (!trimmed) {
      buf = '';
      segStart = breakEnd;
      return;
    }
    const lead = buf.length - buf.trimStart().length;
    const start = segStart + lead;
    const end = start + trimmed.length;
    ranges.push({
      key: `s${start}`,
      start,
      end,
      text: text.slice(start, end),
      index: index++,
    });
    buf = '';
    segStart = breakEnd;
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isSegmentPunctuation(ch)) {
      buf += ch;
      flushSegment(i + 1);
      continue;
    }
    if (isSegmentWhitespace(ch) || isSegmentNewline(ch)) {
      flushSegment(i + 1);
      while (i + 1 < text.length && (isSegmentWhitespace(text[i + 1]) || isSegmentNewline(text[i + 1]))) {
        i += 1;
      }
      segStart = i + 1;
      continue;
    }
    buf += ch;
  }

  flushSegment(text.length);
  return ranges;
}

/**
 * @param {number} pos
 * @param {import('./state.js').SentenceRange[]} ranges
 */
export function findRangeAtCursor(pos, ranges) {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return r;
  }
  return null;
}

/**
 * @param {string} text
 */
export function sentencesFromText(text) {
  return sentenceRangesFromText(text).map((r) => r.text);
}

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
