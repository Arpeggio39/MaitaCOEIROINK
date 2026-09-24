import { parseRecordedMotion } from './recorded-motion.mjs';
import { createNativeLipEnvelope } from './native-lip-sync.mjs';
import { createSpeechMotion } from './speech-motion.mjs';
import { createSpeechCues } from './speech-cues.mjs';
import { concatWavBuffers } from './wav-utils.mjs';
self.onmessage = async ({ data: { kind, data } }) => {
  try {
    if (kind === 'motion') {
      self.postMessage({ value: parseRecordedMotion(data) });
    } else if (kind === 'speech') {
      const envelope = await createNativeLipEnvelope(data.channels, data.sampleRate);
      const cues = createSpeechCues(data.text, envelope, data.segments);
      const plan = createSpeechMotion(envelope, undefined, cues);
      self.postMessage({ value: { envelope, plan } }, [envelope.values.buffer]);
    } else if (kind === 'concat') {
      const value = concatWavBuffers(data);
      self.postMessage({ value }, [value]);
    } else throw new Error('Unknown compute task');
  } catch (error) { self.postMessage({ error: error.message }); }
};
