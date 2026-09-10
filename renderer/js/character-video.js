import { createGpuFrameBounds } from './gpu-frame-bounds.js';
import { mergeFrameBounds, frameFromBounds } from './frame-bounds.mjs';
import { alignedMotionTime } from './motion-timing.mjs';
import { sampleRecordedMotion } from './recorded-motion.mjs';
import { compute } from './compute-pool.js';
import { mouthAt, formatVideoTime } from './lip-sync.mjs';

import { fitCharacterFrame } from './character-frame.mjs';
import { createSpeechMotion, speechPoseAt, neutralSpeechPose, SECONDARY_PARAMETERS } from './speech-motion.mjs';

const $ = (id) => document.getElementById(id);
const host = window.parent.maitaVideoHost;
let app, model, context, audio, envelope, source;
let running = false, busy = false, suspended = false, cancelled = false;
let exporting = false;
let exportPhase = 'encode';
let analysisTarget = null;
let raf = 0, lastFrame = 0, startedAt = 0, elapsed = 0, sceneTime = 0;
let operation = 0;
let performancePlan;
let recorded = null, recordedValues = [];
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
  if (exporting) window.parent.maitaVideoHost?.onProgress?.($('videoProgress').value, exportPhase);
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
  recordedValues = recorded ? sampleRecordedMotion(recorded.motion, alignedMotionTime(elapsed, recorded.offsetSeconds, recorded.originSeconds), recorded.loop) : [];
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
  if (analysisTarget) analysisTarget.render(app.stage); else app.renderer.render(app.stage);
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

function geometryBounds() {
  const core = model.internalModel.coreModel;
  const transform = model.worldTransform.clone().append(model.internalModel.localTransform);
  let bounds = null;
  for (let i=0;i<core.getDrawableCount();i++) {
    if (core.getDrawableOpacity(i) <= 0) continue;
    const vertices = model.internalModel.getDrawableVertices(i);
    for (let j=0;j<vertices.length;j+=2) {
      const x=transform.a*vertices[j]+transform.c*vertices[j+1]+transform.tx;
      const y=transform.b*vertices[j]+transform.d*vertices[j+1]+transform.ty;
      bounds=mergeFrameBounds(bounds,{left:x,top:y,right:x,bottom:y});
    }
  }
  return bounds;
}

