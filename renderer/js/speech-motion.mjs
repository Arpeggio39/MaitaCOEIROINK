// Reproducible, audio-timed acting. Randomness selects held intentions, never frame noise.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => { const x = clamp(value, 0, 1); return x * x * x * (10 + x * (-15 + x * 6)); };
const pulse = (time, center, width) => Math.exp(-.5 * ((time - center) / width) ** 2);
export const SECONDARY_PARAMETERS = new Set(['Param79', 'Param80', 'Param81', 'Param82', 'Param83', 'Param84', 'Param85', 'Param86']);
export const MOTION_LIMITS = {
  ParamAngleX: 26, ParamAngleY: 22, ParamAngleZ: 18,
  ParamBodyAngleX: 9, ParamBodyAngleY: 8.5, ParamBodyAngleZ: 8,
  ParamPositionX2: 22, ParamPositionZ: 18,
  ParamEyeBallX: .5, ParamEyeBallY: .3,
  ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamBrowLY: .3, ParamBrowRY: .3,
  ParamBreath: 1, Param79: .75, Param80: .85, Param81: .5, Param82: .25,
  Param83: .75, Param84: .85, Param85: .5, Param86: .25,
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
function curve(random, duration, interval, amplitude) {
  const points = [{ time: 0, value: 0 }];
  for (let time = interval; time < duration + interval;) {
    points.push({ time, value: (random() * 2 - 1) * amplitude });
    time += interval * (.8 + random() * .7);
  }
  return points;
}
function curveAt(points, time, transition = 1.2, field = 'value') {
  let low = 0, high = points.length;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (points[mid].time <= time) low = mid; else high = mid; }
  const a = points[Math.max(0, low - 1)], b = points[low];
  // A point marks movement onset, not arrival: eyes must start before the head.
  return a[field] + (b[field] - a[field]) * smooth((time - b.time) / transition);
}
function phrasesFrom(envelope) {
  const phrases = [];
  let start = null, last = 0;
  for (let i = 0; i <= envelope.values.length; i++) {
    const time = i / envelope.rate;
    if ((envelope.values[i] || 0) > .12) { start ??= time; last = time; }
    if (start !== null && (time - last > .28 || i === envelope.values.length)) {
      if (last - start > .1) phrases.push({ start, end: last });
      start = null;
    }
  }
  return phrases;
}
function makePostures(phrases, random) {
  const postures = [{ time: -.5, x: 0, lean: 0 }];
  let side = random() < .5 ? -1 : 1, next = 0;
  for (const phrase of phrases) {
    for (let time = Math.max(next, phrase.start - .18, 0); time < phrase.end - .2;) {
      // Commit to a whole-body stance, hold it, then transfer weight across it.
      // A short clip should move too; don't wait several seconds for the first pose.
      side = random() < .8 ? -side : side;
      postures.push({ time, x: side * (.58 + random() * .3), lean: (random() < .65 ? 1 : -1) * (.45 + random() * .35) });
      time += 2.4 + random() * 1.5;
      next = time;
    }
  }
  return postures;
}
function gesturePose(kind, side) {
  const arm = side > 0 ? ['Param79', 'Param80', 'Param81', 'Param82'] : ['Param83', 'Param84', 'Param85', 'Param86'];
  const present = { [arm[0]]: .28, [arm[1]]: .5, [arm[2]]: .26, [arm[3]]: .1 };
  switch (kind) {
    case 'thanks': return { ParamAngleY: -17, ParamBodyAngleY: -7, ParamPositionZ: -7, ParamEyeBallY: -.05, Param79: .12, Param83: .1 };
    case 'apology': return { ParamAngleY: -18, ParamBodyAngleY: -7.5, ParamPositionZ: -8, ParamAngleZ: side * 2, Param79: -.16, Param83: -.13 };
    case 'sad': return { ParamAngleY: -7, ParamAngleZ: side * 4, ParamBodyAngleY: -2.5, Param79: -.13, Param83: -.1 };
    case 'surprise': return { ParamAngleY: 7, ParamBodyAngleY: -4.5, ParamPositionZ: -7, Param79: .3, Param83: .24, Param80: .23, Param84: .18 };
    case 'question': return { ...present, ParamAngleZ: side * 11, ParamAngleY: 3, ParamBodyAngleX: side * 2.5, ParamBodyAngleZ: side * 3, ParamPositionX2: side * 3 };
    case 'thinking': return { ParamAngleZ: side * 7, ParamAngleY: 3.5, ParamBodyAngleX: side * 2.6, ParamBodyAngleZ: side * 1.8 };
    case 'happy': return { ...present, ParamAngleY: 3, ParamAngleZ: side * 5, ParamBodyAngleY: 3.5, ParamPositionZ: 4 };
    case 'greeting': return { ...present, ParamAngleY: -5, ParamBodyAngleX: side * 3, ParamBodyAngleY: 2, ParamAngleZ: side * 4 };
    case 'agree': case 'nod': return { ParamAngleY: -8, ParamBodyAngleY: -2.2, ParamPositionZ: -.5, ParamBrowLY: .07, ParamBrowRY: .06 };
    case 'contrast': return { ...present, ParamAngleX: side * 12, ParamBodyAngleX: side * 4.5, ParamBodyAngleZ: -side * 2, ParamPositionX2: side * 3, ParamAngleZ: -side * 3 };
    case 'explain': case 'present': return { ...present, ParamAngleX: side * 12, ParamBodyAngleX: side * 4, ParamBodyAngleY: 1.8, ParamPositionX2: side * 2.5, ParamAngleY: -2.5, ParamBrowLY: .1, ParamBrowRY: .08 };
    case 'tilt': return { ParamAngleZ: side * 7, ParamBodyAngleZ: side * 2.2, ParamBodyAngleX: side * 1.5, ParamAngleY: -1.2 };
    default: return { [arm[0]]: .12, [arm[1]]: .21, [arm[2]]: .1, ParamAngleY: -3.2, ParamBodyAngleY: 1.3 };
  }
}
function gestureShape(event, time) {
  const age = time - event.time;
  return smooth((age + event.attack) / event.attack) * (1 - smooth((age - event.hold) / event.release))
    - .12 * pulse(age, -event.attack - .12, .095);
}
function makeGestures(envelope, phrases, cues, random) {
  const beats = [], gestures = [];
  const kinds = ['nod', 'present', 'beat', 'tilt'];
  let previousKind = -1, nextBeat = 0;
  const shoulder = Math.max(1, Math.round(envelope.rate * .1));
  for (const phrase of phrases) {
    const add = (time, strength) => {
      // An intentional reaction occupies the body; don't nod through an apology.
      if (cues.some(cue => time > cue.time - .65 && time < cue.time + cue.hold + .6)) return;
      const side = random() < .58 ? 1 : -1;
      const kind = (previousKind + 1 + Math.floor(random() * (kinds.length - 1))) % kinds.length;
      previousKind = kind;
      beats.push({ time, strength, side });
      gestures.push({ time, kind: kinds[kind], strength, side, attack: .24, hold: kind === 0 ? .06 : .2, release: .65 + random() * .3 });
    };
    if (phrase.end - phrase.start > .3 && phrase.start >= nextBeat) {
      add(phrase.start + Math.min(.24, (phrase.end - phrase.start) * .3), .48);
      nextBeat = phrase.start + 1.5;
    }
    for (let i = Math.ceil(Math.max(nextBeat, phrase.start) * envelope.rate); i < (phrase.end - .15) * envelope.rate; i++) {
      const value = envelope.values[i] || 0;
      const prominence = value - Math.min(envelope.values[i - shoulder] || 0, envelope.values[i + shoulder] || 0);
      if (value > .5 && prominence > .08 && value >= (envelope.values[i + shoulder] || 0)) {
        add(i / envelope.rate, clamp(.35 + prominence * .85, .35, .85));
        nextBeat = i / envelope.rate + 1.35 + random() * .8;
        i = Math.ceil(nextBeat * envelope.rate);
      }
    }
  }
  for (const cue of cues) gestures.push({
    time: cue.time + .04, kind: cue.kind, strength: .85 + random() * .12,
    side: random() < .58 ? 1 : -1,
    attack: cue.kind === 'surprise' ? .14 : .32,
    hold: /thanks|apology/.test(cue.kind) ? .3 : Math.min(.8, cue.hold * .6),
    release: /thanks|apology|sad/.test(cue.kind) ? 1.05 : .8,
  });
  gestures.sort((a, b) => a.time - b.time);
  for (const event of gestures) event.pose = gesturePose(event.kind, event.side);
  return { beats, gestures };
}
function makeGaze(duration, phrases, gestures, random) {
  const events = [{ time: -.5, x: 0, y: 0, priority: 2 }];
  for (let time = 2.5 + random() * 2; time < duration; time += 3.5 + random() * 2.5) {
    const speaking = phrases.some(p => time >= p.start && time <= p.end);
    const away = random() < .18;
    events.push({ time, x: away ? (random() < .5 ? -1 : 1) * (.16 + random() * .1) * (speaking ? 1 : .5) : 0, y: away ? .04 + random() * .07 : 0, priority: 0 });
    if (away) events.push({ time: time + .9 + random() * .5, x: 0, y: 0, priority: 0 });
  }
  for (const event of gestures) {
    if (!/thinking|question|thanks|apology|sad|greeting|explain|surprise/.test(event.kind)) continue;
    const thinking = /thinking|question/.test(event.kind), down = /thanks|apology|sad/.test(event.kind);
    events.push({ time: Math.max(0, event.time - .28), x: thinking ? event.side * .26 : 0, y: thinking ? .12 : down ? -.14 : 0, priority: 1 });
    events.push({ time: event.time + event.hold + .45, x: 0, y: 0, priority: 1 });
  }
  events.sort((a, b) => a.time - b.time || a.priority - b.priority);
  const gaze = [];
  for (const event of events) {
    const previous = gaze.at(-1);
    if (previous && event.time - previous.time < .3) {
      if (event.priority >= previous.priority) gaze[gaze.length - 1] = event;
    } else gaze.push(event);
  }
  return gaze;
}
function makeBlinks(duration, phrases, cues, random) {
  const blinks = [];
  for (let time = 1.6 + random() * 1.5; time < duration;) {
    const boundary = phrases.find(p => p.end >= time - .45 && p.end <= time + .6);
    if (boundary) time = boundary.end + .1;
    const surprise = cues.find(cue => cue.kind === 'surprise' && time > cue.time - .25 && time < cue.time + .65);
    if (surprise) time = surprise.time + .8;
    if (!blinks.length || time - blinks.at(-1).time > 1.3) {
      blinks.push({ time, length: .17 + random() * .07 });
      if (random() < .09) blinks.push({ time: time + .3, length: .17 });
    }
    time += 2.5 + random() * 3;
  }
  return blinks;
}
function lidAt(blinks, time) {
  for (const blink of blinks) {
    if (blink.time > time) break;
    const phase = (time - blink.time) / blink.length;
    if (phase >= 0 && phase <= 1) return phase < .36 ? 1 - smooth(phase / .36) : smooth((phase - .36) / .64);
  }
  return 1;
}

