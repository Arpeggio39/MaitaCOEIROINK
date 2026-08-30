const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'renderer/js/dom.js'), 'utf8');
const audio = fs.readFileSync(path.join(root, 'renderer/js/audio.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8');
const rendererMain = fs.readFileSync(path.join(root, 'renderer/js/main.js'), 'utf8');
const persist = fs.readFileSync(path.join(root, 'renderer/js/persist.js'), 'utf8');
const dictionaryIpc = fs.readFileSync(path.join(root, 'src/main/ipc/dictionary.js'), 'utf8');
const rendererScripts = fs
  .readdirSync(path.join(root, 'renderer/js'))
  .filter((name) => name.endsWith('.js') || name.endsWith('.mjs'))
  .map((name) => fs.readFileSync(path.join(root, 'renderer/js', name), 'utf8'))
  .join('\n');

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

test('編集や設定の変更で音声を自動書き出ししない', () => {
  assert.doesNotMatch(
    rendererScripts,
    /scheduleKanjishikunExport|runKanjishikunExport|requestKanjishikunExport/,
  );
  assert.doesNotMatch(html, /自動で書き出し/);
});

test('手動書き出しは固定フォルダーとtxt同時保存を適用する', () => {
  assert.match(audio, /exportDirectoryEnabled && appState\.exportDirectory/);
  assert.match(audio, /writeTextFile/);
  assert.match(audio, /writeExportFiles\(filePath, buf, range\.text\)/);
  assert.ok(audio.indexOf('await bridge.writeTextFile') < audio.indexOf('await bridge.writeWavFile'));
  assert.match(html, /WAVと必要に応じて同名のtxt/);
});

test('再生ボタンは選択中の部分を優先することを案内する', () => {
  assert.match(html, /選択中の部分を再生（未選択時は全文）/);
  assert.match(audio, /playbackRangesForSelection\(allRanges, activeSentenceKey\)/);
});

test('合成中の再生を停止でき、プロジェクト移動時にもキャンセルする', () => {
  assert.match(audio, /currentSynthesisController/);
  assert.match(audio, /controller\.signal/);
  assert.doesNotMatch(audio, /btnPlay\.disabled = true/);
});

test('終了時は待機中のプロジェクト保存を同期フラッシュする', () => {
  assert.match(rendererMain, /beforeunload[\s\S]*flushProjectsSync/);
  assert.match(persist, /syncUiBeforeSave\?\.\(\)[\s\S]*saveProjectsSync/);
});

test('二重起動を防ぎ、既存ウィンドウをフォーカスする', () => {
  assert.match(main, /requestSingleInstanceLock/);
  assert.match(main, /second-instance[\s\S]*\.focus\(\)/);
});

test('空のユーザー辞書も有効な保存状態として扱う', () => {
  assert.doesNotMatch(dictionaryIpc, /dictionaryWords\.length > 0/);
});
