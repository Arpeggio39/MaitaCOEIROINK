import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

globalThis.document = { getElementById: () => ({ querySelector: () => null }), querySelectorAll: () => [] };
const { fetchWithTimeout } = await import('../renderer/js/utils.js');

async function stalledBody(t) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.flushHeaders();
    response.write('partial');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('ヘッダー取得後に本文が止まってもタイムアウトする', { timeout: 3000 }, async t => {
  const url = await stalledBody(t);
  const response = await fetchWithTimeout(url, {}, 300);
  await assert.rejects(response.text(), { name: 'TimeoutError' });
});

test('本文の受信中も呼び出し元から中止できる', async t => {
  const url = await stalledBody(t);
  const controller = new AbortController();
  const response = await fetchWithTimeout(url, { signal: controller.signal }, 5000);
  controller.abort();
  await assert.rejects(response.text(), { name: 'AbortError' });
});

test('中止済みの signal の理由を維持する', async () => {
  const reason = new Error('caller cancelled');
  await assert.rejects(fetchWithTimeout('http://127.0.0.1:1', { signal: AbortSignal.abort(reason) }), error => error === reason);
});
