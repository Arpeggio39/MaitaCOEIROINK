const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const iconv = require('iconv-lite');

const {
  encodeText,
  resolveExportFilePath,
} = require('../src/main/export-files');

test('WAVか同名txtが存在するとき、両方を避ける連番パスを返す', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maita-export-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  fs.writeFileSync(path.join(directory, 'sample.txt'), 'existing');
  fs.writeFileSync(path.join(directory, 'sample_001.wav'), 'existing');
  const result = resolveExportFilePath(directory, 'sample.wav', {
    unique: true,
    companionText: true,
  });

  assert.equal(result, path.join(directory, 'sample_002.wav'));
});

test('上書きを許可した場合は既定名を返し、ディレクトリ外への名前を受け付けない', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maita-export-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = resolveExportFilePath(directory, '../../outside.wav', { unique: false });
  assert.equal(result, path.join(directory, 'outside.wav'));
});

test('txtをUTF-8とShift_JISで符号化できる', () => {
  const text = '琵音マイタ';
  assert.equal(encodeText(text, 'utf8').toString('utf8'), text);
  assert.equal(iconv.decode(encodeText(text, 'shift_jis'), 'shift_jis'), text);
});
