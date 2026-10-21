const { copyFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const [source, destination] of [
  ['pixi.js/dist/pixi.min.js', 'pixi.min.js'],
  ['pixi.js/LICENSE', 'PIXI-LICENSE'],
  ['untitled-pixi-live2d-engine/dist/cubism.min.js', 'live2d.min.js'],
  ['untitled-pixi-live2d-engine/LICENSE', 'PIXI-LIVE2D-LICENSE'],
]) copyFileSync(path.join(root, 'node_modules', source), path.join(root, 'renderer/vendor', destination));
