import { bridge } from './bridge.js';
import { activeId, projects, saveTimer } from './state.js';

/** @type {(() => void) | null} */
let syncUiBeforeSave = null;

export function setSyncUiBeforeSave(fn) {
  syncUiBeforeSave = fn;
}

export function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void persistProjects(), 320);
}

export async function persistProjects() {
  syncUiBeforeSave?.();
  await bridge.saveProjects({ projects, activeId });
}
