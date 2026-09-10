import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, exportRangesPipelined, exportRangesConcurrent } from '../renderer/js/parallel.mjs';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('準備は上限2件、保存と重なっても順番と先読み上限を守る', async () => {
  let active = 0, max = 0, preparingDuringSave = false, saving = false;
  const saved = [];
  const result = await exportRangesPipelined([0, 1, 2, 3, 4], {
    prepare: async value => { active++; max = Math.max(max, active); if (saving) preparingDuringSave = true; await wait(value === 0 ? 15 : 5); active--; return value; },
    save: async value => { saving = true; await wait(10); saved.push(value); saving = false; },
  });
  assert.deepEqual(saved, [0, 1, 2, 3, 4]); assert.equal(max, 2); assert.equal(preparingDuringSave, true); assert.equal(result.savedCount, 5);
});
test('失敗した後も開始済み準備の終了を待ち、後続は保存しない', async () => {
  let active = 0;
  const result = await exportRangesPipelined([0, 1, 2, 3], {
    prepare: async value => { active++; await wait(value === 0 ? 1 : 15); active--; return value; },
    save: () => { throw new Error('disk full'); },
  });
  assert.equal(active, 0); assert.equal(result.savedCount, 0); assert.equal(result.skippedCount, 3); assert.equal(result.failures[0].stage, 'save');
});
test('GPU出力は指定した資源枠まで重なり、音声準備は2件以下', async () => {
  let preparing = 0, prepMax = 0, saving = 0, saveMax = 0;
  const result = await exportRangesConcurrent(Array.from({ length: 10 }, (_, i) => i), {
    prepare: async value => { prepMax = Math.max(prepMax, ++preparing); await wait(2); preparing--; return value; },
    save: async () => { saveMax = Math.max(saveMax, ++saving); await wait(20); saving--; },
  }, 6);
  assert.equal(result.savedCount, 10); assert.equal(prepMax, 2); assert.equal(saveMax, 6);
});
test('リミッターは失敗後も待機処理を実行する', async () => {
  const limit = createLimiter(1);
  const result = await Promise.allSettled([limit(() => { throw new Error('failure'); }), limit(() => 42)]);
  assert.equal(result[1].value, 42);
});
