import { createLipEnvelope } from './lip-sync.mjs';
import { createSpeechMotion } from './speech-motion.mjs';
import { concatWavBuffers } from './wav-utils.mjs';
self.onmessage = ({ data: { kind, data } }) => {
  try {
    if (kind === 'speech') {
      const envelope = createLipEnvelope(data.channels, data.sampleRate);
      const plan = createSpeechMotion(envelope);
      self.postMessage({ value: { envelope, plan } }, [envelope.values.buffer]);
    } else if (kind === 'concat') {
      const value = concatWavBuffers(data);
      self.postMessage({ value }, [value]);
    } else throw new Error('Unknown compute task');
  } catch (error) { self.postMessage({ error: error.message }); }
};