async function analyzeFrames(frameCount, generation) {
  const core = model.internalModel.coreModel;
  const snapshots = [];
  let bounds = null, width = 1280, height = 1280;
  const limit = Math.min(4096,app.renderer.gl.getParameter(app.renderer.gl.MAX_TEXTURE_SIZE));
  model.position.set(640,256);
  app.renderer.backgroundAlpha = 0;
  analysisTarget = createGpuFrameBounds(app.renderer,width,height);
  const capture = () => snapshots.push({
    parameters: Float32Array.from({length:core.getParameterCount()},(_,i)=>core.getParameterValueByIndex(i)),
    parts: Float32Array.from({length:core.getPartCount()},(_,i)=>core.getPartOpacityByIndex(i)),
    alpha:model.alpha,
  });
  model.internalModel.on('beforeModelUpdate',capture);
  elapsed=sceneTime=0; currentPose=neutralSpeechPose(); exportPhase='analyze';
  try {
    for(let index=0;index<frameCount;index++) {
      if(cancelled || generation!==operation) throw new DOMException('動画の作成を中止しました。','AbortError');
      elapsed=index/30; drawFrame(1000/30);
      // Geometry guards against an entire part falling outside the analysis viewport.
      let geometry=geometryBounds();
      while(geometry && (geometry.left<2 || geometry.top<2 || geometry.right>=width-2 || geometry.bottom>=height-2)) {
        if(width>=limit || height>=limit) throw new Error('動きの範囲が描画可能なサイズを超えています。');
        const nextWidth=Math.min(limit,width*2),nextHeight=Math.min(limit,height*2);
        const dx=(nextWidth-width)/2,dy=(nextHeight-height)/2;
        model.position.x+=dx;model.position.y+=dy;
        if(bounds) bounds={left:bounds.left+dx,right:bounds.right+dx,top:bounds.top+dy,bottom:bounds.bottom+dy};
        width=nextWidth;height=nextHeight;
        analysisTarget.destroy();analysisTarget=createGpuFrameBounds(app.renderer,width,height);
        analysisTarget.render(app.stage); // Same Core state; do not advance physics again.
        geometry=geometryBounds();
      }
      bounds=mergeFrameBounds(bounds,analysisTarget.read());
      // Yield to UI/cancellation while the GPU and encoder jobs share the device.
      if(index%8===0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    return {snapshots,frame:frameFromBounds(bounds)};
  } finally {
    model.internalModel.off('beforeModelUpdate',capture);
    analysisTarget?.destroy();analysisTarget=null;
  }
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
    const { snapshots, frame } = await analyzeFrames(frameCount,generation);
    const scale=Math.min(1,2048/frame.width,2048/frame.height);
    model.position.set((model.position.x+frame.offsetX)*scale,(model.position.y+frame.offsetY)*scale);
    model.scale.set(model.scale.x*scale,model.scale.y*scale);
    app.renderer.resize(Math.ceil(frame.width*scale/2)*2,Math.ceil(frame.height*scale/2)*2);
    app.renderer.backgroundAlpha=1;
    $('videoDimensions').textContent=`${canvas.width} × ${canvas.height}`;
    exportPhase='encode';
    // Reuse the measured poses and camera when a driver capacity retry is needed.
    for (let attempt = 0; ; attempt++) {
      try {
        session = await host.begin({ wavPath, width: canvas.width, height: canvas.height, frameCount });
        const core=model.internalModel.coreModel;
        for (let index = 0; index < frameCount; index++) {
          if (cancelled || generation !== operation) throw new DOMException('動画の作成を中止しました。', 'AbortError');
          const snapshot=snapshots[index];
          for(let i=0;i<snapshot.parameters.length;i++) core.setParameterValueByIndex(i,snapshot.parameters[i]);
          for(let i=0;i<snapshot.parts.length;i++) core.setPartOpacityByIndex(i,snapshot.parts[i]);
          model.alpha=snapshot.alpha;core.update();
          app.renderer.render(app.stage);
          elapsed=index/30;updateTime();
          const pixels = app.renderer.plugins.extract.pixels();
          await host.frame(session.id, pixels.buffer);
        }
        elapsed = audio.duration;
        updateTime();
        return await host.finish(session.id);
      } catch (error) {
        if (!error.message.includes('NVENC_RESOURCE:') || attempt >= 2) throw error;
      } finally {
        if (session) await host.abort(session.id);
        session = null;
      }
    }
  } finally {
    if (session) await host.abort(session.id);
    exporting = busy = false;
    updateControls();
  }
}

window.maitaVideo = {
  ready,
  async renderNarration(buffer, wavPath, motion = null) {
    document.body.classList.add('is-companion-export');
    try {
      const loaded = await prepareAudio(() => Promise.resolve(buffer), '書き出すナレーション');
      if (!loaded) throw new Error($('videoStatus').textContent);
      recorded = motion;
      if (recorded) {
        const ids = new Set(model.internalModel.coreModel._parameterIds);
        if (!recorded.motion.curves.some(curve => curve.target === 'Parameter' && ids.has(curve.id))) {
          throw new Error('このモデルに対応するパラメーターがありません。同じマイタモデルで収録したモーションを選んでください。');
        }
        model.internalModel.eyeBlink = undefined;
      }
      return await exportVideo({ wavPath });
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
  const parts = new Map(core._partIds.map((id, index) => [id, index]));
  function applyRecording() {
    const blink = recordedValues.find(curve => curve.target === 'Model' && curve.id === 'EyeBlink');
    if (blink) for (const id of ['ParamEyeLOpen', 'ParamEyeROpen']) apply(id, blink.value);
    for (const curve of recordedValues) {
      if (curve.target === 'Parameter') {
        const eye = curve.id === 'ParamEyeLOpen' || curve.id === 'ParamEyeROpen';
        apply(curve.id, curve.value * (eye && blink ? blink.value : 1));
      } else if (curve.target === 'PartOpacity' && parts.has(curve.id)) {
        core.setPartOpacityByIndex(parts.get(curve.id), Math.max(0, Math.min(1, curve.value)));
      } else if (curve.target === 'Model' && curve.id === 'Opacity') {
        model.alpha = Math.max(0, Math.min(1, curve.value));
      }
    }
    // Apply again after physics and pose: recorded eyes, brows, mouth shape and body
    // must not be replaced by automatic motion. Only mouth opening is audio-driven.
    apply('ParamMouthOpenY', mouthAt(envelope, elapsed, Number($('videoSensitivity').value)));
  }
  model.internalModel.on('afterMotionUpdate', () => {
    if (recorded) { applyRecording(); return; }
    for (const [id, value] of Object.entries(currentPose)) {
      if (!SECONDARY_PARAMETERS.has(id)) apply(id, value);
    }
    const mouth = exporting || (running && context.currentTime >= startedAt)
      ? mouthAt(envelope, elapsed, Number($('videoSensitivity').value)) : 0;
    apply('ParamMouthOpenY', mouth);
    apply('ParamMouthForm', 0);
  });
  model.internalModel.on('beforeModelUpdate', () => {
    if (recorded) { applyRecording(); return; }
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
