const SEGMENT_PUNCT_RE = /[。、．.,!?！？…：:；;「」『』【】()（）\[\]{}'"‘’“”〜～]/u;

export function isSegmentPunctuation(ch) {
  return SEGMENT_PUNCT_RE.test(ch);
}

function isSegmentWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\u3000';
}

function isSegmentNewline(ch) {
  return ch === '\n' || ch === '\r';
}

export function sentenceRangesFromText(text) {
  const ranges = [];
  let buf = '';
  let segStart = 0;
  let index = 0;

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
    ranges.push({ key: `s${start}`, start, end, text: text.slice(start, end), index: index++ });
    buf = '';
    segStart = breakEnd;
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (isSegmentPunctuation(ch)) {
      buf += ch;
      flushSegment(i + 1);
      continue;
    }
    if (isSegmentWhitespace(ch) || isSegmentNewline(ch)) {
      flushSegment(i + 1);
      while (
        i + 1 < text.length &&
        (isSegmentWhitespace(text[i + 1]) || isSegmentNewline(text[i + 1]))
      ) {
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

export function findRangeAtCursor(pos, ranges) {
  return ranges.find((range) => pos >= range.start && pos < range.end) || null;
}

/**
 * 区切りが選択されていればその区切りだけ、未選択なら全文を再生する。
 * @param {{ key: string }[]} ranges
 * @param {string | null} activeKey
 */
export function playbackRangesForSelection(ranges, activeKey) {
  if (activeKey == null) return ranges;
  const selected = ranges.find((range) => range.key === activeKey);
  return selected ? [selected] : ranges;
}

export function sentencesFromText(text) {
  return sentenceRangesFromText(text).map((range) => range.text);
}
