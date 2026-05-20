export const MAITA_UUID = '24e48b20-c14c-11f0-a12e-0242ac1c000c';

export const PARAM_DEFAULTS = {
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  processingAlgorithm: 'td-psola',
};

export const PLAYBACK_SAMPLE_RATE = 44100;
export const EXPORT_SAMPLE_RATE_DEFAULT = 44100;
export const GAP_SILENCE_SEC = 0.28;
export const DEFAULT_API_BASE = 'http://127.0.0.1:50032';
export const MORA_PITCH_DEFAULT = 6;
export const MORA_PITCH_MIN = 3;
export const MORA_PITCH_MAX = 9;
export const INTONATION_CHAR_WIDTH = 36;

/** OpenAPI 上は整数のみ。COEIROINK でよく使う値から選択 */
export const SAMPLE_RATE_OPTIONS = [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000];

/** 句読点（区切りに含める） */
export const SEGMENT_PUNCT_RE =
  /[。、．.,!?！？…：:；;「」『』【】()（）\[\]{}'"‘’“”〜～]/u;
