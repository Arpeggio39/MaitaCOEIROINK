const PITCH_EPSILON = 0.001;

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
