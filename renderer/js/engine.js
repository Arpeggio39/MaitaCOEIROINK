import { MAITA_UUID } from './constants.js';
import * as appState from './state.js';
import { resolveApiBase } from './coeiroink-api.js';
import { fetchWithTimeout } from './utils.js';

/** 合成・韻律 API 呼び出し時に styleId が必要な場合だけ取得する */
export async function resolveMaitaStyleId() {
  if (appState.maitaStyleId) return appState.maitaStyleId;

  try {
    const base = await resolveApiBase();
    const res = await fetchWithTimeout(`${base}/v1/speakers_path_variant`, {}, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {{ speakerUuid: string, styles: { styleId: number, styleName: string }[]}[]} */
    const list = await res.json();
    const maita = list.find((s) => s.speakerUuid === MAITA_UUID);
    if (!maita?.styles?.length) {
      throw new Error('この COEIROINK に琵音マイタが見つかりません。');
    }
    const preferred =
      maita.styles.find((s) => s.styleName === 'のーまる') ||
      maita.styles.find((s) => s.styleName.includes('のーまる'));
    appState.setMaitaStyleId(preferred ? preferred.styleId : maita.styles[0].styleId);
    return appState.maitaStyleId;
  } catch (err) {
    if (err instanceof Error && err.message.includes('琵音マイタ')) throw err;
    throw new Error('COEIROINK に接続できません。COEIROINK を起動してから再度お試しください。');
  }
}
