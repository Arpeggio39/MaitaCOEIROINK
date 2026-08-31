/** @param {ArrayBuffer} ab */
export function parseWav(ab) {
  const u8 = new Uint8Array(ab);
  const dv = new DataView(ab);
  if (u8.length < 44) throw new Error('WAV が短すぎます');
  let fmt = null;
  let dataOffset = 0;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= u8.length) {
    const id = String.fromCharCode(u8[offset], u8[offset + 1], u8[offset + 2], u8[offset + 3]);
    const chunkSize = dv.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: dv.getUint16(offset + 8, true),
        numChannels: dv.getUint16(offset + 10, true),
        sampleRate: dv.getUint32(offset + 12, true),
        bitsPerSample: dv.getUint16(offset + 22, true),
      };
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }
  if (!fmt || !dataSize || dataOffset + dataSize > u8.length) {
    throw new Error('WAV の解析に失敗しました');
  }
  const pcm = u8.slice(dataOffset, dataOffset + dataSize);
  return { ...fmt, pcm, pcmByteLength: pcm.byteLength };
}

export function buildStandardWav(sampleRate, numChannels, bitsPerSample, pcmData) {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buffer);
  const out = new Uint8Array(buffer);
  const writeString = (pos, value) => {
    for (let i = 0; i < value.length; i += 1) out[pos + i] = value.charCodeAt(i);
  };
  writeString(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  dv.setUint32(40, dataSize, true);
  out.set(pcmData, 44);
  return buffer;
}

/** @param {ArrayBuffer[]} buffers */
export function concatWavBuffers(buffers) {
  if (buffers.length === 0) throw new Error('結合する音声がありません');
  if (buffers.length === 1) return buffers[0];
  const parsed = buffers.map(parseWav);
  const first = parsed[0];
  for (let i = 1; i < parsed.length; i += 1) {
    const current = parsed[i];
    if (
      current.sampleRate !== first.sampleRate ||
      current.numChannels !== first.numChannels ||
      current.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error('行ごとの WAV 形式が一致しません。サンプルレートを固定して再試行してください。');
    }
  }
  const merged = new Uint8Array(parsed.reduce((sum, item) => sum + item.pcmByteLength, 0));
  let offset = 0;
  for (const item of parsed) {
    merged.set(item.pcm, offset);
    offset += item.pcmByteLength;
  }
  return buildStandardWav(first.sampleRate, first.numChannels, first.bitsPerSample, merged);
}
