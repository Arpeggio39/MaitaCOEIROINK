const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maita', {
  videoCapacity: () => ipcRenderer.invoke('video:capacity'),
  beginVideo: options => ipcRenderer.invoke('video:begin', options),
  writeVideoFrame: (id, bytes) => ipcRenderer.invoke('video:frame', id, bytes),
  finishVideo: id => ipcRenderer.invoke('video:finish', id),
  abortVideo: id => ipcRenderer.invoke('video:abort', id),
  saveCharacterVideo: (buffer, options) => ipcRenderer.invoke('video:save', buffer, options),
  loadProjects: () => ipcRenderer.invoke('storage:loadProjects'),
  saveProjects: (data) => ipcRenderer.invoke('storage:saveProjects', data),
  saveProjectsSync: (data) => ipcRenderer.sendSync('storage:saveProjectsSync', data),
  loadAppSettings: () => ipcRenderer.invoke('storage:loadAppSettings'),
  saveAppSettings: (data) => ipcRenderer.invoke('storage:saveAppSettings', data),
  saveWavDialog: (defaultName) => ipcRenderer.invoke('dialog:saveWav', defaultName),
  selectExportDirectory: (defaultPath) => ipcRenderer.invoke('dialog:selectExportDirectory', defaultPath),
  confirmDeleteProject: () => ipcRenderer.invoke('dialog:confirmDeleteProject'),
  loadDefaultDictionary: () => ipcRenderer.invoke('dictionary:defaults'),
  loadDictionary: () => ipcRenderer.invoke('dictionary:load'),
  saveDictionary: (data) => ipcRenderer.invoke('dictionary:save', data),
  resolveExportFilePath: (directoryPath, defaultName, options) =>
    ipcRenderer.invoke('fs:resolveExportFilePath', directoryPath, defaultName, options),
  writeWavFile: (filePath, arrayBuffer) => ipcRenderer.invoke('fs:writeWav', filePath, arrayBuffer),
  writeTextFile: (filePath, text, encoding) => ipcRenderer.invoke('fs:writeText', filePath, text, encoding),
  nativeUndo: () => ipcRenderer.invoke('native:undo'),
  nativeRedo: () => ipcRenderer.invoke('native:redo'),
});
