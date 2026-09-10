export function createLimiter(limit) {
  let active = 0;
  const waiting = [];
  const drain = () => {
    while (active < limit && waiting.length) {
      const { task, resolve, reject } = waiting.shift();
      active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
    }
  };
  return task => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); drain(); });
}

// Bounded look-ahead. Only preparation overlaps; publication stays in text order.
// All outstanding work settles before returning, including after a failure.
export async function exportRangesPipelined(ranges, operations, concurrency = 2) {
  const pending = new Map();
  let next = 0, savedCount = 0;
  const failures = [];
  const fill = () => {
    while (next < ranges.length && pending.size < concurrency) {
      const index = next++;
      pending.set(index, Promise.resolve().then(() => operations.prepare(ranges[index], index))
        .then(value => ({ value }), error => ({ error })));
    }
  };
  fill();
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index], current = index + 1, total = ranges.length;
    operations.onProgress?.({ phase: 'preparing', current, total, savedCount, range });
    const result = await pending.get(index);
    pending.delete(index);
    let stage = 'prepare';
    try {
      if ('error' in result) throw result.error;
      fill(); // Prepare the next item while this one is being encoded and saved.
      stage = 'save';
      await operations.save(result.value, range, index);
      savedCount++;
      operations.onProgress?.({ phase: 'saved', current, total, savedCount, range });
    } catch (error) {
      failures.push({ range, index, stage, error });
      if (stage === 'save' || operations.shouldStopOnError?.(error, stage)) {
        await Promise.all(pending.values());
        return { failures, savedCount, skippedCount: total - current };
      }
    }
    fill();
  }
  return { failures, savedCount, skippedCount: 0 };
}

export async function exportRangesConcurrent(ranges, operations, concurrency) {
  if (concurrency <= 1) return exportRangesPipelined(ranges, operations);
  const prepare = createLimiter(2);
  let next = 0, savedCount = 0, stopped = false;
  const failures = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, async () => {
    while (!stopped && next < ranges.length) {
      const index = next++, range = ranges[index];
      let stage = 'prepare';
      try {
        const artifact = await prepare(async () => {
          if (stopped) return null;
          return operations.prepare(range, index);
        });
        if (artifact === null) return;
        stage = 'save';
        await operations.save(artifact, range, index);
        savedCount++;
        operations.onProgress?.({ phase: 'saved', current: index + 1, total: ranges.length, savedCount, range });
      } catch (error) {
        failures.push({ index, range, stage, error });
        if (stage === 'save' || operations.shouldStopOnError?.(error, stage)) stopped = true;
      }
    }
  }));
  failures.sort((a, b) => a.index - b.index);
  return { savedCount, failures, skippedCount: ranges.length - savedCount - failures.length };
}
