import { compute } from './compute-pool.js';
import { buildPlaybackUtterance, stopPlayback } from './audio.js';
import { bridge } from './bridge.js';

export function initCharacterVideo() {
  let controller;
  // The local video frame owns rendering; synthesis retains the editor's voice/prosody settings.
  window.maitaVideoHost = {
    async synthesize(scope) {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      stopPlayback();
      try {
        return await buildPlaybackUtterance(48000, current.signal, { all: scope === 'all' });
      } finally {
        if (controller === current) controller = null;
      }
    },
    cancel() { controller?.abort(); },
    compute,
    onProgress(value, phase) {
      document.getElementById('exportProgress').textContent = phase === 'analyze' ? '全フレームの描画範囲を確認しています…' : '動画を出力しています…';
      const meter = document.getElementById('exportMeter');
      meter.max = 1;
      meter.value = value;
    },
    begin: options => bridge.beginVideo(options),
    frame: (id, bytes) => bridge.writeVideoFrame(id, bytes),
    finish: id => bridge.finishVideo(id),
    abort: id => bridge.abortVideo(id),
    save: (buffer) => bridge.saveCharacterVideo(buffer),
  };

}

const frames = new Set();
export async function exportNarrationVideo(buffer, wavPath, motion = null) {
  const frame = document.createElement('iframe');
  if (!frames.has(frame)) {
    frames.add(frame);
    frame.className = 'character-video-renderer';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.title = '動画の生成処理';
    document.body.append(frame);
  }
  stopPlayback();
  try {
    if (!frame.getAttribute('src')) {
      await new Promise((resolve, reject) => {
        frame.addEventListener('load', resolve, { once: true });
        frame.addEventListener('error', () => reject(new Error('動画画面を読み込めませんでした。')), { once: true });
        frame.src = 'character-video.html';
      });
    }
    await frame.contentWindow.maitaVideo.ready;
    frame.contentWindow.maitaVideo.resume();
    return await frame.contentWindow.maitaVideo.renderNarration(buffer, wavPath, motion);
  } finally {
    frame.contentWindow?.maitaVideo?.suspend();
    // Release GPU textures after each export; capacity is recalculated for the next batch.
    frames.delete(frame);
    frame.remove();
  }
}
