import { clampMotionOffset, wavDuration } from './motion-timing.mjs';
import { prepareTimingNarration } from './audio.js';
export function initMotionTiming(getMotion, getOffset, setOffset) {
  const $ = id => document.getElementById(id);
  const dialog = $('motionTimingDialog'), block = $('motionTimingBlock'), canvas = $('motionTimeline');
  let controller, duration = 0, motionDuration = 0, draft = 0, url, audio, drag;
  const stop = () => { controller?.abort(); if (audio) { audio.pause(); audio.ontimeupdate = audio.onended = null; } audio = null; if (url) URL.revokeObjectURL(url); url = null; };
  const close = () => { stop(); dialog.close(); $('btnMotionTiming').focus(); };
  const draw = () => {
    const span = duration + 2 * motionDuration;
    const percent = value => `${100 * value / span}%`;
    $('motionZero').style.left = percent(motionDuration);
    $('motionPlayhead').style.left = percent(motionDuration + (audio?.currentTime || 0));
    $('narrationTimingBlock').style.left = percent(motionDuration);
    $('narrationTimingBlock').style.width = percent(duration);
    $('narrationTimingBlock').textContent = `ナレーション ${duration.toFixed(2)}秒`;
    block.style.left = percent(motionDuration + draft);
    block.style.width = percent(motionDuration);
    block.textContent = `モーション ${motionDuration.toFixed(2)}秒`;
    block.setAttribute('aria-valuemin', String(-motionDuration));
    block.setAttribute('aria-valuemax', String(duration));
    block.setAttribute('aria-valuenow', String(draft));
    block.setAttribute('aria-valuetext', `${draft.toFixed(2)}秒`);
    $('motionOffset').value = draft.toFixed(2);
    $('motionOffset').min = -motionDuration; $('motionOffset').max = duration;
    $('motionTimingReadout').textContent = draft >= 0 ? `音声の開始から${draft.toFixed(2)}秒後にモーション開始` : `モーションの${(-draft).toFixed(2)}秒目から音声開始`;
  };
  const change = value => { draft = clampMotionOffset(value, motionDuration, duration); draw(); };
  $('btnMotionTiming').addEventListener('click', async () => {
    const selected = getMotion(); if (!selected) return;
    stop(); const current = new AbortController(); controller = current;
    motionDuration = selected.duration; draft = getOffset();
    $('motionTimingControls').hidden = true;
    $('btnMotionTimingApply').disabled = true;
    $('motionTimingStatus').textContent = '長さを確認するためにナレーションを生成しています…';
    dialog.showModal();
    try {
      const all = document.getElementById('btnExportSelected').getAttribute('aria-pressed') !== 'true';
      const buffer = await prepareTimingNarration(current.signal, all);
      current.signal.throwIfAborted();
      duration = wavDuration(buffer);
      change(draft);
      url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
      audio = new Audio(url);
      audio.ontimeupdate = () => { $('motionPlayhead').style.left = `${100 * (motionDuration + audio.currentTime) / (duration + 2 * motionDuration)}%`; };
      audio.onended = () => { $('btnMotionListen').textContent = '音声を聴く'; };
      $('btnMotionListen').textContent = '音声を聴く';
      $('motionTimingStatus').textContent = 'モーションの長方形を左右にドラッグしてください。音声の開始は0秒です。';
      $('motionTimingControls').hidden = false; $('btnMotionTimingApply').disabled = false;
    } catch (error) { if (!current.signal.aborted) $('motionTimingStatus').textContent = error.message; }
  });
  block.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, offset: draft, width: canvas.getBoundingClientRect().width };
    block.setPointerCapture(event.pointerId); event.preventDefault(); block.focus();
  });
  block.addEventListener('pointermove', event => { if (drag) change(drag.offset + (event.clientX - drag.x) / drag.width * (duration + 2 * motionDuration)); });
  block.addEventListener('pointerup', () => { drag = null; });
  block.addEventListener('lostpointercapture', () => { drag = null; });
  block.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); change(draft + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : .1)); }
    if (event.key === 'Home') { event.preventDefault(); change(0); }
  });
  $('motionOffset').addEventListener('change', event => change(event.target.value));
  $('btnMotionTimingReset').addEventListener('click', () => change(0));
  $('btnMotionListen').addEventListener('click', async () => {
    if (!audio) return;
    if (audio.paused) { try { await audio.play(); $('btnMotionListen').textContent = '一時停止'; } catch (error) { $('motionTimingStatus').textContent = error.message; } }
    else { audio.pause(); $('btnMotionListen').textContent = '音声を聴く'; }
  });
  $('btnMotionTimingApply').addEventListener('click', () => { setOffset(draft); close(); });
  $('btnMotionTimingCancel').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
}
