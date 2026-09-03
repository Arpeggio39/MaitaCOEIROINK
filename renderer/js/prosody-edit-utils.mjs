const PITCH_EPSILON = 0.001;

export const INTONATION_EDITOR_MODE_DEFAULT = 'accent';

/** @param {unknown} value */
export function normalizeIntonationEditorMode(value) {
  return value === 'pitch' ? 'pitch' : INTONATION_EDITOR_MODE_DEFAULT;
}

/**
 * 保存済み区切りの選択を優先し、旧データの手動ピッチ編集も詳細モードとして維持する。
 * @param {{ intonationEditorMode?: unknown, pitchEditedByUser?: boolean } | null | undefined} prosody
 * @param {unknown} preferredMode
 */
export function resolveIntonationEditorMode(prosody, preferredMode = INTONATION_EDITOR_MODE_DEFAULT) {
  if (prosody?.intonationEditorMode === 'accent' || prosody?.intonationEditorMode === 'pitch') {
    return prosody.intonationEditorMode;
  }
  if (prosody?.pitchEditedByUser) return 'pitch';
  return normalizeIntonationEditorMode(preferredMode);
}

/**
 * F0 取得中に行われた編集と、取得前から残っている編集を特定する。
 * @param {number[]} initialPitches
 * @param {number[]} currentPitches
 * @param {number[] | undefined} previousBaseline
 * @param {number} defaultPitch
 */
export function pitchEditMask(
  initialPitches,
  currentPitches,
  previousBaseline,
  defaultPitch,
) {
  return currentPitches.map((pitch, index) => {
    const initial = initialPitches[index];
    if (Number.isFinite(initial) && Math.abs(pitch - initial) > PITCH_EPSILON) return true;

    const baseline = previousBaseline?.[index];
    if (Number.isFinite(baseline)) return Math.abs(initial - baseline) > PITCH_EPSILON;

    return Number.isFinite(initial) && Math.abs(initial - defaultPitch) > PITCH_EPSILON;
  });
}

/**
 * メタデータが一部のモーラ分しかなくても、比較できる箇所の編集を検出する。
 * @param {number[]} pitches
 * @param {number[] | undefined} baseline
 */
export function hasPitchEdits(pitches, baseline) {
  if (!baseline?.length) return false;
  return pitches.some((pitch, index) => {
    const base = baseline[index];
    return Number.isFinite(base) && Math.abs(pitch - base) > PITCH_EPSILON;
  });
}

/**
 * @param {boolean | undefined} pitchEditedByUser
 * @param {number[]} pitches
 * @param {number[] | undefined} baseline
 */
export function hasProsodyPitchEditsState(pitchEditedByUser, pitches, baseline) {
  if (pitchEditedByUser) return true;
  return hasPitchEdits(pitches, baseline);
}

export function shouldReconcileDefaultPitches(
  pitchEditedByUser,
  pitches,
  baseline,
  defaultPitch,
) {
  return (
    !pitchEditedByUser &&
    baseline?.length > 0 &&
    pitches.length > 0 &&
    pitches.every((pitch) => Math.abs(pitch - defaultPitch) <= PITCH_EPSILON)
  );
}

/**
 * @template T
 * @param {Record<string, T>} oldMap
 * @param {{ key: string, text: string }[]} previousRanges
 * @param {{ key: string, text: string }[]} nextRanges
 */
export function remapEntriesByStableText(oldMap, previousRanges, nextRanges) {
  /** @type {Record<string, T>} */
  const next = {};
  const usedOldKeys = new Set();
  for (const range of nextRanges) {
    const sameKeyRange = previousRanges.find((candidate) => candidate.key === range.key);
    if (oldMap[range.key] && sameKeyRange?.text === range.text) {
      next[range.key] = oldMap[range.key];
      usedOldKeys.add(range.key);
      continue;
    }
    const previous = previousRanges.find(
      (candidate) =>
        candidate.text === range.text &&
        !usedOldKeys.has(candidate.key) &&
        oldMap[candidate.key],
    );
    if (previous) {
      next[range.key] = oldMap[previous.key];
      usedOldKeys.add(previous.key);
    }
  }
  return next;
}

/**
 * オーバーレイ再構築後も文章が継続する場合は、既存の韻律オブジェクトを保つ。
 * スライダーはモーラの参照を保持するため、ここで複製すると以後の編集が
 * 再生・保存側のデータに反映されなくなる。
 *
 * @template T
 * @param {Record<string, T & { text: string }>} oldMap
 * @param {{ key: string, text: string }[]} previousRanges
 * @param {{ key: string, text: string }[]} nextRanges
 * @returns {Record<string, T & { text: string }>}
 */
export function remapProsodyEntries(oldMap, previousRanges, nextRanges) {
  /** @type {Record<string, T & { text: string }>} */
  const next = {};
  const usedOldKeys = new Set();

  for (const range of nextRanges) {
    const sameKey = oldMap[range.key];
    if (sameKey?.text === range.text) {
      next[range.key] = sameKey;
      usedOldKeys.add(range.key);
      continue;
    }

    const previous = previousRanges.find(
      (candidate) =>
        candidate.text === range.text &&
        !usedOldKeys.has(candidate.key) &&
        oldMap[candidate.key]?.text === range.text,
    );
    if (previous) {
      next[range.key] = oldMap[previous.key];
      usedOldKeys.add(previous.key);
    }
  }

  return next;
}
