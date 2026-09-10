# Live2D rendering dependencies

The character-video frame loads these local files without a CDN at runtime.

- `pixi.min.js`: pixi.js 6.5.10, MIT (`PIXI-LICENSE`).
- `cubism4.min.js`: pixi-live2d-display 0.4.0, MIT (`PIXI-LIVE2D-LICENSE`).
- `live2dcubismcore.min.js`: Live2D Cubism Core, retrieved from the official
  https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js on 2026-09-10.
  Its copyright and proprietary license link are preserved in the file header.
  Core is not covered by this project's MIT license.

After updating either npm dependency, run `node scripts/copy-video-vendor.cjs`
to refresh its checked-in browser bundle and license. Cubism Core is updated
separately from the official SDK.

The video frame alone permits `unsafe-eval` for Pixi's shader setup. The main
editor's Content Security Policy remains unchanged.
