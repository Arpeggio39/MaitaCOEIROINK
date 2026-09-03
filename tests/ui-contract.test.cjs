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
  assert.match(html, /id="btnExportCombined"/);
  assert.match(dom, /btnExportSelected:/);
  assert.match(dom, /btnExportAll:/);
  assert.match(dom, /btnExportCombined:/);
});

test('全文を1つのWAVへ結合し、区切り別は合成直後に順次保存する', () => {
  assert.match(audio, /exportCombinedAudio/);
  assert.match(audio, /concatWavBuffers\(parts\)/);
  assert.match(audio, /exportRangesSequentially/);
  assert.doesNotMatch(audio, /const artifacts = \[\]/);
  assert.match(html, /id="exportProgress"[\s\S]*aria-live="polite"/);
});

test('イントネーションはかんたんと詳細を切り替えられる', () => {
  assert.match(html, /id="intonationEditorModeGroup"/);
  assert.match(html, /name="intonationEditorMode" value="accent"/);
  assert.match(html, /name="intonationEditorMode" value="pitch"/);
  assert.match(dom, /intonationEditorModeGroup:/);
  assert.match(rendererScripts, /markProsodyAccentEdited/);
  assert.match(rendererScripts, /intonationEditorMode/);
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

test('辞書更新前の韻律取得を無効化して古い読みを復活させない', () => {
  assert.match(rendererScripts, /辞書更新前に始まった韻律取得/);
  assert.match(rendererScripts, /prosodyFetchGeneration\.set/);
  assert.match(rendererScripts, /prosodyFetchInFlight\.delete/);
});
