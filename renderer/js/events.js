import { bridge } from './bridge.js';
import { els } from './dom.js';
import { activeSentenceKey } from './state.js';
import {
  clearSentenceSelection,
  renderIntonationUI,
  renderSegmentOverlay,
  refreshValueLabels,
  resetActiveSegmentParams,
  saveActiveSegmentParams,
  syncEditorOverlayScroll,
  syncSelectionFromEditorCursor,
} from './editor.js';
import {
  bumpActiveUpdatedAt,
  cancelProjectTitleEdit,
  commitProjectTitleEdit,
  newProject,
  startProjectTitleEdit,
  syncActiveProjectFromUi,
} from './projects.js';
import { schedulePersist } from './persist.js';
import {
  ensureSegmentProsody,
  getSegmentProsody,
  setProsodyIntonationEditorMode,
} from './prosody.js';
import { sentenceRangesFromText } from './segments.js';
import { activeProject } from './state.js';
import * as appState from './state.js';
import {
  closeExportChoiceModal,
  exportAllAudio,
  exportCombinedAudio,
  exportSelectedAudio,
  openExportChoiceModal,
  resizeWaveformCanvas,
  togglePlayback,
} from './audio.js';
import {
  appendDictionaryRow,
  closeDictionaryModal,
  openDictionaryModal,
  saveDictionaryFromModal,
} from './dictionary.js';
import {
  chooseExportDirectory,
  clearExportDirectory,
  closeExportSettingsModal,
  openExportSettingsModal,
  persistAppSettings,
} from './settings.js';

