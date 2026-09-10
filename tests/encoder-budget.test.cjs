const test = require('node:test');
const assert = require('node:assert/strict');
const { EncoderBudget } = require('../src/main/encoder-budget');
const { capacityFromMemory } = require('../src/main/encoder-capacity');
test('空きVRAMとRAMに応じてGPU枠が増減し、固定4件制限はない', () => {
  assert.equal(capacityFromMemory(8192, 32 * 1024 ** 3), 12);
  assert.equal(capacityFromMemory(512, 32 * 1024 ** 3), 1);
  assert.equal(capacityFromMemory(NaN, 32 * 1024 ** 3), 1);
  assert.equal(capacityFromMemory(8192, 1024 ** 3), 3);
});
test('GPUセッション不足では上限を減らし、解放まで新規処理を待つ', async () => {
  const budget = new EncoderBudget(3);
  const a = await budget.acquire(), b = await budget.acquire(), c = await budget.acquire();
  budget.reduce(); assert.equal(budget.limit, 2);
  let acquired = false;
  const queued = budget.acquire().then(release => { acquired = true; return release; });
  c(); await Promise.resolve(); assert.equal(acquired, false);
  b(); const d = await queued; assert.equal(acquired, true);
  a(); a(); d(); assert.equal(budget.active, 0);
});
