const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
execFileSync(process.env.CLANG || 'clang', [
  '--target=wasm32', '-O3', '-msimd128', '-nostdlib',
  '-Wl,--no-entry', '-Wl,--export=__heap_base', '-Wl,--export-memory',
  '-Wl,--initial-memory=131072', '-Wl,--max-memory=1073741824', '-Wl,--strip-all',
  path.join(root, 'native/lip-energy.c'), '-o', path.join(root, 'renderer/wasm/lip-energy.wasm'),
], { stdio: 'inherit' });
