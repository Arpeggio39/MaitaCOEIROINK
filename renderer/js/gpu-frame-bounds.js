import { boundsFromTiles } from './frame-bounds.mjs';

// GPUで8×8画素ごとに縮約し、CPUへの転送量を1/64にする。
export function createGpuFrameBounds(renderer, width, height) {
  const columns = Math.ceil(width / 8), rows = Math.ceil(height / 8);
  const source = PIXI.RenderTexture.create({ width, height, scaleMode: 'nearest' });
  const reduced = PIXI.RenderTexture.create({ width: columns, height: rows, scaleMode: 'nearest' });
  const geometry = new PIXI.Geometry({
    attributes: {
      aPosition: { buffer: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), format: 'float32x2' },
    },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = PIXI.Shader.from({
    gl: {
      vertex: `#version 300 es
        precision highp float;
        in vec2 aPosition;
        void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
      `,
      fragment: `#version 300 es
        precision highp float;
        uniform sampler2D uSource;
        uniform vec2 uSize;
        out vec4 finalColor;
        void main() {
          vec2 origin = floor(gl_FragCoord.xy) * 8.0;
          vec2 lo = vec2(9.0), hi = vec2(0.0);
          for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
            vec2 p = origin + vec2(float(x), float(y));
            if (p.x < uSize.x && p.y < uSize.y && texture(uSource, (p + 0.5) / uSize).a > 0.0) {
              vec2 point = vec2(float(x + 1), float(y + 1));
              lo = min(lo, point); hi = max(hi, point);
            }
          }
          finalColor = hi.y == 0.0 ? vec4(0.0) : vec4(lo, hi) / 255.0;
        }
      `,
    },
    resources: {
      uSource: source.source,
      frameUniforms: { uSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' } },
    },
  });
  const mesh = new PIXI.Mesh({ geometry, shader });
  mesh.state.blend = false;
  return {
    render(stage) { renderer.render({ container: stage, target: source, clear: true }); },
    read() {
      renderer.render({ container: mesh, target: reduced, clear: true });
      const { pixels } = renderer.extract.pixels({ target: reduced });
      return boundsFromTiles(pixels, columns, rows);
    },
    destroy() {
      mesh.destroy(); geometry.destroy(); shader.destroy(); source.destroy(true); reduced.destroy(true);
    },
  };
}
