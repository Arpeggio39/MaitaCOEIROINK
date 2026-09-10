// Fit the visible artwork, not the model's transparent authoring canvas.
export function fitCharacterFrame(pixels, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 8) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('キャラクターの描画範囲を取得できませんでした。');
  const bodyHeight = bottom - top + 1;
  // Reserve a small, fixed margin for the full range of conversation motion.
  const paddingX = Math.ceil(bodyHeight * 0.055);
  const paddingY = Math.ceil(bodyHeight * 0.03);
  const even = value => Math.ceil(value / 2) * 2;
  return {
    width: even(right - left + 1 + paddingX * 2),
    height: even(bodyHeight + paddingY * 2),
    offsetX: paddingX - left,
    offsetY: paddingY - top,
  };
}
