const VOICE_PACK_VERSION = '1.0.0';

function voicePackFolder() {
  return `bionmaita-${VOICE_PACK_VERSION}`;
}

function voicePackArtifact() {
  return `${voicePackFolder()}.zip`;
}

module.exports = {
  VOICE_PACK_VERSION,
  voicePackFolder,
  voicePackArtifact,
};
