import { PARAM_DEFAULTS } from './constants.js';
import { bridge } from './bridge.js';
import { els } from './dom.js';
import { migrateSentenceParamsForProject } from './segments.js';
import {
  activeId,
  activeProject,
  activeSentenceKey,
  lastSentenceRanges,
  projects,
  setActiveId,
  setActiveSentenceKey,
  setProjects,
} from './state.js';
import { showToast } from './utils.js';
import { schedulePersist, persistProjects } from './persist.js';

export function deriveDefaultTitle(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '無題';
  return flat.length > 10 ? flat.slice(0, 10) : flat;
}

/**
 * @param {import('./state.js').Project} project
 */
export function syncTitleFromTextIfAuto(project) {
  if (project.titleEdited) return;
  project.title = deriveDefaultTitle(project.text || '');
}

export function renderProjectTitleDisplay() {
  const p = activeProject();
  els.projectTitle.textContent = p?.title || '無題';
}

export function startProjectTitleEdit() {
  const p = activeProject();
  if (!p) return;
  els.projectTitleInput.value = p.title || '無題';
  els.projectTitle.hidden = true;
  els.projectTitleInput.hidden = false;
  els.projectTitleInput.focus();
  els.projectTitleInput.select();
}

export function commitProjectTitleEdit() {
  if (els.projectTitleInput.hidden) return;
  const p = activeProject();
  if (!p) return;
  const next = els.projectTitleInput.value.trim() || '無題';
  p.title = next;
  p.titleEdited = true;
  els.projectTitleInput.hidden = true;
  els.projectTitle.hidden = false;
  renderProjectTitleDisplay();
  renderProjectList();
  bumpActiveUpdatedAt();
  schedulePersist();
}

export function cancelProjectTitleEdit() {
  els.projectTitleInput.hidden = true;
  els.projectTitle.hidden = false;
  renderProjectTitleDisplay();
}

export function bumpActiveUpdatedAt() {
  const p = activeProject();
  if (p) p.updatedAt = new Date().toISOString();
}

/**
 * @param {string} iso
 */
function formatUpdatedLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * @param {unknown[]} list
 */
export function migrateProjects(list) {
  const now = new Date().toISOString();
  for (const raw of list) {
    const p = /** @type {import('./state.js').Project} */ (raw);
    if (!p.updatedAt) p.updatedAt = now;
    if (p.params) delete p.params.outputSamplingRate;
    if (p.sentenceParamsByKey) {
      for (const k of Object.keys(p.sentenceParamsByKey)) {
        delete p.sentenceParamsByKey[k].outputSamplingRate;
      }
    }
    if (!Array.isArray(p.sentenceParams) && !p.sentenceParamsByKey) p.sentenceParamsByKey = {};
    if (!p.sentenceProsodyByKey) p.sentenceProsodyByKey = {};
    for (const k of Object.keys(p.sentenceProsodyByKey)) {
      delete p.sentenceProsodyByKey[k].loading;
    }
    if (p.titleEdited == null) p.titleEdited = false;
    migrateSentenceParamsForProject(p);
  }
}

/** @type {(() => void) | null} */
let editorHooks = null;

/** @param {{ saveActiveSegmentParams: () => void, renderSegmentOverlay: () => void, updateSegmentPanelsVisibility: () => void }} hooks */
export function setEditorHooks(hooks) {
  editorHooks = hooks;
}

export function syncActiveProjectFromUi() {
  const p = activeProject();
  if (!p) return;
  if (activeSentenceKey != null) editorHooks?.saveActiveSegmentParams();
  p.text = els.editor.value;
  syncTitleFromTextIfAuto(p);
  renderProjectTitleDisplay();
  renderProjectList();
  editorHooks?.renderSegmentOverlay();
}

export function renderProjectList() {
  els.projectList.innerHTML = '';
  const sorted = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  for (const p of sorted) {
    const li = document.createElement('li');
    li.className = `project-item${p.id === activeId ? ' active' : ''}`;
    li.setAttribute('role', 'option');
    li.dataset.id = p.id;
    const updatedLabel = formatUpdatedLabel(p.updatedAt);
    li.innerHTML = `
        <div class="project-item-main">
          <div class="project-item-title"></div>
          <div class="project-item-meta"></div>
        </div>
        <button type="button" class="project-item-delete" aria-label="プロジェクトを削除">×</button>
      `;
    li.querySelector('.project-item-title').textContent = p.title || '無題';
    li.querySelector('.project-item-meta').textContent = updatedLabel ? `更新 ${updatedLabel}` : '';
    li.addEventListener('click', (ev) => {
      if (/** @type {Element} */ (ev.target).closest('.project-item-delete')) return;
      selectProject(p.id);
    });
    li.querySelector('.project-item-delete').addEventListener('click', (ev) => {
      ev.stopPropagation();
      void deleteProject(p.id);
    });
    els.projectList.appendChild(li);
  }
}

export async function deleteProject(id) {
  if (projects.length <= 1) {
    showToast('最後のプロジェクトは削除できません');
    return;
  }
  const confirmed = await bridge.confirmDeleteProject();
  if (!confirmed) return;

  const wasActive = activeId === id;
  setProjects(projects.filter((p) => p.id !== id));

  if (wasActive) {
    setActiveId(projects[0].id);
    selectProject(activeId);
  } else {
    renderProjectList();
    void persistProjects();
  }
}

export function selectProject(id) {
  if (activeId !== id) {
    if (activeSentenceKey != null) editorHooks?.saveActiveSegmentParams();
    syncActiveProjectFromUi();
  }
  setActiveId(id);
  setActiveSentenceKey(null);
  lastSentenceRanges.length = 0;
  const p = activeProject();
  if (!p) return;
  migrateSentenceParamsForProject(p);
  els.editor.value = p.text || '';
  editorHooks?.updateSegmentPanelsVisibility();
  renderProjectTitleDisplay();
  renderProjectList();
  editorHooks?.renderSegmentOverlay();
  schedulePersist();
}

export function newProject() {
  syncActiveProjectFromUi();
  const now = new Date().toISOString();
  /** @type {import('./state.js').Project} */
  const p = {
    id: crypto.randomUUID(),
    title: '無題',
    text: '',
    params: { ...PARAM_DEFAULTS },
    sentenceParamsByKey: {},
    sentenceProsodyByKey: {},
    updatedAt: now,
  };
  projects.unshift(p);
  setActiveId(p.id);
  selectProject(p.id);
  els.editor.focus();
}
