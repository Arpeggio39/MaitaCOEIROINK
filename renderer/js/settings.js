import { EXPORT_SAMPLE_RATE_DEFAULT } from './constants.js';
import { bridge } from './bridge.js';
import { els } from './dom.js';
import * as appState from './state.js';
import { coerceSampleRate, showToast } from './utils.js';
import { normalizeExportSettings } from './export-utils.mjs';

export function getExportSamplingRate() {
  return coerceSampleRate(Number(els.exportSamplingRate.value) || appState.exportSamplingRate);
}

export function applyExportSamplingRateToControl() {
  els.exportSamplingRate.value = String(coerceSampleRate(appState.exportSamplingRate));
}

export function applyExportSettingsToControls() {
  const directory = appState.exportDirectory || '';
  els.exportDirectoryPath.value = directory || '未設定';
  els.exportDirectoryPath.title = directory;
  els.exportDirectoryPath.classList.toggle('has-path', Boolean(directory));
  els.btnExportDirClear.disabled = !directory;
  els.exportDirectoryEnabled.checked = Boolean(directory && appState.exportDirectoryEnabled);
  els.preventExportOverwrite.checked = appState.preventExportOverwrite;
  els.exportTextFileEnabled.checked = appState.exportTextFileEnabled;
  els.exportTextEncodingGroup.disabled = !appState.exportTextFileEnabled;
  const encoding = appState.exportTextEncoding === 'shift_jis' ? 'shift_jis' : 'utf8';
  const radio = els.exportTextEncodingGroup.querySelector(`input[value="${encoding}"]`);
  if (radio) radio.checked = true;
}

export async function persistAppSettings() {
  const rate = getExportSamplingRate();
  appState.setExportSamplingRate(rate);
  appState.setExportDirectoryEnabled(Boolean(appState.exportDirectory && els.exportDirectoryEnabled.checked));
  appState.setPreventExportOverwrite(els.preventExportOverwrite.checked);
  appState.setExportTextFileEnabled(els.exportTextFileEnabled.checked);
  const selectedEncoding = els.exportTextEncodingGroup.querySelector('input[name="exportTextEncoding"]:checked')?.value;
  appState.setExportTextEncoding(selectedEncoding);
  await bridge.saveAppSettings({
    exportSamplingRate: rate,
    exportDirectory: appState.exportDirectory,
    exportDirectoryEnabled: appState.exportDirectoryEnabled,
    preventExportOverwrite: appState.preventExportOverwrite,
    exportTextFileEnabled: appState.exportTextFileEnabled,
    exportTextEncoding: appState.exportTextEncoding,
  });
}

export async function loadAppSettingsFromDisk() {
  try {
    const blob = await bridge.loadAppSettings();
    if (blob && blob.exportSamplingRate != null) {
      appState.setExportSamplingRate(coerceSampleRate(blob.exportSamplingRate));
    }
    const settings = normalizeExportSettings(blob);
    appState.setExportDirectory(settings.exportDirectory);
    appState.setExportDirectoryEnabled(settings.exportDirectoryEnabled);
    appState.setPreventExportOverwrite(settings.preventExportOverwrite);
    appState.setExportTextFileEnabled(settings.exportTextFileEnabled);
    appState.setExportTextEncoding(settings.exportTextEncoding);
  } catch (_) {
    appState.setExportSamplingRate(EXPORT_SAMPLE_RATE_DEFAULT);
    appState.setExportDirectory('');
    appState.setExportDirectoryEnabled(false);
    appState.setPreventExportOverwrite(false);
    appState.setExportTextFileEnabled(false);
    appState.setExportTextEncoding('utf8');
  }
  applyExportSamplingRateToControl();
  applyExportSettingsToControls();
}

export function openExportSettingsModal() {
  applyExportSettingsToControls();
  els.exportSettingsModal.classList.remove('hidden');
}

export function closeExportSettingsModal() {
  els.exportSettingsModal.classList.add('hidden');
}

export async function chooseExportDirectory() {
  try {
    const directory = await bridge.selectExportDirectory(appState.exportDirectory || undefined);
    if (!directory) return;
    appState.setExportDirectory(directory);
    appState.setExportDirectoryEnabled(true);
    applyExportSettingsToControls();
    await persistAppSettings();
    appState.requestKanjishikunExport();
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

export async function clearExportDirectory() {
  appState.setExportDirectory('');
  appState.setExportDirectoryEnabled(false);
  applyExportSettingsToControls();
  await persistAppSettings();
  appState.requestKanjishikunExport();
}
