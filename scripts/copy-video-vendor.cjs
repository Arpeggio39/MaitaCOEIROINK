const { copyFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const [source, destination] of [
  ['pixi.js/dist/browser/pixi.min.js', 'pixi.min.js'],
  ['pixi.js/LICENSE', 'PIXI-LICENSE'],
  ['pixi-live2d-display/dist/cubism4.min.js', 'cubism4.min.js'],
  ['pixi-live2d-display/LICENSE', 'PIXI-LIVE2D-LICENSE'],
]) copyFileSync(path.join(root, 'node_modules', source), path.join(root, 'renderer/vendor', destination));
