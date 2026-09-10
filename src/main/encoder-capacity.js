const { execFile } = require('node:child_process');
const { freemem } = require('node:os');
// Reserve a quarter of currently free VRAM and RAM for the engine, desktop and drivers.
// Each lane includes its Live2D textures, decoder buffers and encoder surfaces.
function capacityFromMemory(freeVramMiB, freeRamBytes) {
  if (!Number.isFinite(freeVramMiB) || freeVramMiB <= 0) return 1;
  return Math.max(1, Math.min(Math.floor(freeVramMiB * 0.75 / 512), Math.floor(freeRamBytes * 0.75 / (256 * 1024 ** 2))));
}
async function gpuCapacity() {
  const free = await new Promise(resolve => {
    execFile('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits', '--id=0'], { windowsHide: true, timeout: 5000 }, (error, stdout) => resolve(error ? NaN : Number(stdout.trim())));
  });
  return capacityFromMemory(free, freemem());
}
module.exports = { gpuCapacity, capacityFromMemory };
