// Local Japanese acting cues, not semantic understanding or word-level alignment.
// Synthesis segments anchor each cue to the actual audio for that text.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const spokenLength = text => [...text].filter(c => !/[\s、。！？!?「」『』,.;；]/.test(c)).length;

export const EXPRESSION_DEFAULTS = {
  ParamMouthForm: 0, ParamEyeLOpen: 1, ParamEyeROpen: 1,
  ParamEyeLSmile: 0, ParamEyeRSmile: 0,
  ParamBrowLY: 0, ParamBrowRY: 0, ParamBrowLAngle: 0, ParamBrowRAngle: 0,
  ParamBrowLForm: 0, ParamBrowRForm: 0,
};

const intentions = [
  { kind: 'thanks', words: /ありがとう|感謝|お礼/, pose: { ParamMouthForm: .65, ParamEyeLOpen: .84, ParamEyeROpen: .84, ParamEyeLSmile: .55, ParamEyeRSmile: .5, ParamBrowLY: .15, ParamBrowRY: .12 } },
  { kind: 'apology', words: /ごめん|すみません|申し訳/, pose: { ParamMouthForm: -.35, ParamEyeLOpen: .83, ParamEyeROpen: .85, ParamBrowLY: -.2, ParamBrowRY: -.17, ParamBrowLForm: -.3, ParamBrowRForm: -.3 } },
  { kind: 'surprise', words: /びっくり|驚[きくい]|まさか|すごい|えっ/, pose: { ParamMouthForm: -.12, ParamEyeLOpen: 1.12, ParamEyeROpen: 1.1, ParamBrowLY: .55, ParamBrowRY: .5 } },
  { kind: 'happy', words: /嬉し[いく]|うれし[いく]|楽し[いく]|大好き|やった|おめでとう/, pose: { ParamMouthForm: .75, ParamEyeLOpen: .8, ParamEyeROpen: .83, ParamEyeLSmile: .7, ParamEyeRSmile: .65, ParamBrowLY: .22, ParamBrowRY: .18 } },
  { kind: 'sad', words: /悲し[いく]|寂し[いく]|さみし[いく]|残念/, pose: { ParamMouthForm: -.5, ParamEyeLOpen: .77, ParamEyeROpen: .8, ParamBrowLY: -.25, ParamBrowRY: -.2, ParamBrowLForm: -.35, ParamBrowRForm: -.3 } },
  { kind: 'question', words: /どうして|なぜ|なんで|不思議|でしょうか|ですか|[？?]/, pose: { ParamMouthForm: -.08, ParamBrowLY: .27, ParamBrowRY: .06, ParamBrowLAngle: .12 } },
  { kind: 'thinking', words: /考え|うーん|えーと|えっと|たしか|確か/, pose: { ParamMouthForm: -.1, ParamEyeLOpen: .92, ParamEyeROpen: .94, ParamBrowLY: .15, ParamBrowRY: -.08 } },
  { kind: 'agree', words: /なるほど|そうですね|その通り|わかりました|分かりました/, pose: { ParamMouthForm: .22, ParamEyeLSmile: .2, ParamEyeRSmile: .18 } },
  { kind: 'greeting', words: /こんにちは|こんばんは|おはよう|よろしく|さようなら|またね/, pose: { ParamMouthForm: .45, ParamEyeLSmile: .35, ParamEyeRSmile: .32, ParamBrowLY: .12, ParamBrowRY: .1 } },
  { kind: 'contrast', words: /しかし|けれど|一方で|それに対して/, pose: { ParamBrowLY: .16, ParamBrowRY: .09 } },
  { kind: 'explain', words: /例えば|たとえば|つまり|大切|重要|ポイント|まず|次に/, pose: { ParamMouthForm: .12, ParamBrowLY: .18, ParamBrowRY: .13 } },
];

export function narrationSegments(parts) {
  let time = 0;
  return parts.map(({ text, duration }) => {
    const start = time;
    time += Number.isFinite(duration) ? Math.max(0, duration) : 0;
    return { text, start, end: time };
  });
}

export function createSpeechCues(text, envelope, segments = []) {
  if (!text || !envelope?.values.length) return [];
  const windows = segments.length ? segments : [{ text, start: 0, end: envelope.duration }];
  const cues = [];
  for (const segment of windows) {
    if (!segment.text || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)) continue;
    const voiced = [];
    for (let i = Math.max(0, Math.ceil(segment.start * envelope.rate)); i < Math.min(envelope.values.length, Math.ceil(segment.end * envelope.rate)); i++) {
      if (envelope.values[i] > .08) voiced.push(i / envelope.rate);
    }
    if (!voiced.length) continue;
    const total = Math.max(1, spokenLength(segment.text));
    const at = offset => voiced[clamp(Math.floor(spokenLength(segment.text.slice(0, offset)) / total * voiced.length), 0, voiced.length - 1)];
    for (const clause of segment.text.matchAll(/[^。！？!?、,;；\n]+[。！？!?、,;；\n]*/g)) {
      for (const intention of intentions) {
        const match = intention.words.exec(clause[0]);
        if (!match) continue;
        const suffix = clause[0].slice(match.index + match[0].length);
        if (/^(?:しく|く)?(?:は|も|じゃ|では)?(?:ない|ありません|なかった)|^(?:わけでは|とは思わ)ない/.test(suffix)) continue;
        const time = at(clause.index + match.index);
        const end = at(clause.index + clause[0].length);
        cues.push({
          kind: intention.kind, time, end, pose: intention.pose,
          anticipation: .22, attack: intention.kind === 'surprise' ? .18 : .36,
          hold: clamp(end - time, .55, 1.4), release: /sad|apology|thinking/.test(intention.kind) ? .95 : .7,
        });
        break; // One intention per clause, shared by face and body.
      }
    }
  }
  cues.sort((a, b) => a.time - b.time);
  return cues.filter((cue, index) => !index || cue.kind !== cues[index - 1].kind || cue.time - cues[index - 1].time > 1.1);
}
