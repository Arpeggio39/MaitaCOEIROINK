export function alignedMotionTime(audioSeconds, offsetSeconds = 0, originSeconds = 0) {
  return audioSeconds + originSeconds - offsetSeconds;
}
export function clampMotionOffset(value, motionDuration, audioDuration) {
  return Math.round(Math.max(-motionDuration, Math.min(audioDuration, Number(value) || 0)) * 100) / 100;
}
export function wavDuration(buffer) {
  const view = new DataView(buffer);
  let rate = 0;
  for (let pos = 12; pos + 8 <= view.byteLength;) {
    const name = String.fromCharCode(...new Uint8Array(buffer, pos, 4));
    const size = view.getUint32(pos + 4, true);
    if (pos + 8 + size > view.byteLength) throw new Error('WAVデータが途中で切れています。');
    if (name === 'fmt ' && size >= 16) rate = view.getUint32(pos + 16, true);
    if (name === 'data' && rate > 0) return size / rate;
    pos += 8 + size + (size % 2);
  }
  throw new Error('音声の長さを取得できませんでした。');
}
