const { registerStorageIpc } = require('./storage');
const { registerDictionaryIpc } = require('./dictionary');
const { registerDialogIpc } = require('./dialogs');
const { registerFsIpc } = require('./fs');
const { registerNativeIpc } = require('./native');
const { registerEngineIpc } = require('./engine');

function registerAllIpcHandlers() {
  registerStorageIpc();
  registerDictionaryIpc();
  registerDialogIpc();
  registerFsIpc();
  registerNativeIpc();
  registerEngineIpc();
}

module.exports = { registerAllIpcHandlers };
