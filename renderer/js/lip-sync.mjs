/** Precompute a 100 Hz envelope. Measure channels separately so stereo phase cannot cancel speech. */
export function createLipEnvelope(channels, sampleRate, rate = 100) {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('音声のサンプルレートが不正です。');
  }
  const length = channels[0].length;
  const values = new Float32Array(Math.ceil(length / sampleRate * rate));
  for (let frame = 0; frame < values.length; frame++) {
    const start = Math.floor(frame * sampleRate / rate);
    const end = Math.min(length, Math.floor((frame + 1) * sampleRate / rate));
    let sum = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) sum += channel[i] * channel[i];
    }
    values[frame] = Math.sqrt(sum / Math.max(1, (end - start) * channels.length));
  }
  return finishLipEnvelope(values, rate, length / sampleRate);
}

export function finishLipEnvelope(values, rate, duration) {
  const voiced = [...values].filter((value) => value > 0.008).sort((a, b) => a - b);
  const reference = Math.max(0.04, voiced[Math.floor(voiced.length * 0.95)] || 0.04);
  let smoothed = 0;
  for (let i = 0; i < values.length; i++) {
    const target = values[i] < 0.008 ? 0 : Math.min(1, values[i] / reference);
    const timeConstant = target > smoothed ? 0.025 : 0.055;
    smoothed += (target - smoothed) * (1 - Math.exp(-1 / rate / timeConstant));
    values[i] = smoothed < 0.015 ? 0 : smoothed;
  }
  return { values, rate, duration };
}

export function mouthAt(envelope, seconds, sensitivity = 1) {
  if (!envelope || seconds < 0 || seconds >= envelope.duration) return 0;
  const position = seconds * envelope.rate;
  const index = Math.floor(position);
  const a = envelope.values[index] || 0;
  const b = envelope.values[index + 1] ?? a;
  return Math.max(0, Math.min(1, (a + (b - a) * (position - index)) * sensitivity));
}

export function formatVideoTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
