import { compute } from './compute-pool.js';
import { mouthAt, formatVideoTime } from './lip-sync.mjs';

import { fitCharacterFrame } from './character-frame.mjs';
import { createSpeechMotion, speechPoseAt, neutralSpeechPose, SECONDARY_PARAMETERS } from './speech-motion.mjs';

const $ = (id) => document.getElementById(id);
const host = window.parent.maitaVideoHost;
let app, model, context, audio, envelope, source;
let running = false, busy = false, suspended = false, cancelled = false;
let exporting = false;
let raf = 0, lastFrame = 0, startedAt = 0, elapsed = 0, sceneTime = 0;
let operation = 0;
let performancePlan;
let resolveReady, rejectReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
ready.catch(() => {});
const idlePlan = createSpeechMotion({ values: new Float32Array(6000), rate: 100, duration: 60 }, 7421);
let currentPose = neutralSpeechPose();

function status(message, error = false) {
  $('videoStatus').textContent = message;
  $('videoStatus').dataset.error = String(error);
}

function updateControls() {
  const unavailable = busy || !model;
  $('videoSynthesize').disabled = unavailable || !host;
  $('videoScope').disabled = busy;
  $('videoPlay').disabled = unavailable || !audio || running;
  $('videoExport').disabled = unavailable || !audio || running;
  $('videoStop').disabled = !running && !busy;
  for (const id of ['videoSensitivity', 'videoIdle', 'videoMotionStrength']) $(id).disabled = busy;
  $('videoSaveAgain').hidden = true;
  $('videoSaveAgain').disabled = busy || running;
}

function updateTime() {
  $('videoTime').textContent = `${formatVideoTime(elapsed)} / ${formatVideoTime(audio?.duration)}`;
  $('videoProgress').value = audio ? Math.min(1, elapsed / audio.duration) : 0;
  if (exporting) window.parent.maitaVideoHost?.onProgress?.($('videoProgress').value);
}

async function audioContext() {
  context ??= new AudioContext({ sampleRate: 48000 });
  await context.resume();
  return context;
}

async function loadAudio(buffer, name) {
  const ctx = await audioContext();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(buffer.slice(0));
  } catch {
    throw new Error('生成した音声を読み込めませんでした。もう一度音声を生成してください。');
  }
  if (decoded.duration <= 0 || decoded.duration > 600) {
    throw new Error('ローカル試作版では10分以内になるよう文章を短くしてください。');
  }
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index).slice());
  const result = await (host?.compute || compute)('speech', { channels, sampleRate: decoded.sampleRate }, channels.map(channel => channel.buffer));
  return { decoded, result: result.envelope, plan: result.plan, name };
}

async function prepareAudio(getBuffer, name) {
  stop();
  const generation = ++operation;
  busy = true;
  updateControls();
  status('音声を準備しています…');
  try {
    const buffer = await getBuffer();
    if (generation !== operation) return;
    const loaded = await loadAudio(buffer, name);
    if (generation !== operation) return;
    audio = loaded.decoded;
    envelope = loaded.result;
    performancePlan = loaded.plan;
    elapsed = 0;
    $('videoAudioName').textContent = `${loaded.name}（${audio.duration.toFixed(1)}秒）`;
    updateTime();
    status('音声を読み込みました。「再生」で口の動きを確認できます。');
    return true;
  } catch (error) {
    if (generation === operation && error.name !== 'AbortError') status(error.message, true);
  } finally {
    if (generation === operation) { busy = false; updateControls(); }
  }
}

function fitVideoToCharacter() {
  model.scale.set(690 / model.internalModel.height);
  model.anchor.set(0.5, 0);
  model.position.set(640, 20);
  model.update(1000 / 60);
  app.renderer.render(app.stage);
  const image = app.renderer.plugins.extract.canvas();
  const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  const frame = fitCharacterFrame(pixels, image.width, image.height);
  model.position.x += frame.offsetX;
  model.position.y += frame.offsetY;
  app.renderer.resize(frame.width, frame.height);
  app.renderer.backgroundAlpha = 1;
  $('videoDimensions').textContent = `${frame.width} × ${frame.height}`;
}

function render(now) {
  if (suspended || !model) return;
  const delta = Math.min(50, lastFrame ? now - lastFrame : 1000 / 30);
  lastFrame = now;
  if (running) elapsed = Math.max(0, Math.min(audio.duration, context.currentTime - startedAt));
  drawFrame(delta);
  raf = requestAnimationFrame(render);
}

function drawFrame(delta) {
  sceneTime += delta / 1000;
  const target = $('videoIdle').checked
    ? speechPoseAt((running || exporting) && performancePlan ? performancePlan : idlePlan, (running || exporting) ? elapsed : sceneTime % 60)
    : neutralSpeechPose();
  const strength = Number($('videoMotionStrength').value);
  const blend = 1 - Math.exp(-delta / 100);
  for (const key of Object.keys(currentPose)) {
    const value = /Eye[LR]Open/.test(key) ? target[key] : target[key] * strength;
    // Eyelids follow the timed blink directly; posture transitions settle smoothly.
    currentPose[key] = /Eye[LR]Open/.test(key) ? value : currentPose[key] + (value - currentPose[key]) * blend;
  }
  model.update(delta);
  app.renderer.render(app.stage);
  updateTime();
}

function releaseSource() {
  if (source) {
    source.onended = null;
    try { source.stop(); } catch { /* already ended */ }
    source.disconnect();
    source = null;
  }
  running = false;
}

function stop() {
  ++operation;
  host?.cancel();
  cancelled = true;
  releaseSource();
  if (!exporting) busy = false;
  elapsed = 0;
  updateTime();
  updateControls();
}

