// A small map of a loaded JJ2 level for the menu: one pixel per tile, coloured
// with the average colour of its sprite-layer tile (or the layer behind it).

import { tilePixels } from './files.js';

const cache = new Map();

export function preview(file, ts) {
  if (cache.has(file)) return cache.get(file);
  const L4 = file.layers[3]; const L5 = file.layers[4];
  const w = L4.w; const h = L4.h;
  const avg = new Map();
  const px = new Uint8ClampedArray(4096);
  const colour = (word) => {
    const id = word & (file.maxTiles - 1);
    if (!id || id >= ts.count) return null;
    if (!avg.has(id)) {
      tilePixels(ts, id, px);
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let i = 0; i < 4096; i += 4) if (px[i + 3]) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      avg.set(id, n > 200 ? [r / n, g / n, b / n] : null);
    }
    return avg.get(id);
  };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const front = L4.tiles && colour(L4.tiles[y * w + x]);
      const back = !front && L5.used && L5.tiles && L5.w === w ? colour(L5.tiles[y * w + x]) : null;
      const col = front || (back ? back.map((v) => v * 0.45) : [12, 10, 28]);
      const k = (y * w + x) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(file, c);
  return c;
}
