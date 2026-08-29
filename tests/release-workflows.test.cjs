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
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const voicePackVersion = fs.readFileSync(path.join(root, 'bionmaita/version'), 'utf8').trim();

test('アプリと音声パックは別々のファイルでバージョン管理する', () => {
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.match(voicePackVersion, /^\d+\.\d+\.\d+$/);
  assert.match(electronWorkflow, /Read version from package\.json/);
  assert.match(voicePackWorkflow, /< bionmaita\/version/);
});

test('音声パックだけの変更ではアプリReleaseを起動しない', () => {
  assert.match(electronWorkflow, /paths-ignore:[\s\S]*'bionmaita\/\*\*'/);
});

test('Release名とLatest指定でアプリと音声パックを区別する', () => {
  assert.match(electronWorkflow, /--title \"OpenMaita \$version\" --verify-tag --latest/);
  assert.match(voicePackWorkflow, /--title \"bionmaita \$version\"/);
  assert.match(voicePackWorkflow, /--latest=false/);
});
