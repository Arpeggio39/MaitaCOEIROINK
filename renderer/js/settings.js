import { EXPORT_SAMPLE_RATE_DEFAULT } from './constants.js';
import { bridge } from './bridge.js';
import { els } from './dom.js';
import * as appState from './state.js';
import { coerceSampleRate } from './utils.js';

export function getExportSamplingRate() {
  return coerceSampleRate(Number(els.exportSamplingRate.value) || appState.exportSamplingRate);
}

export function applyExportSamplingRateToControl() {
  els.exportSamplingRate.value = String(coerceSampleRate(appState.exportSamplingRate));
}

export async function persistAppSettings() {
  const rate = getExportSamplingRate();
  appState.setExportSamplingRate(rate);
  await bridge.saveAppSettings({ exportSamplingRate: rate });
}

export async function loadAppSettingsFromDisk() {
  try {
    const blob = await bridge.loadAppSettings();
    if (blob && blob.exportSamplingRate != null) {
      appState.setExportSamplingRate(coerceSampleRate(blob.exportSamplingRate));
    }
  } catch (_) {
    appState.setExportSamplingRate(EXPORT_SAMPLE_RATE_DEFAULT);
  }
  applyExportSamplingRateToControl();
}
