const { registerStorageIpc } = require('./storage');
const { registerDictionaryIpc } = require('./dictionary');
const { registerDialogIpc } = require('./dialogs');
const { registerFsIpc } = require('./fs');
const { registerNativeIpc } = require('./native');

function registerAllIpcHandlers() {
  registerStorageIpc();
  registerDictionaryIpc();
  registerDialogIpc();
  registerFsIpc();
  registerNativeIpc();
}

module.exports = { registerAllIpcHandlers };
