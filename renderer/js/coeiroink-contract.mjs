export const COEIROINK_PROCESSING_ALGORITHMS = Object.freeze([
  'td-psola',
  'world',
  'resampling',
]);

// COEIROINK v2.13.0 の公式 UI は、編集済み F0 を3サンプル間隔として処理 API へ渡す。
export const ADJUSTED_F0_SAMPLE_INTERVAL = 3;

/** @param {unknown} value */
export function normalizeProcessingAlgorithm(value) {
  if (value === 'coeiroink') return 'resampling';
  return COEIROINK_PROCESSING_ALGORITHMS.includes(String(value))
    ? String(value)
    : 'td-psola';
}

/** @param {unknown} value @param {string} name */
function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`COEIROINK API の ${name} が不正です`);
  }
  return value;
}

/** @param {unknown} value @param {string} name */
function requireFiniteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`COEIROINK API の ${name} が不正です`);
  }
  return number;
}

/** @param {unknown} value @param {string} name */
function requireInteger(value, name) {
  const number = requireFiniteNumber(value, name);
  if (!Number.isInteger(number)) {
    throw new Error(`COEIROINK API の ${name} は整数である必要があります`);
  }
  return number;
}

/** @param {unknown} value @param {string} name */
function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`COEIROINK API の ${name} が不正です`);
  }
  return value;
}

/** @param {string} text */
export function buildProsodyPayload(text) {
  return { text: requireString(text, 'text') };
}

/**
 * @param {{ speakerUuid: unknown, styleId: unknown, text: unknown, prosodyDetail: unknown, speedScale: unknown }} input
 */
export function buildPredictWithDurationPayload(input) {
  return {
    speakerUuid: requireString(input.speakerUuid, 'speakerUuid'),
    styleId: requireInteger(input.styleId, 'styleId'),
    text: requireString(input.text, 'text'),
    prosodyDetail: requireArray(input.prosodyDetail, 'prosodyDetail'),
    speedScale: requireFiniteNumber(input.speedScale, 'speedScale'),
  };
}

/**
 * @param {{ wavBase64?: unknown, moraDurations?: unknown, startTrimBuffer?: unknown, endTrimBuffer?: unknown }} prediction
 */
export function buildEstimateF0Payload(prediction) {
  const payload = {
    wavBase64: requireString(prediction.wavBase64, 'wavBase64'),
    moraDurations: requireArray(prediction.moraDurations, 'moraDurations'),
  };
  if (Number.isFinite(Number(prediction.startTrimBuffer))) {
    payload.startTrimBuffer = Number(prediction.startTrimBuffer);
  }
  if (Number.isFinite(Number(prediction.endTrimBuffer))) {
    payload.endTrimBuffer = Number(prediction.endTrimBuffer);
  }
  return payload;
}

/**
 * @param {{
 *   speakerUuid: unknown,
 *   styleId: unknown,
 *   text: unknown,
 *   prosodyDetail: unknown,
 *   params: Record<string, unknown>,
 *   outputSamplingRate: unknown,
 *   adjustedF0?: unknown,
 * }} input
 */
export function buildSynthesisPayload(input) {
  const adjustedF0 = requireArray(input.adjustedF0 ?? [], 'adjustedF0').map((value) =>
    requireFiniteNumber(value, 'adjustedF0'),
  );
  return {
    speakerUuid: requireString(input.speakerUuid, 'speakerUuid'),
    styleId: requireInteger(input.styleId, 'styleId'),
    text: requireString(input.text, 'text'),
    prosodyDetail: requireArray(input.prosodyDetail, 'prosodyDetail'),
    speedScale: requireFiniteNumber(input.params.speedScale, 'speedScale'),
    volumeScale: requireFiniteNumber(input.params.volumeScale, 'volumeScale'),
    pitchScale: requireFiniteNumber(input.params.pitchScale, 'pitchScale'),
    intonationScale: requireFiniteNumber(input.params.intonationScale, 'intonationScale'),
    prePhonemeLength: requireFiniteNumber(input.params.prePhonemeLength, 'prePhonemeLength'),
    postPhonemeLength: requireFiniteNumber(input.params.postPhonemeLength, 'postPhonemeLength'),
    outputSamplingRate: requireInteger(input.outputSamplingRate, 'outputSamplingRate'),
    processingAlgorithm: normalizeProcessingAlgorithm(input.params.processingAlgorithm),
    sampledIntervalValue: adjustedF0.length > 0 ? ADJUSTED_F0_SAMPLE_INTERVAL : 0,
    adjustedF0,
  };
}

/** @param {unknown} value */
export function parseWorldF0Response(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('F0 推定の応答が不正です');
  }
  const response = /** @type {{ f0?: unknown, moraDurations?: unknown }} */ (value);
  const f0 = requireArray(response.f0, 'f0').map((item) => requireFiniteNumber(item, 'f0'));
  const moraDurations = requireArray(response.moraDurations, 'moraDurations');
  return { f0, moraDurations };
}

/** @param {unknown} value */
export function parseSpeakersPathVariant(value) {
  const speakers = requireArray(value, 'speakers');
  return speakers.map((speaker) => {
    if (!speaker || typeof speaker !== 'object') {
      throw new Error('COEIROINK API の speaker が不正です');
    }
    const item = /** @type {{ speakerUuid?: unknown, speakerName?: unknown, styles?: unknown }} */ (speaker);
    return {
      ...item,
      speakerUuid: requireString(item.speakerUuid, 'speakerUuid'),
      speakerName: requireString(item.speakerName, 'speakerName'),
      styles: requireArray(item.styles, 'styles').map((style) => {
        if (!style || typeof style !== 'object') {
          throw new Error('COEIROINK API の style が不正です');
        }
        const entry = /** @type {{ styleId?: unknown, styleName?: unknown }} */ (style);
        return {
          ...entry,
          styleId: requireInteger(entry.styleId, 'styleId'),
          styleName: requireString(entry.styleName, 'styleName'),
        };
      }),
    };
  });
}
