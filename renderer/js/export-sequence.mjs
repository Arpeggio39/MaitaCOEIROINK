/**
 * 区切りごとに「合成などの準備 -> 保存」を完了してから次へ進む。
 * 合成失敗は後続を続けられるが、保存失敗や接続断などは呼び出し側の判定で停止できる。
 *
 * @template TRange
 * @template TArtifact
 * @param {TRange[]} ranges
 * @param {{
 *   prepare: (range: TRange, index: number) => Promise<TArtifact>,
 *   save: (artifact: TArtifact, range: TRange, index: number) => Promise<void>,
 *   onProgress?: (progress: {
 *     phase: 'preparing' | 'saved' | 'failed',
 *     current: number,
 *     total: number,
 *     savedCount: number,
 *     range: TRange,
 *     error?: unknown,
 *     stage?: 'prepare' | 'save',
 *   }) => void,
 *   shouldStopOnError?: (error: unknown, stage: 'prepare' | 'save') => boolean,
 * }} operations
 */
export async function exportRangesSequentially(ranges, operations) {
  const failures = [];
  let savedCount = 0;
  let skippedCount = 0;

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const current = index + 1;
    operations.onProgress?.({
      phase: 'preparing',
      current,
      total: ranges.length,
      savedCount,
      range,
    });

    let artifact;
    try {
      artifact = await operations.prepare(range, index);
    } catch (error) {
      failures.push({ range, index, stage: 'prepare', error });
      operations.onProgress?.({
        phase: 'failed',
        current,
        total: ranges.length,
        savedCount,
        range,
        error,
        stage: 'prepare',
      });
      if (operations.shouldStopOnError?.(error, 'prepare')) {
        skippedCount = ranges.length - current;
        break;
      }
      continue;
    }

    try {
      await operations.save(artifact, range, index);
      savedCount += 1;
      operations.onProgress?.({
        phase: 'saved',
        current,
        total: ranges.length,
        savedCount,
        range,
      });
    } catch (error) {
      failures.push({ range, index, stage: 'save', error });
      operations.onProgress?.({
        phase: 'failed',
        current,
        total: ranges.length,
        savedCount,
        range,
        error,
        stage: 'save',
      });
      skippedCount = ranges.length - current;
      break;
    }
  }

  return { savedCount, failures, skippedCount };
}
