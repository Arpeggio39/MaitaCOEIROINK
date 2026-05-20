const { app } = require('electron');
const path = require('path');

const PROJECTS_FILE = 'projects-data.json';
const APP_SETTINGS_FILE = 'app-settings.json';
const DICTIONARY_FILE = 'user-dictionary.json';

function userDataPath(filename) {
  return path.join(app.getPath('userData'), filename);
}

function projectsPath() {
  return userDataPath(PROJECTS_FILE);
}

function appSettingsPath() {
  return userDataPath(APP_SETTINGS_FILE);
}

function dictionaryPath() {
  return userDataPath(DICTIONARY_FILE);
}

module.exports = {
  projectsPath,
  appSettingsPath,
  dictionaryPath,
};
