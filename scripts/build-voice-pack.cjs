const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { voicePackArtifact, voicePackFolder } = require('./voice-pack-version.cjs');

const root = path.join(__dirname, '..');
const artifact = voicePackArtifact();
const stagingRoot = path.join(root, 'dist-voice-pack');
const stagingDir = path.join(stagingRoot, voicePackFolder());
const artifactPath = path.join(root, artifact);
const sourceDir = path.join(root, 'bionmaita');

if (!fs.existsSync(sourceDir)) {
  console.error(`Voice pack source not found: ${sourceDir}`);
  process.exit(1);
}

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });
fs.cpSync(sourceDir, stagingDir, { recursive: true });
if (fs.existsSync(artifactPath)) {
  fs.unlinkSync(artifactPath);
}

const folderName = voicePackFolder();

if (process.platform === 'win32') {
  const psStaging = stagingDir.replace(/'/g, "''");
  const psArtifact = artifactPath.replace(/'/g, "''");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${psStaging}' -DestinationPath '${psArtifact}' -Force"`,
    { stdio: 'inherit', cwd: root },
  );
} else {
  execSync(`zip -r "${artifactPath}" "${folderName}"`, {
    stdio: 'inherit',
    cwd: stagingRoot,
  });
}

fs.rmSync(stagingRoot, { recursive: true, force: true });
console.log(artifactPath);
