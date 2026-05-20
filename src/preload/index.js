const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maita', {
  loadProjects: () => ipcRenderer.invoke('storage:loadProjects'),
  saveProjects: (data) => ipcRenderer.invoke('storage:saveProjects', data),
  loadAppSettings: () => ipcRenderer.invoke('storage:loadAppSettings'),
  saveAppSettings: (data) => ipcRenderer.invoke('storage:saveAppSettings', data),
  saveWavDialog: (defaultName) => ipcRenderer.invoke('dialog:saveWav', defaultName),
  confirmDeleteProject: () => ipcRenderer.invoke('dialog:confirmDeleteProject'),
  loadDictionary: () => ipcRenderer.invoke('dictionary:load'),
  saveDictionary: (data) => ipcRenderer.invoke('dictionary:save', data),
  writeWavFile: (filePath, arrayBuffer) => ipcRenderer.invoke('fs:writeWav', filePath, arrayBuffer),
  nativeUndo: () => ipcRenderer.invoke('native:undo'),
  nativeRedo: () => ipcRenderer.invoke('native:redo'),
});
