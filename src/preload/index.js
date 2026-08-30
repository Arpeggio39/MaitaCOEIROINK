const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maita', {
  loadProjects: () => ipcRenderer.invoke('storage:loadProjects'),
  saveProjects: (data) => ipcRenderer.invoke('storage:saveProjects', data),
  saveProjectsSync: (data) => ipcRenderer.sendSync('storage:saveProjectsSync', data),
  loadAppSettings: () => ipcRenderer.invoke('storage:loadAppSettings'),
  saveAppSettings: (data) => ipcRenderer.invoke('storage:saveAppSettings', data),
  saveWavDialog: (defaultName) => ipcRenderer.invoke('dialog:saveWav', defaultName),
  selectExportDirectory: (defaultPath) => ipcRenderer.invoke('dialog:selectExportDirectory', defaultPath),
  confirmDeleteProject: () => ipcRenderer.invoke('dialog:confirmDeleteProject'),
  loadDictionary: () => ipcRenderer.invoke('dictionary:load'),
  saveDictionary: (data) => ipcRenderer.invoke('dictionary:save', data),
  resolveExportFilePath: (directoryPath, defaultName, options) =>
    ipcRenderer.invoke('fs:resolveExportFilePath', directoryPath, defaultName, options),
  writeWavFile: (filePath, arrayBuffer) => ipcRenderer.invoke('fs:writeWav', filePath, arrayBuffer),
  writeTextFile: (filePath, text, encoding) => ipcRenderer.invoke('fs:writeText', filePath, text, encoding),
  nativeUndo: () => ipcRenderer.invoke('native:undo'),
  nativeRedo: () => ipcRenderer.invoke('native:redo'),
});
