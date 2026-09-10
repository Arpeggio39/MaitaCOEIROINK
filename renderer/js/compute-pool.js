import { createLimiter } from './parallel.mjs';
const schedule = createLimiter(1);
const idle = [];
const workers = new Set();
export function compute(kind, data, transfer = []) {
  return schedule(() => new Promise((resolve, reject) => {
    const worker = idle.pop() || new Worker(new URL('./compute-worker.js', import.meta.url), { type: 'module' });
    workers.add(worker);
    worker.onmessage = ({ data }) => {
      worker.onmessage = worker.onerror = null;
      idle.push(worker);
      if (data.error) reject(new Error(data.error)); else resolve(data.value);
    };
    worker.onerror = event => {
      workers.delete(worker); worker.terminate(); reject(new Error(event.message || '音声処理に失敗しました。'));
    };
    worker.postMessage({ kind, data }, transfer);
  }));
}
window.addEventListener('beforeunload', () => { for (const worker of workers) worker.terminate(); });