async function play() {
  if (!audio || busy || running) return;
  const generation = ++operation;
  try {
    await audioContext();
    if (generation !== operation || suspended) return;
    startSource();
    status('プレビューを再生しています。');
  } catch (error) { releaseSource(); status(error.message, true); updateControls(); }
}

function startSource(destination) {
  elapsed = 0;
  sceneTime = 0;
  source = context.createBufferSource();
  source.buffer = audio;
  if (!destination) source.connect(context.destination);
  if (destination) source.connect(destination);
  startedAt = context.currentTime + 0.05;
  running = true;
  source.onended = () => {
    releaseSource();
    elapsed = audio.duration;
    updateTime();
    status('再生が終了しました。');
    updateControls();
  };
  source.start(startedAt);
  updateControls();
}

async function exportVideo({ wavPath } = {}) {
  if (!audio || busy || running) throw new Error('音声の準備ができていません。');
  if (!wavPath) throw new Error('右上の書き出しメニューから動画を出力してください。');
  busy = exporting = true;
  cancelled = false;
  const generation = ++operation;
  cancelAnimationFrame(raf);
  updateControls();
  let session;
  try {
    const canvas = $('characterCanvas');
    const frameCount = Math.ceil(audio.duration * 30);
    session = await host.begin({ wavPath, width: canvas.width, height: canvas.height, frameCount });
    elapsed = sceneTime = 0;
    currentPose = neutralSpeechPose();
    for (let index = 0; index < frameCount; index++) {
      if (cancelled || generation !== operation) throw new DOMException('動画の作成を中止しました。', 'AbortError');
      elapsed = index / 30;
      drawFrame(1000 / 30);
      const pixels = app.renderer.plugins.extract.pixels();
      await host.frame(session.id, pixels.buffer);
    }
    elapsed = audio.duration;
    updateTime();
    return await host.finish(session.id);
  } finally {
    if (session) await host.abort(session.id);
    exporting = busy = false;
    updateControls();
  }
}

window.maitaVideo = {
  ready,
  async renderNarration(buffer, wavPath) {
    document.body.classList.add('is-companion-export');
    try {
      const loaded = await prepareAudio(() => Promise.resolve(buffer), '書き出すナレーション');
      if (!loaded) throw new Error($('videoStatus').textContent);
      for (let attempt = 0; ; attempt++) {
        try { return await exportVideo({ wavPath }); }
        catch (error) {
          // Driver session limits can be lower than the available-memory estimate.
          // The main-process budget shrinks before a fresh encoder is admitted.
          if (!error.message.includes('NVENC_RESOURCE:') || attempt >= 2) throw error;
        }
      }
    } finally { document.body.classList.remove('is-companion-export'); }
  },
  suspend() {
    suspended = true;
    stop();
    cancelAnimationFrame(raf);
    context?.suspend();
  },
  resume() {
    suspended = false;
    lastFrame = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  },
};

$('videoSynthesize').addEventListener('click', () => {
  const scope = $('videoScope').value;
  void prepareAudio(() => host.synthesize(scope), scope === 'all' ? '全文のナレーション' : '選択範囲のナレーション');
});
$('videoPlay').addEventListener('click', () => void play());
$('videoStop').addEventListener('click', () => { stop(); status('停止しました。'); });
$('videoExport').addEventListener('click', () => status('右上の書き出しメニューから動画を出力してください。'));
for (const id of ['videoSensitivity', 'videoMotionStrength']) {
  $(id).addEventListener('input', () => {
    $(`${id}Value`).value = Number($(id).value).toFixed(2);
  });
}

try {
  app = new PIXI.Application({
    view: $('characterCanvas'), width: 1280, height: 720,
    backgroundColor: 0x00ff00, backgroundAlpha: 0,
    antialias: true, autoStart: false, preserveDrawingBuffer: true,
  });
  model = await PIXI.live2d.Live2DModel.from('models/maita/maita.model3.json', {
    autoUpdate: false, autoInteract: false, motionPreload: 'NONE',
  });
  // Feed intentions before physics so the rig propagates torso motion into sleeves,
  // hands and hair. The previous post-physics hook prevented this propagation.
  model.internalModel.breath = undefined;
  const core = model.internalModel.coreModel;
  const indices = new Map(core._parameterIds.map((id, index) => [id, index]));
  const apply = (id, value, additive = false) => {
    const index = indices.get(id);
    if (index === undefined) return;
    const target = additive ? core.getParameterValueByIndex(index) + value : value;
    core.setParameterValueByIndex(index, Math.max(core.getParameterMinimumValue(index), Math.min(core.getParameterMaximumValue(index), target)));
  };
  model.internalModel.on('afterMotionUpdate', () => {
    for (const [id, value] of Object.entries(currentPose)) {
      if (!SECONDARY_PARAMETERS.has(id)) apply(id, value);
    }
    const mouth = exporting || (running && context.currentTime >= startedAt)
      ? mouthAt(envelope, elapsed, Number($('videoSensitivity').value)) : 0;
    apply('ParamMouthOpenY', mouth);
    apply('ParamMouthForm', 0);
  });
  model.internalModel.on('beforeModelUpdate', () => {
    for (const id of SECONDARY_PARAMETERS) apply(id, currentPose[id], true);
  });
  app.stage.addChild(model);
  fitVideoToCharacter();
  updateControls();
  status('準備できました。「文章から音声を生成」を押してください。');
  resolveReady();
  if (window.parent === window) {
    window.maitaVideo.resume();
  }
} catch (error) {
  rejectReady(error);
  model = null;
  updateControls();
  status(`モデルを読み込めませんでした: ${error.message}`, true);
}

window.addEventListener('beforeunload', () => {
  window.maitaVideo.suspend();
  context?.close();
  app?.destroy(false, { children: true, texture: true, baseTexture: true });
});
