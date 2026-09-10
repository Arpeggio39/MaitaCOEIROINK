// Audio-timed, reproducible performance. Randomness chooses intentions, never frame noise.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => { const x = clamp(value, 0, 1); return x * x * x * (10 + x * (-15 + x * 6)); };
const pulse = (time, center, width) => Math.exp(-0.5 * ((time - center) / width) ** 2);
export const SECONDARY_PARAMETERS = new Set(['Param79', 'Param80', 'Param81', 'Param83', 'Param84', 'Param85']);
export const MOTION_LIMITS = {
  ParamAngleX: 12, ParamAngleY: 10, ParamAngleZ: 7,
  ParamBodyAngleX: 4.5, ParamBodyAngleY: 3, ParamBodyAngleZ: 3,
  ParamPositionX2: 5, ParamPositionZ: 3,
  ParamEyeBallX: 0.5, ParamEyeBallY: 0.3,
  ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamBrowLY: 0.3, ParamBrowRY: 0.3,
  ParamBreath: 1, Param79: 0.28, Param80: 0.32, Param81: 0.18,
  Param83: 0.28, Param84: 0.32, Param85: 0.18,
};
const keys = Object.keys(MOTION_LIMITS);
export function neutralSpeechPose() {
  return Object.fromEntries(keys.map(key => [key, /Eye[LR]Open/.test(key) ? 1 : 0]));
}
function randomSource(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
function audioSeed(envelope) {
  let seed = 2166136261;
  for (let i = 0; i < envelope.values.length; i += 13) seed = Math.imul(seed ^ Math.round(envelope.values[i] * 1000), 16777619);
  return seed >>> 0;
}
function curve(random, duration, interval, amplitude, camera = false) {
  const points = [{ time: 0, value: 0 }];
  let time = 0;
  while (time < duration + 10) {
    time += interval * (0.7 + random() * 0.7);
    points.push({ time, value: camera && random() < 0.65 ? 0 : (random() * 2 - 1) * amplitude });
  }
  return points;
}
function curveAt(points, time, transition = 0.9) {
  let low = 0, high = points.length - 1;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (points[mid].time <= time) low = mid; else high = mid; }
  const a = points[low], b = points[high];
  // Hold a chosen pose, then ease to a new one. Each limb follows with its own inertia.
  return a.value + (b.value - a.value) * smooth((time - b.time + transition) / transition);
}
function phrasesFrom(envelope) {
  const phrases = [];
  let start = null, last = 0;
  for (let i = 0; i <= envelope.values.length; i++) {
    const time = i / envelope.rate;
    if ((envelope.values[i] || 0) > 0.16) { start ??= time; last = time; }
    if (start !== null && (time - last > 0.25 || i === envelope.values.length)) {
      if (last - start > 0.12) phrases.push({ start, end: last });
      start = null;
    }
  }
  return phrases;
}

