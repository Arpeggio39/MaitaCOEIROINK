const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { bumpVersion } = require('../scripts/bump-version.cjs');

function withTempPackage(version, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaita-version-'));
  const pkgPath = path.join(dir, 'package.json');
  const lockPath = path.join(dir, 'package-lock.json');
  fs.writeFileSync(
    pkgPath,
    `${JSON.stringify({ name: 'tmp', version }, null, 2)}\n`,
  );
  fs.writeFileSync(
    lockPath,
    `${JSON.stringify({ name: 'tmp', version, lockfileVersion: 3, packages: { '': { version } } }, null, 2)}\n`,
  );
  try {
    fn(dir, pkgPath, lockPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('minor bump は 0.1 刻みで上げる', () => {
  withTempPackage('1.0.0', (dir, pkgPath, lockPath) => {
    assert.equal(bumpVersion('minor', dir), '1.1.0');
    assert.equal(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version, '1.1.0');
    assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).version, '1.1.0');
  });
});

test('minor bump はパッチを 0 に戻す', () => {
  withTempPackage('1.2.3', (dir) => {
    assert.equal(bumpVersion('minor', dir), '1.3.0');
  });
});

test('patch bump は末尾を 1 だけ上げる', () => {
  withTempPackage('1.2.3', (dir) => {
    assert.equal(bumpVersion('patch', dir), '1.2.4');
  });
});
