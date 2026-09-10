const { spawn } = require('node:child_process');
const { availableParallelism, cpus, tmpdir } = require('node:os');
const { mkdtemp, rm, copyFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const ffmpeg = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const { EncoderBudget } = require('./encoder-budget');
const cpuBudget = new EncoderBudget(1);
const hardwareBudget = new EncoderBudget(Infinity);
const { gpuCapacity } = require('./encoder-capacity');
const { resolveExportFilePath } = require('./export-files');

const cpuThreads = Math.max(1, Math.min(3, (availableParallelism?.() || cpus().length) - 2));
let encoderPromise;
let sessionLimit = Infinity;
function run(args) {
  return new Promise(resolve => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
    child.stdout.resume(); child.stderr.resume();
    const timer = setTimeout(() => child.kill(), 10000);
    child.once('close', () => clearTimeout(timer));
  });
}
function selectEncoder() {
  // Probe the actual encoder, not just GPU vendor strings or compiled-in support.
  // No QSV, AMF or VideoToolbox path: NVIDIA NVENC, otherwise Intel/AMD CPU encoding.
  return encoderPromise ??= (async () => {
    if (process.platform !== 'darwin' && await run(['-f', 'lavfi', '-i', 'color=s=64x64:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'])) return 'h264_nvenc';
    return 'libx264';
  })();
}

async function createVideoEncoder({ wavPath, width, height, frameCount }) {
  if (typeof wavPath !== 'string' || !path.isAbsolute(wavPath) || !/\.wav$/i.test(wavPath)
      || !Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2
      || width > 2048 || height > 2048 || width % 2 || height % 2
      || !Number.isInteger(frameCount) || frameCount < 1 || frameCount > 18000) throw new Error('動画の出力条件が不正です。');
  const encoder = await selectEncoder();
  const budget = encoder === 'h264_nvenc' ? hardwareBudget : cpuBudget;
  const release = await budget.acquire();
  let dir;
  try { dir = await mkdtemp(path.join(tmpdir(), 'openmaita-encode-')); }
  catch (error) { release(); throw error; }
  const temporary = path.join(dir, 'video.mp4');
  const args = ['-hide_banner', '-loglevel', 'error', '-filter_threads', '1', '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${width}x${height}`, '-framerate', '30', '-i', 'pipe:0', '-i', wavPath,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', encoder,
    ...(encoder === 'libx264' ? ['-threads', String(cpuThreads), '-preset', 'veryfast', '-crf', '20'] : ['-preset', 'p4', '-cq', '20', '-b:v', '0']),
    '-vf', 'vflip', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-threads:a', '1', '-b:a', '192k', '-movflags', '+faststart', temporary];
  const child = spawn(ffmpeg, args, { windowsHide: true });
  let failure = '', count = 0, closed = false, aborted = false;
  child.stdout.resume();
  child.stderr.on('data', data => { failure = (failure + data.toString()).slice(-2000); });
  // Always consume early errors; callers may still be generating the next frame.
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => {
    child.once('error', error => { failure = error.message; });
    child.once('close', code => { closed = true; resolve(code); });
  });
  async function abort() {
    aborted = true;
    if (!closed) child.kill();
    await done;
    try { await rm(dir, { recursive: true, force: true }); } finally { release(); }
  }
  function encodeError() {
    if (encoder === 'h264_nvenc' && /out of memory|OpenEncodeSessionEx|resource|no capable devices|InitializeEncoder/i.test(failure)) {
      budget.reduce();
      sessionLimit = Math.min(sessionLimit, budget.limit);
      return new Error(`NVENC_RESOURCE: ${failure}`);
    }
    return new Error(failure || '動画のエンコードに失敗しました。');
  }
  return {
    encoder,
    async frame(bytes) {
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== width * height * 4 || count >= frameCount || aborted) throw new Error('動画フレームが不正です。');
      if (closed) throw encodeError();
      try { await new Promise((resolve, reject) => child.stdin.write(Buffer.from(bytes), error => error ? reject(error) : resolve())); }
      catch { await done; throw encodeError(); }
      count++;
    },
    async finish() {
      try {
        if (count !== frameCount) throw new Error('動画のフレーム数が一致しません。');
        child.stdin.end();
        const code = await done;
        if (code !== 0 || aborted) throw encodeError();
        // Reserve at publication, preserving existing MP4s even across simultaneous exports.
        for (;;) {
          const output = resolveExportFilePath(path.dirname(wavPath), path.basename(wavPath).replace(/\.wav$/i, '.mp4'));
          try { await copyFile(temporary, output, constants.COPYFILE_EXCL); return output; }
          catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
      } finally { await abort(); }
    },
    abort,
  };
}
async function videoCapacity() {
  if (await selectEncoder() !== 'h264_nvenc') return 1;
  hardwareBudget.limit = Math.min(sessionLimit, await gpuCapacity());
  return hardwareBudget.limit;
}
module.exports = { createVideoEncoder, cpuThreads, videoCapacity, prepareVideoEncoder: selectEncoder };