export function createSpeechMotion(envelope, seed = audioSeed(envelope)) {
  const random = randomSource(seed);
  const duration = envelope.duration + 2;
  const phrases = phrasesFrom(envelope);
  const beats = [];
  let nextBeat = 0;
  for (const phrase of phrases) {
    beats.push({ time: phrase.start + 0.12, strength: 0.45, side: random() < 0.5 ? -1 : 1 });
    nextBeat = Math.max(nextBeat, phrase.start + 0.85);
    for (let time = nextBeat; time < phrase.end - 0.15; time += 0.01) {
      const i = Math.floor(time * envelope.rate), value = envelope.values[i] || 0;
      if (value > 0.55 && value >= (envelope.values[i - 8] || 0) + 0.06 && value >= (envelope.values[i + 8] || 0)) {
        beats.push({ time, strength: 0.45 + random() * 0.5, side: random() < 0.5 ? -1 : 1 });
        time += 0.85 + random() * 0.8;
        nextBeat = time;
      }
    }
  }
  const blinks = [];
  for (let time = 1.8 + random() * 2; time < duration;) {
    const boundary = phrases.find(p => p.end >= time - 0.6 && p.end <= time + 0.7);
    time = boundary ? boundary.end + 0.14 : time;
    if (!blinks.length || time - blinks.at(-1).time > 1.1) {
      blinks.push({ time, length: 0.16 + random() * 0.08 });
      if (random() < 0.12) blinks.push({ time: time + 0.32, length: 0.16 });
    }
    time += 2.8 + random() * 3.1;
  }
  const gazeX = curve(random, duration, 2.5, 0.32, true);
  const gazeY = curve(random, duration, 3.2, 0.17, true);
  const stance = curve(random, duration, 5.2, 1);
  const tilt = curve(random, duration, 3.8, 2.3);
  const breath = curve(random, duration, 2.1, 1);
  const rate = 60;
  const frames = [];
  let state = neutralSpeechPose(), velocity = neutralSpeechPose();
  for (const key of keys) velocity[key] = 0;
  for (let frame = 0; frame <= Math.ceil(duration * rate); frame++) {
    const time = frame / rate;
    let speaking = 0, inhale = 0, nod = 0, gesture = 0, shoulder = 0;
    for (const p of phrases) {
      if (time > p.end + 1 || time < p.start - 1) continue;
      speaking = Math.max(speaking, smooth((time - p.start + 0.2) / 0.4) * (1 - smooth((time - p.end) / 0.65)));
      inhale = Math.max(inhale, pulse(time, p.start - 0.16, 0.22));
    }
    for (const beat of beats) {
      if (Math.abs(time - beat.time) > 1.3) continue;
      // Small anticipation, decisive nod, slower recovery. Torso and arms lag behind.
      nod += beat.strength * (1.1 * pulse(time, beat.time - 0.13, 0.13) - 6.5 * pulse(time, beat.time + 0.12, 0.19));
      gesture += beat.side * beat.strength * pulse(time, beat.time + 0.2, 0.32);
      shoulder += beat.side * beat.strength * pulse(time, beat.time + 0.28, 0.38);
    }
    const weight = curveAt(stance, time);
    const gx = curveAt(gazeX, time, 0.16), gy = curveAt(gazeY, time, 0.18);
    const headGazeX = curveAt(gazeX, time - 0.12, 0.4);
    const headGazeY = curveAt(gazeY, time - 0.12, 0.4);
    let eye = 1;
    for (const blink of blinks) {
      const phase = (time - blink.time) / blink.length;
      if (phase >= 0 && phase <= 1) eye = Math.min(eye, phase < 0.4 ? 1 - smooth(phase / 0.4) : smooth((phase - 0.4) / 0.6));
    }
    const breathing = 0.35 + 0.13 * curveAt(breath, time) + 0.28 * inhale;
    const target = {
      ParamAngleX: headGazeX * 14 + weight * 3 + gesture * 3.4,
      ParamAngleY: headGazeY * 12 + nod + inhale * 0.7,
      ParamAngleZ: curveAt(tilt, time) - weight * 0.9 + gesture * 1.2,
      ParamBodyAngleX: weight * 3.2 + gesture * 2.3,
      ParamBodyAngleY: speaking * 1.0 + inhale * 0.7 + nod * 0.2,
      ParamBodyAngleZ: -weight * 1.7 + gesture * 0.85,
      ParamPositionX2: weight * 3.5,
      ParamPositionZ: inhale * 0.65 + breathing * 0.3,
      ParamEyeBallX: gx - state.ParamAngleX / 90,
      ParamEyeBallY: gy - state.ParamAngleY / 120,
      ParamEyeLOpen: eye, ParamEyeROpen: eye,
      ParamBrowLY: Math.max(0, -nod) * 0.04 + inhale * 0.05,
      ParamBrowRY: Math.max(0, -nod) * 0.035 + inhale * 0.05,
      ParamBreath: breathing,
      Param79: shoulder * 0.2, Param80: shoulder * 0.26, Param81: shoulder * 0.12,
      Param83: -shoulder * 0.17, Param84: -shoulder * 0.22, Param85: -shoulder * 0.1,
    };
    for (const key of keys) {
      if (/Eye[LR]Open/.test(key)) { state[key] = target[key]; continue; }
      const frequency = /EyeBall/.test(key) ? 24 : /Body|Position|^Param8|^Param79/.test(key) ? 7 : 12;
      // Critically damped spring, integrated at a fixed rate, independent of display FPS.
      velocity[key] += (frequency ** 2 * (target[key] - state[key]) - 2 * frequency * velocity[key]) / rate;
      state[key] = clamp(state[key] + velocity[key] / rate, key === 'ParamBreath' ? 0 : -MOTION_LIMITS[key], MOTION_LIMITS[key]);
    }
    frames.push({ ...state });
  }
  return { frames, rate, duration, seed, phrases, beats, blinks };
}

export function speechPoseAt(plan, seconds) {
  const position = clamp(seconds * plan.rate, 0, plan.frames.length - 1);
  const index = Math.floor(position), a = plan.frames[index], b = plan.frames[index + 1] || a;
  return Object.fromEntries(keys.map(key => [key, a[key] + (b[key] - a[key]) * (position - index)]));
}
