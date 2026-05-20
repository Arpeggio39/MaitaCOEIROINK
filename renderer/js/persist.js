import { bridge } from './bridge.js';
import { activeId, projects, saveTimer, setSaveTimer } from './state.js';

/** @type {(() => void) | null} */
let syncUiBeforeSave = null;

export function setSyncUiBeforeSave(fn) {
  syncUiBeforeSave = fn;
}

export function schedulePersist() {
  clearTimeout(saveTimer);
  setSaveTimer(setTimeout(() => void persistProjects(), 320));
}

function stripTransientProsodyState() {
  for (const p of projects) {
    if (!p.sentenceProsodyByKey) continue;
    for (const k of Object.keys(p.sentenceProsodyByKey)) {
      delete p.sentenceProsodyByKey[k].loading;
    }
  }
}

export async function persistProjects() {
  syncUiBeforeSave?.();
  stripTransientProsodyState();
  await bridge.saveProjects({ projects, activeId });
}
