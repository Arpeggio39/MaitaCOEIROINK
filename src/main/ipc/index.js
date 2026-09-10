const { registerStorageIpc } = require('./storage');
const { registerDictionaryIpc } = require('./dictionary');
const { registerDialogIpc } = require('./dialogs');
const { registerFsIpc } = require('./fs');
const { registerNativeIpc } = require('./native');
const { registerVideoIpc } = require('./video');

function registerAllIpcHandlers() {
  registerStorageIpc();
  registerDictionaryIpc();
  registerDialogIpc();
  registerFsIpc();
  registerNativeIpc();
  registerVideoIpc();
}

module.exports = { registerAllIpcHandlers };
