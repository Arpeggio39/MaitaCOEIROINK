const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { bumpVersion } = require('./bump-version.cjs');

const root = path.join(__dirname, '..');

function readVersion() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

function releaseExists(tag) {
  try {
    execSync(`gh release view ${tag}`, { stdio: 'ignore', env: process.env });
    return true;
  } catch {
    return false;
  }
}

function artifactExists(tag, artifact) {
  try {
    const out = execSync(`gh release view ${tag} --json assets --jq ".assets[].name"`, {
      encoding: 'utf8',
      env: process.env,
    });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .includes(artifact);
  } catch {
    return false;
  }
}

function writeOutput(keyValues) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    for (const [key, value] of Object.entries(keyValues)) {
      process.stdout.write(`${key}=${value}\n`);
    }
    return;
  }
  for (const [key, value] of Object.entries(keyValues)) {
    fs.appendFileSync(file, `${key}=${value}\n`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const artifactIndex = args.indexOf('--artifact');
  const artifact = artifactIndex >= 0 ? args[artifactIndex + 1] : null;

  let version = readVersion();
  let bumped = false;
  let skip = false;

  if (force) {
    skip = false;
  } else if (artifact) {
    const tag = `v${version}`;
    if (releaseExists(tag) && artifactExists(tag, artifact)) {
      version = bumpVersion('minor', root);
      bumped = true;
    }
  } else if (releaseExists(`v${version}`)) {
    version = bumpVersion('minor', root);
    bumped = true;
  }

  writeOutput({
    version,
    tag: `v${version}`,
    bumped: String(bumped),
    skip: String(skip),
    ...(artifact ? { artifact: `bionmaita-${version}.zip` } : {}),
  });
}

main();
