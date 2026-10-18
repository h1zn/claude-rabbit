// A small map of a loaded JJ2 level for the menu: one pixel per tile, coloured
// with the average colour of its sprite-layer tile (or the layer behind it).

import { tilePixels } from './files.js';

const cache = new Map();

export function preview(file, ts) {
  if (cache.has(file)) return cache.get(file);
  const L4 = file.layers[3];
  const w = L4.w; const h = L4.h;
  // Every layer that lines up with the sprite layer (not tiled), front ones
  // first: some maps are drawn on layers 2 or 3, not just 4 and 5.
  const layers = [3, 4, 2, 5, 1, 0, 6].map((i) => file.layers[i])
    .filter((L) => L && L.used !== false && L.tiles && !L.tileX && !L.tileY && L.w >= w * 0.9 && L.h >= h * 0.9);
  const avg = new Map();
  const px = new Uint8ClampedArray(4096);
  const first = file.maxTiles - file.anims.length;
  const colour = (word) => {
    let id = word & (file.maxTiles - 1);
    // Animated tiles: their first frame.
    for (let k = 0; id >= first && k < 4; k++) {
      const a = file.anims[id - first];
      id = a && a.frames.length ? a.frames[0] & (file.maxTiles - 1) : 0;
    }
    if (!id || id >= ts.count) return null;
    if (!avg.has(id)) {
      tilePixels(ts, id, px);
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let i = 0; i < 4096; i += 4) if (px[i + 3]) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      avg.set(id, n > 16 ? [r / n, g / n, b / n] : null);
    }
    return avg.get(id);
  };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  let lit = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let col = null;
      for (let k = 0; k < layers.length && !col; k++) {
        const L = layers[k];
        if (x >= L.w || y >= L.h) continue;
        const got = colour(L.tiles[y * L.w + x]);
        if (got) col = L === L4 || k === 0 ? got : got.map((v) => v * 0.45);
      }
      if (col) lit++;
      else col = [12, 10, 28];
      const k = (y * w + x) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  c.lit = lit / (w * h);
  cache.set(file, c);
  return c;
}
