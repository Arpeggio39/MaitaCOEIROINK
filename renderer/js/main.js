import { PARAM_DEFAULTS } from './constants.js';
import { bridge } from './bridge.js';
import { initEditor, refreshValueLabels, updateSegmentPanelsVisibility } from './editor.js';
import { bindEvents } from './events.js';
import { loadDictionaryFromDisk } from './dictionary.js';
import { initConnectPrompt } from './engine.js';
import { resizeWaveformCanvas } from './audio.js';
import { migrateProjects, selectProject, syncActiveProjectFromUi } from './projects.js';
import { loadAppSettingsFromDisk } from './settings.js';
import { setSyncUiBeforeSave } from './persist.js';
import * as appState from './state.js';

async function boot() {
  initEditor();
  setSyncUiBeforeSave(() => {
    syncActiveProjectFromUi();
  });

  bindEvents();
  updateSegmentPanelsVisibility();
  refreshValueLabels();
  resizeWaveformCanvas();

  await loadDictionaryFromDisk();
  await loadAppSettingsFromDisk();

  const blob = await bridge.loadProjects();
  if (blob && Array.isArray(blob.projects) && blob.projects.length > 0) {
    appState.setProjects(blob.projects);
    migrateProjects(appState.projects);
    appState.setActiveId(
      blob.activeId && appState.projects.some((p) => p.id === blob.activeId)
        ? blob.activeId
        : appState.projects[0].id,
    );
  } else {
    const now = new Date().toISOString();
    appState.setProjects([
      {
        id: crypto.randomUUID(),
        title: '無題',
        text: '',
        params: { ...PARAM_DEFAULTS },
        sentenceParamsByKey: {},
        sentenceProsodyByKey: {},
        updatedAt: now,
      },
    ]);
    appState.setActiveId(appState.projects[0].id);
  }

  initConnectPrompt();
  selectProject(appState.activeId);
}

void boot();
