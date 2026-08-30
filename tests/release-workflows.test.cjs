const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electronWorkflow = fs.readFileSync(
  path.join(root, '.github/workflows/electron-release.yml'),
  'utf8',
);
const voicePackWorkflow = fs.readFileSync(
  path.join(root, '.github/workflows/voice-pack-release.yml'),
  'utf8',
);
const updaterSource = fs.readFileSync(
  path.join(root, 'src/main/updater.js'),
  'utf8',
);
const indexSource = fs.readFileSync(
  path.join(root, 'src/main/index.js'),
  'utf8',
);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('アプリと音声パックは package.json で統一バージョン管理する', () => {
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.match(electronWorkflow, /Read version from package\.json/);
  assert.match(voicePackWorkflow, /require\('\.\/package\.json'\)\.version/);
  assert.equal(fs.existsSync(path.join(root, 'bionmaita/version')), false);
});

test('音声パックだけの変更ではアプリReleaseを起動しない', () => {
  assert.match(electronWorkflow, /paths-ignore:[\s\S]*'bionmaita\/\*\*'/);
});

test('音声パックは OpenMaita と同じ v* Release にアップロードする', () => {
  assert.match(electronWorkflow, /--title \"OpenMaita \$version\" --verify-tag --latest/);
  assert.match(electronWorkflow, /gh release edit \$tag --latest/);
  assert.match(voicePackWorkflow, /--title \"OpenMaita \$version\"/);
  assert.match(voicePackWorkflow, /--latest=false/);
  assert.match(voicePackWorkflow, /gh release upload \"\$tag\"/);
  assert.doesNotMatch(voicePackWorkflow, /bionmaita-v/);
});

test('起動時の更新確認はメインウィンドウ表示後に行う', () => {
  assert.match(updaterSource, /function checkForUpdatesOnStartup/);
  assert.match(indexSource, /ready-to-show[\s\S]*checkForUpdatesOnStartup/);
  assert.doesNotMatch(updaterSource, /checkOnStartup/);
});