export function bindEvents() {
  els.projectTitle.addEventListener('click', () => startProjectTitleEdit());
  els.projectTitleInput.addEventListener('blur', () => commitProjectTitleEdit());
  els.projectTitleInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commitProjectTitleEdit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelProjectTitleEdit();
    }
  });

  els.btnNewProject.addEventListener('click', () => newProject());
  els.btnExportSettings.addEventListener('click', () => openExportSettingsModal());
  els.btnExportSettingsDismiss.addEventListener('click', () => closeExportSettingsModal());
  els.btnExportSettingsClose.addEventListener('click', () => closeExportSettingsModal());
  els.btnExportDirSelect.addEventListener('click', () => void chooseExportDirectory());
  els.btnExportDirClear.addEventListener('click', () => void clearExportDirectory());
  els.exportDirectoryEnabled.addEventListener('change', () => {
    if (els.exportDirectoryEnabled.checked && !els.exportDirectoryPath.classList.contains('has-path')) {
      void chooseExportDirectory().then(() => {
        if (!els.exportDirectoryPath.classList.contains('has-path')) {
          els.exportDirectoryEnabled.checked = false;
        }
      });
      return;
    }
    void persistAppSettings();
  });
  els.preventExportOverwrite.addEventListener('change', () => {
    void persistAppSettings();
  });
  els.exportTextFileEnabled.addEventListener('change', () => {
    els.exportTextEncodingGroup.disabled = !els.exportTextFileEnabled.checked;
    void persistAppSettings();
  });
  els.exportTextEncodingGroup.addEventListener('change', () => {
    void persistAppSettings();
  });
  els.btnUndo.addEventListener('click', () => {
    els.editor.focus();
    void bridge.nativeUndo();
  });
  els.btnRedo.addEventListener('click', () => {
    els.editor.focus();
    void bridge.nativeRedo();
  });
  els.btnPlay.addEventListener('click', () => void togglePlayback());
  els.btnExport.addEventListener('click', () => openExportChoiceModal());
  els.btnExportChoiceDismiss.addEventListener('click', () => closeExportChoiceModal());
  els.btnExportCombined.addEventListener('click', () => void exportCombinedAudio());
  els.btnExportSelected.addEventListener('click', () => void exportSelectedAudio());
  els.btnExportAll.addEventListener('click', () => void exportAllAudio());

  els.editor.addEventListener('input', () => {
    syncActiveProjectFromUi();
    bumpActiveUpdatedAt();
    schedulePersist();
  });

  els.editor.addEventListener('scroll', () => syncEditorOverlayScroll());
  els.editor.addEventListener('click', () => syncSelectionFromEditorCursor());
  els.editor.addEventListener('keyup', () => syncSelectionFromEditorCursor());

  const paramIds = [
    'speedScale',
    'pitchScale',
    'intonationScale',
    'volumeScale',
    'prePhonemeLength',
    'postPhonemeLength',
  ];
  for (const id of paramIds) {
    els[id].addEventListener('input', () => {
      if (activeSentenceKey == null) return;
      refreshValueLabels();
      saveActiveSegmentParams();
      renderSegmentOverlay();
    });
  }

  els.exportSamplingRate.addEventListener('change', () => void persistAppSettings());

  els.processingAlgorithm.addEventListener('change', () => {
    if (activeSentenceKey == null) return;
    saveActiveSegmentParams();
    renderSegmentOverlay();
  });

  els.btnSegmentParamReset.addEventListener('click', () => resetActiveSegmentParams());

  els.intonationEditorModeGroup.addEventListener('change', (ev) => {
    if (!(ev.target instanceof HTMLInputElement) || ev.target.name !== 'intonationEditorMode') return;
    appState.setIntonationEditorMode(ev.target.value);
    const p = activeProject();
    if (p && activeSentenceKey != null) {
      const entry = getSegmentProsody(p, activeSentenceKey);
      if (entry) {
        setProsodyIntonationEditorMode(entry, appState.intonationEditorMode);
        bumpActiveUpdatedAt();
        schedulePersist();
      }
    }
    renderIntonationUI();
    void persistAppSettings();
  });

  let intonationScrollSyncing = false;
  els.intonationTextStrip.addEventListener('scroll', () => {
    if (intonationScrollSyncing) return;
    intonationScrollSyncing = true;
    els.intonationSliderStrip.scrollLeft = els.intonationTextStrip.scrollLeft;
    intonationScrollSyncing = false;
  });
  els.intonationSliderStrip.addEventListener('scroll', () => {
    if (intonationScrollSyncing) return;
    intonationScrollSyncing = true;
    els.intonationTextStrip.scrollLeft = els.intonationSliderStrip.scrollLeft;
    intonationScrollSyncing = false;
  });

  els.btnRegenerateProsody.addEventListener('click', () => {
    if (activeSentenceKey == null) return;
    const p = activeProject();
    if (!p) return;
    const range = sentenceRangesFromText(els.editor.value).find((r) => r.key === activeSentenceKey);
    if (!range) return;
    els.btnRegenerateProsody.disabled = true;
    void ensureSegmentProsody(p, activeSentenceKey, range.text, { force: true }).finally(() => {
      els.btnRegenerateProsody.disabled = activeSentenceKey == null;
    });
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !els.exportChoiceModal.classList.contains('hidden')) {
      closeExportChoiceModal();
      return;
    }
    if (ev.key === 'Escape' && activeSentenceKey != null) {
      clearSentenceSelection();
    }
  });

  window.addEventListener('resize', () => {
    resizeWaveformCanvas();
    renderSegmentOverlay();
  });

  els.btnDictionary.addEventListener('click', () => openDictionaryModal());
  els.btnDictDismiss.addEventListener('click', () => closeDictionaryModal());
  els.btnDictClose.addEventListener('click', () => closeDictionaryModal());
  els.btnDictAddRow.addEventListener('click', () => appendDictionaryRow({ word: '', yomi: '', accent: 1 }));
  els.btnDictApply.addEventListener('click', () => void saveDictionaryFromModal());
  els.dictionaryModal.addEventListener('click', (ev) => {
    if (ev.target === els.dictionaryModal) closeDictionaryModal();
  });
  els.exportChoiceModal.addEventListener('click', (ev) => {
    if (ev.target === els.exportChoiceModal) closeExportChoiceModal();
  });
}
