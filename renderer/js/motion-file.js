import { initMotionTiming } from './motion-timing.js';
import { compute } from './compute-pool.js';
let selected = null;
let offsetSeconds = 0;
let generation = 0;
export function selectedMotion() {
  return selected ? { motion: selected, offsetSeconds, loop: document.getElementById('motionLoop').checked } : null;
}
export function initMotionFile() {
  initMotionTiming(() => selected, () => offsetSeconds, value => {
    offsetSeconds = value;
    document.getElementById('btnMotionTiming').textContent = `タイミングを合わせる（${value >= 0 ? '+' : ''}${value.toFixed(2)}秒）`;
  });
  const input = document.getElementById('motionFile');
  const info = document.getElementById('motionFileInfo');
  const clear = document.getElementById('btnMotionClear');
  const video = document.getElementById('exportIncludeVideo');
  video.addEventListener('change', () => { document.getElementById('motionOptions').hidden = !video.checked; });
  input.addEventListener('change', async () => {
    const current = ++generation;
    const file = input.files[0];
    if (!file) return;
    const button = document.getElementById('btnStartExport');
    button.disabled = true;
    selected = null;
    document.getElementById('btnMotionTiming').disabled = true;
    info.textContent = 'モーションを読み込んでいます…';
    try {
      if (!/\.motion3\.json$/i.test(file.name)) throw new Error('.motion3.json を選んでください。');
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB以内のファイルを選んでください。');
      const parsed = await compute('motion', await file.text());
      if (current !== generation) return;
      selected = parsed; offsetSeconds = 0;
      document.getElementById('btnMotionTiming').disabled = false;
      document.getElementById('btnMotionTiming').textContent = 'タイミングを合わせる';
      info.textContent = `${file.name} · ${parsed.duration.toFixed(1)}秒 — 口の開閉だけ音声に合わせます。`;
      clear.hidden = false;
    } catch (error) {
      if (current !== generation) return;
      input.value = '';
      info.textContent = `${error.message} モーションは未選択です。`;
      clear.hidden = true;
    } finally { if (current === generation) button.disabled = false; }
  });
  clear.addEventListener('click', () => {
    ++generation; selected = null; offsetSeconds = 0;
    document.getElementById('btnMotionTiming').disabled = true; input.value = ''; clear.hidden = true;
    info.textContent = '未選択の場合は自動モーションを使います。';
    document.getElementById('btnStartExport').disabled = false;
  });
}
