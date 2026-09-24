import { createSpeechCues, EXPRESSION_DEFAULTS } from './speech-cues.mjs';

export const createExpressionCues = createSpeechCues;
const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * x * (10 + x * (-15 + x * 6)); };

export function blendExpressionValue(id, base, { value, strength }) {
  // Expressions change lid shape while preserving a fully closed blink.
  const target = /Eye[LR]Open/.test(id) ? base * value : value;
  return base + (target - base) * strength;
}

export function expressionAt(cues, time) {
  const sums = Object.fromEntries(Object.keys(EXPRESSION_DEFAULTS).map(id => [id, 0]));
  let total = 0;
  for (const cue of cues) {
    const age = time - cue.time;
    const anticipation = cue.anticipation ?? .22, attack = cue.attack ?? .36;
    const hold = cue.hold ?? 1.1, release = cue.release ?? .7;
    if (age < -anticipation || age > hold + release) continue;
    const strength = ease((age + anticipation) / attack) * (1 - ease((age - hold) / release));
    total += strength;
    for (const [id, neutral] of Object.entries(EXPRESSION_DEFAULTS)) sums[id] += strength * (cue.pose[id] ?? neutral);
  }
  if (total < 1e-8) return {};
  // Cross-fade the whole face; per-parameter winners can snap between emotions.
  return Object.fromEntries(Object.entries(sums).map(([id, sum]) => [id, { value: sum / total, strength: Math.min(1, total) }]));
}
