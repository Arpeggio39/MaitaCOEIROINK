export function mergeFrameBounds(a, b) {
  if (!b) return a;
  if (!a) return { ...b };
  return { left: Math.min(a.left,b.left), top: Math.min(a.top,b.top), right: Math.max(a.right,b.right), bottom: Math.max(a.bottom,b.bottom) };
}
// One RGBA8 texel carries the exact nontransparent bounding box of an 8x8 tile.
export function boundsFromTiles(pixels, columns, rows, tileSize = 8) {
  let bounds = null;
  for (let y=0;y<rows;y++) for (let x=0;x<columns;x++) {
    const i=(y*columns+x)*4;
    if (!pixels[i+3]) continue;
    bounds=mergeFrameBounds(bounds,{left:x*tileSize+pixels[i]-1,top:y*tileSize+pixels[i+1]-1,right:x*tileSize+pixels[i+2]-1,bottom:y*tileSize+pixels[i+3]-1});
  }
  return bounds;
}
export function frameFromBounds(bounds) {
  if (!bounds) throw new Error('全フレームが透明なため、キャラクターの描画範囲を取得できませんでした。');
  const padding=Math.max(4,Math.ceil((bounds.bottom-bounds.top+1)*.01));
  const even=x=>Math.ceil(x/2)*2;
  return {width:even(bounds.right-bounds.left+1+padding*2),height:even(bounds.bottom-bounds.top+1+padding*2),offsetX:padding-bounds.left,offsetY:padding-bounds.top};
}
