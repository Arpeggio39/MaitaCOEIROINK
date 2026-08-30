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
const { VOICE_PACK_VERSION, voicePackArtifact } = require('../scripts/voice-pack-version.cjs');

test('OpenMaita は package.json でバージョン管理する', () => {
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.match(electronWorkflow, /resolve-release-version\.cjs/);
  assert.equal(fs.existsSync(path.join(root, 'bionmaita/version')), false);
});

test('音声パックは 1.0.0 固定で配布する', () => {
  assert.equal(VOICE_PACK_VERSION, '1.0.0');
  assert.equal(voicePackArtifact(), 'bionmaita-1.0.0.zip');
  assert.match(electronWorkflow, /bionmaita-1\.0\.0\.zip/);
  assert.match(voicePackWorkflow, /bionmaita-1\.0\.0\.zip/);
  assert.match(fs.readFileSync(path.join(root, 'scripts/build-voice-pack.cjs'), 'utf8'), /voice-pack-version\.cjs/);
});

test('Release は原則 0.1 刻みで minor bump する', () => {
  assert.match(electronWorkflow, /resolve-release-version\.cjs/);
  assert.match(voicePackWorkflow, /default: minor/);
  assert.match(voicePackWorkflow, /bump-version\.cjs/);
  const bumpSource = fs.readFileSync(path.join(root, 'scripts/bump-version.cjs'), 'utf8');
  assert.match(bumpSource, /minor \+ 1/);
});

test('音声パックだけの変更ではアプリReleaseを起動しない', () => {
  assert.match(electronWorkflow, /paths-ignore:[\s\S]*'bionmaita\/\*\*'/);
});

test('音声パックは OpenMaita と同じ v* Release にアップロードする', () => {
  assert.match(electronWorkflow, /--title \"OpenMaita \$version\" --verify-tag --latest/);
  assert.match(electronWorkflow, /gh release edit \$tag --latest/);
  assert.match(electronWorkflow, /build-voice-pack\.cjs/);
  assert.match(electronWorkflow, /gh release upload \$tag \$artifact --clobber/);
  assert.match(voicePackWorkflow, /--title \"OpenMaita \$version\"/);
  assert.match(voicePackWorkflow, /--latest=false/);
  assert.match(voicePackWorkflow, /gh release upload \"\$tag\"/);
  assert.match(voicePackWorkflow, /build-voice-pack\.cjs/);
  assert.doesNotMatch(voicePackWorkflow, /bionmaita-v/);
  assert.match(voicePackWorkflow, /bionmaita\/ changed — rebuilding voice pack/);
});

test('アプリ Release では exe と音声パックを同時に公開する', () => {
  assert.match(electronWorkflow, /electron-builder --win --x64 --publish always/);
  assert.match(electronWorkflow, /lfs: true/);
  assert.match(electronWorkflow, /git lfs pull/);
});

test('起動時の更新確認はメインウィンドウ表示後に行う', () => {
  assert.match(updaterSource, /function checkForUpdatesOnStartup/);
  assert.match(indexSource, /ready-to-show[\s\S]*checkForUpdatesOnStartup/);
  assert.doesNotMatch(updaterSource, /checkOnStartup/);
});

test('起動時の更新は確認なしで自動ダウンロード・インストールする', () => {
  assert.match(updaterSource, /startupCheckPending/);
  assert.match(updaterSource, /autoUpdater\.autoDownload = true/);
  assert.match(updaterSource, /startupCheckPending[\s\S]*quitAndInstall/);
});

test('起動時確認と手動確認が重なった場合は手動フローへ切り替える', () => {
  assert.match(updaterSource, /if \(startupCheckPending\) resetStartupUpdateFlow\(\);[\s\S]*manualCheckPending = true/);
  assert.match(updaterSource, /update-available[\s\S]*if \(!manualCheckPending\) return;[\s\S]*if \(updatePromptPending\) return/);
});
