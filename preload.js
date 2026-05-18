const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maita', {
  loadProjects: () => ipcRenderer.invoke('storage:loadProjects'),
  saveProjects: (data) => ipcRenderer.invoke('storage:saveProjects', data),
  saveWavDialog: (defaultName) => ipcRenderer.invoke('dialog:saveWav', defaultName),
  confirmDeleteProject: () => ipcRenderer.invoke('dialog:confirmDeleteProject'),
  writeWavFile: (filePath, arrayBuffer) => ipcRenderer.invoke('fs:writeWav', filePath, arrayBuffer),
  nativeUndo: () => ipcRenderer.invoke('native:undo'),
  nativeRedo: () => ipcRenderer.invoke('native:redo'),
});
