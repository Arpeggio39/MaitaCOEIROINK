import { DEFAULT_API_BASE, MAITA_UUID } from './constants.js';
import * as appState from './state.js';
import { fetchWithTimeout } from './utils.js';

/** 合成・韻律 API 呼び出し時に styleId が必要な場合だけ取得する */
export async function resolveMaitaStyleId() {
  if (appState.maitaStyleId) return appState.maitaStyleId;

  const bases = [DEFAULT_API_BASE, 'http://localhost:50032'];
  let lastErr;

  for (const base of bases) {
    try {
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
      lastErr = err;
    }
  }

  if (lastErr instanceof Error && lastErr.message.includes('琵音マイタ')) throw lastErr;
  throw new Error('COEIROINK に接続できません。COEIROINK を起動してから再度お試しください。');
}
