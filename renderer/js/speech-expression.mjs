// Lightweight Japanese cues. Timing is estimated from text position and voiced audio,
// not word-level forced alignment. No network or language model is required.
const expressions = [
  { words: /ありがとう|嬉し[いく]|うれし[いく]|楽しい|大好き|やった|おめでとう/g, pose: { ParamMouthForm: .9, ParamEyeLOpen: .72, ParamEyeROpen: .72, ParamBrowLY: .28, ParamBrowRY: .28 } },
  { words: /びっくり|驚[きくい]|まさか|すごい|えっ|本当/g, pose: { ParamMouthForm: -.15, ParamEyeLOpen: 1.15, ParamEyeROpen: 1.15, ParamBrowLY: .65, ParamBrowRY: .65 } },
  { words: /悲し[いく]|寂し[いく]|さみし[いく]|残念|ごめん|すみません/g, pose: { ParamMouthForm: -.65, ParamEyeLOpen: .68, ParamEyeROpen: .68, ParamBrowLY: -.35, ParamBrowRY: -.35 } },
  { words: /どうして|なぜ|不思議|なるほど|考え/g, pose: { ParamMouthForm: -.1, ParamBrowLY: .35, ParamBrowRY: -.15, ParamEyeBallX: .25, ParamEyeBallY: .12 } },
];
const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export function createExpressionCues(text, envelope) {
  if (!text || !envelope?.values.length) return [];
  const voiced = [];
  for (let i = 0; i < envelope.values.length; i++) if (envelope.values[i] > .08) voiced.push(i / envelope.rate);
  if (!voiced.length) return [];
  const weight = value => [...value].filter(c => !/[\s、。！？!?「」『』]/.test(c)).length;
  const total = Math.max(1, weight(text));
  const cues = [];
  for (const { words, pose } of expressions) for (const match of text.matchAll(words)) {
    // Avoid common explicit negations, including inflected adjectives.
    if (/^(?:しく|く)?(?:は|も|じゃ|では)?(?:ない|ありません|なかった)/.test(text.slice(match.index + match[0].length))) continue;
    const fraction = weight(text.slice(0, match.index)) / total;
    cues.push({ time: voiced[Math.min(voiced.length - 1, Math.floor(fraction * voiced.length))], pose });
  }
  cues.sort((a,b) => a.time - b.time);
  return cues.filter((cue, i) => i === 0 || cue.time - cues[i - 1].time > .8);
}
export function expressionAt(cues, time) {
  const pose = {};
  for (const cue of cues) {
    const age = time - cue.time;
    if (age < -.18 || age > 2.3) continue;
    const strength = ease((age + .18) / .4) * (1 - ease((age - 1.1) / 1.2));
    for (const [id, value] of Object.entries(cue.pose)) {
      const previous = pose[id];
      if (!previous || previous.strength < strength) pose[id] = { value, strength };
    }
  }
  return pose;
}