export function createSpeechMotion(envelope, seed = audioSeed(envelope), cues = []) {
  const random = randomSource(seed), duration = envelope.duration + 2;
  const phrases = phrasesFrom(envelope);
  const { beats, gestures } = makeGestures(envelope, phrases, cues, random);
  const postures = makePostures(phrases, random);
  for (const event of gestures) {
    // A leftward gesture should not cancel a simultaneous rightward stance.
    // Use one direction for the weight transfer and its head/arm gesture.
    const posture = postures.findLast(p => p.time <= event.time);
    if (posture?.x && event.kind !== 'contrast') {
      event.side = Math.sign(posture.x);
      event.pose = gesturePose(event.kind, event.side);
    }
  }
  const gaze = makeGaze(duration, phrases, gestures, random);
  const blinks = makeBlinks(duration, phrases, cues, random);
  const stance = curve(random, duration, 4.3, .85);
  const tilt = curve(random, duration, 4.4, 3.5);
  const breaths = [{ time: 0, length: 3.8 }];
  while (breaths.at(-1).time < duration) {
    const last = breaths.at(-1);
    breaths.push({ time: last.time + last.length, length: 3.4 + random() * 1.3 });
  }
  const rate = 60, frames = [], state = neutralSpeechPose();
  const velocity = Object.fromEntries(keys.map(key => [key, 0]));
  let phraseIndex = 0, gestureIndex = 0, breathIndex = 0;
  for (let frame = 0; frame <= Math.ceil(duration * rate); frame++) {
    const time = frame / rate;
    while (phrases[phraseIndex]?.end < time - 1) phraseIndex++;
    while (gestures[gestureIndex] && gestures[gestureIndex].time + gestures[gestureIndex].hold + gestures[gestureIndex].release + .4 < time) gestureIndex++;
    while (breaths[breathIndex + 1]?.time <= time) breathIndex++;
    let speaking = 0, inhale = 0;
    for (let i = phraseIndex; i < phrases.length && phrases[i].start < time + .6; i++) {
      const p = phrases[i];
      speaking = Math.max(speaking, smooth((time - p.start + .25) / .45) * (1 - smooth((time - p.end) / .8)));
      inhale = Math.max(inhale, pulse(time, p.start - .2, .2));
    }
    const breath = breaths[breathIndex], phase = (time - breath.time) / breath.length;
    const breathing = .2 + .25 * (phase < .36 ? smooth(phase / .36) : 1 - smooth((phase - .36) / .64));
    const activity = .08 + .92 * speaking;
    const weight = curveAt(postures, time, 1.05, 'x') * activity;
    const headWeight = curveAt(postures, time - .16, 1.2, 'x') * activity;
    let reaction = 0;
    for (let i = gestureIndex; i < gestures.length && gestures[i].time < time + .85; i++) {
      if (/thanks|apology|surprise|sad/.test(gestures[i].kind)) reaction = Math.max(reaction, gestureShape(gestures[i], time));
    }
    const leaning = activity * (1 - .9 * clamp(reaction, 0, 1));
    const lean = curveAt(postures, time, 1.3, 'lean') * leaning;
    const headLean = curveAt(postures, time - .16, 1.4, 'lean') * leaning;
    const restingWeight = curveAt(stance, time) * .08 * (1 - speaking);
    const gx = curveAt(gaze, time, .12, 'x'), gy = curveAt(gaze, time, .14, 'y');
    const target = {
      ...neutralSpeechPose(),
      ParamAngleX: curveAt(gaze, time - .15, .42, 'x') * 22 * (.25 + .75 * speaking) + headWeight * 12 + restingWeight * 3,
      ParamAngleY: curveAt(gaze, time - .15, .42, 'y') * 13 * (.25 + .75 * speaking) + headLean * 4.5 + inhale * .8,
      ParamAngleZ: curveAt(tilt, time) * (.2 + .8 * speaking) + headWeight * 6,
      ParamBodyAngleX: weight * 5.8 + restingWeight * 3, ParamBodyAngleY: speaking * 1.1 + lean * 3.5 + inhale * .8,
      ParamBodyAngleZ: weight * 4.8, ParamPositionX2: weight * 16 + restingWeight * 4,
      ParamPositionZ: lean * 9 + (breathing - .2) * .8 + inhale * .6,
      ParamEyeBallX: gx - state.ParamAngleX / 90,
      ParamEyeBallY: gy - state.ParamAngleY / 120,
      ParamEyeLOpen: lidAt(blinks, time), ParamEyeROpen: lidAt(blinks, time - .006),
      ParamBrowLY: inhale * .035, ParamBrowRY: inhale * .03,
      ParamBreath: clamp(breathing + inhale * .2, 0, 1),
    };
    for (let i = gestureIndex; i < gestures.length && gestures[i].time < time + .85; i++) {
      const event = gestures[i];
      for (const [key, value] of Object.entries(event.pose)) {
        const lag = /^Param8[126]$|^Param85$/.test(key) ? .2 : SECONDARY_PARAMETERS.has(key) ? .12 : /Body|Position/.test(key) ? .08 : 0;
        target[key] += value * event.strength * gestureShape(event, time - lag);
      }
    }
    for (const key of keys) {
      if (/Eye[LR]Open/.test(key)) { state[key] = target[key]; continue; }
      const frequency = /EyeBall/.test(key) ? 32 : /Body|Position/.test(key) ? 8 : SECONDARY_PARAMETERS.has(key) ? 10 : 14;
      // Exact critically damped spring, with a velocity budget to avoid abrupt starts.
      const displacement = state[key] - target[key], impulse = velocity[key] + frequency * displacement;
      const decay = Math.exp(-frequency / rate);
      const next = target[key] + (displacement + impulse / rate) * decay;
      const speed = /EyeBall/.test(key) ? 4 : /Brow|Breath/.test(key) ? 1 : SECONDARY_PARAMETERS.has(key) ? 2 : /Body|Position/.test(key) ? 16 : 32;
      const bounded = clamp(next, state[key] - speed / rate, state[key] + speed / rate);
      velocity[key] = bounded === next ? (velocity[key] - frequency * impulse / rate) * decay : (bounded - state[key]) * rate;
      state[key] = clamp(bounded, key === 'ParamBreath' ? 0 : -MOTION_LIMITS[key], MOTION_LIMITS[key]);
      if (state[key] !== bounded) velocity[key] = 0;
    }
    frames.push({ ...state });
  }
  return { frames, rate, duration, seed, phrases, beats, blinks, gestures, gaze, cues, postures };
}

export function speechPoseAt(plan, seconds) {
  const position = clamp(seconds * plan.rate, 0, plan.frames.length - 1);
  const index = Math.floor(position), a = plan.frames[index], b = plan.frames[index + 1] || a;
  return Object.fromEntries(keys.map(key => [key, a[key] + (b[key] - a[key]) * (position - index)]));
}
