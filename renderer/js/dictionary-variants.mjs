/** 読みからモーラ数のおおよその数 */
export function countMorasFromYomi(yomi) {
  const s = normalizeDictionaryYomi(yomi).replace(/\s+/g, '');
  if (!s.length) return 1;
  const SMALL = /^[ァィゥェォャュョぁぃぅぇぉゃゅょゎ]$/u;
  let i = 0;
  let moras = 0;
  while (i < s.length) {
    moras += 1;
    i += 1;
    if (i < s.length && SMALL.test(s[i])) i += 1;
  }
  return Math.max(moras, 1);
}

/** COEIROINK/OpenJTalk の辞書へ渡せる全角カタカナへ読みを正規化する */
export function normalizeDictionaryYomi(yomi) {
  return String(yomi ?? '')
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/** 全角英数字・記号を半角へ */
export function toHalfWidthAscii(str) {
  return str
    .replace(/\u3000/g, ' ')
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 半角英数字・記号を全角へ */
export function toFullWidthAscii(str) {
  return str
    .replace(/ /g, '\u3000')
    .replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0));
}

/**
 * 辞書の単語がヒットする表記ゆれ（全角半角・大文字小文字）を列挙する
 * @param {string} word
 */
export function dictionaryWordVariants(word) {
  const raw = String(word ?? '').trim();
  if (!raw) return [];

  const variants = new Set();
  const seeds = new Set([raw, raw.normalize('NFKC')]);

  for (const seed of seeds) {
    const half = toHalfWidthAscii(seed);
    const full = toFullWidthAscii(half);
    const forms = new Set([seed, half, full]);

    for (const form of forms) {
      variants.add(form);
      if (/[A-Za-z]/.test(form)) {
        const lower = form.toLowerCase();
        const upper = form.toUpperCase();
        variants.add(lower);
        variants.add(upper);
        variants.add(toFullWidthAscii(lower));
        variants.add(toFullWidthAscii(upper));
      }
    }
  }

  return [...variants].filter((v) => v.length > 0);
}

/**
 * @param {{ word: string, yomi: string, accent: number }[]} rows
 */
export function buildDictionaryPayload(rows) {
  /** @type {Map<string, { word: string, yomi: string, accent: number, numMoras: number }>} */
  const byWord = new Map();

  for (const e of rows) {
    const yomi = normalizeDictionaryYomi(e.yomi);
    const numMoras = countMorasFromYomi(yomi);
    const rawAccent = Number(e.accent);
    const accent = Number.isFinite(rawAccent)
      ? Math.max(0, Math.min(numMoras, Math.floor(rawAccent)))
      : 0;
    for (const variant of dictionaryWordVariants(e.word)) {
      if (!byWord.has(variant)) {
        byWord.set(variant, { word: variant, yomi, accent, numMoras });
      }
    }
  }

  return { dictionaryWords: [...byWord.values()] };
}
