const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {'minor' | 'patch' | 'major'} kind
 * @param {string} [rootDir]
 * @returns {string}
 */
function bumpVersion(kind, rootDir = path.join(__dirname, '..')) {
  const pkgPath = path.join(rootDir, 'package.json');
  const lockPath = path.join(rootDir, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const parts = pkg.version.split('.').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Invalid package.json version: ${pkg.version}`);
  }

  const [major, minor, patch] = parts;
  const nextVersion = (() => {
    switch (kind) {
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
      case 'major':
        return `${major + 1}.0.0`;
      default: {
        const _exhaustive = kind;
        throw new Error(`Unknown bump kind: ${_exhaustive}`);
      }
    }
  })();

  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = nextVersion;
  if (lock.packages?.['']) {
    lock.packages[''].version = nextVersion;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  return nextVersion;
}

if (require.main === module) {
  const kind = process.argv[2] || 'minor';
  process.stdout.write(`${bumpVersion(kind)}\n`);
}

module.exports = { bumpVersion };
