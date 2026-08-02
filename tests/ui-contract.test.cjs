const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'renderer/js/dom.js'), 'utf8');

test('手動書き出しはヘッダーから選択・全件を選べる', () => {
  assert.match(html, /id="btnExport"/);
  assert.match(html, /id="btnExportSelected"/);
  assert.match(html, /id="btnExportAll"/);
  assert.match(dom, /btnExportSelected:/);
  assert.match(dom, /btnExportAll:/);
});

test('右サイドバーの文章書き出しボタンは存在しない', () => {
  assert.doesNotMatch(html, /btnSegmentExport/);
  assert.doesNotMatch(dom, /btnSegmentExport/);
});
