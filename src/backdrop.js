// Parallax backgrounds cut from a tileset. Each layer is a rectangle of tiles
// (col, row, cols, rows) drawn repeating sideways; `fill` layers also repeat
// downwards (sky textures). `sx`/`sy` are parallax factors (0 = fixed to the
// screen, 1 = moves with the world); `bottom` places the layer's lower edge
// that many px above the bottom of the view when the camera rests at the
// level's ground; `gap` leaves empty space between repeats; `under` paints the
// area below the layer with its bottom row's colour so nothing shows through.

import { VIEW_H, VIEW_W } from './config.js';

export const BACKDROPS = {
  winter: [
    { rect: [0, 42, 8, 8], fill: true, sx: 0.04, sy: 0.02 },
    { rect: [0, 36, 10, 6], sx: 0.12, sy: 0.06, bottom: 70, under: true, clear: [[0, 0, 7, 1]] },
    { rect: [0, 62, 10, 4], sx: 0.25, sy: 0.12, bottom: 20, under: true },
    { rect: [2, 66, 8, 12], sx: 0.3, sy: 0.18, bottom: -40, gap: 520, strip: true },
  ],
  castle: [
    { rect: [0, 60, 7, 6], fill: true, sx: 0.3, sy: 0.3, dim: 0.45 },
  ],
  town: [
    { rect: [0, 7, 4, 2], fill: true, stretch: true, sx: 0.04, sy: 0.02 },
    { rect: [0, 86, 8, 10], sx: 0.2, sy: 0.1, bottom: 30, gap: 420, dim: 0.65 },
  ],
  tube: [
    { rect: [0, 24, 10, 6], fill: true, sx: 0.3, sy: 0.3, dim: 0.5 },
  ],
  // JJ2's night beach: its blue cloud sky, purple rock spires, and the
  // shipwreck on the sea in front.
  beach: [
    { rect: [0, 24, 8, 5], fill: true, stretch: true, sx: 0.04, sy: 0.02 },
    { rect: [5, 36, 5, 12], sx: 0.12, sy: 0.06, bottom: 70, gap: 420, strip: true, purple: true, dim: 0.75 },
    { rect: [0, 48, 10, 6], sx: 0.25, sy: 0.12, bottom: -30, gap: 360, strip: true, under: true },
  ],
};

// Tileset backdrops drawn over a procedural sky instead of a sky tile.
export const BACKDROP_SKY = {};

function cutLayer(tileset, layer) {
  const [c, r, cols, rows] = layer.rect;
  const canvas = document.createElement('canvas');
  canvas.width = cols * 32;
  canvas.height = rows * 32;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(tileset.image, c * 32, r * 32, cols * 32, rows * 32, 0, 0, cols * 32, rows * 32);
  for (const [x, y, w, h] of layer.clear || []) ctx.clearRect(x * 32, y * 32, w * 32, h * 32);
  // Dimmed layers sit further back (and keep busy interiors readable).
  if (layer.dim) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(6,2,16,${1 - layer.dim})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Remove the tileset's editor guide lines (light lavender grid, blue labels).
  if (layer.strip) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lav = d[i] > 220 && d[i + 1] > 170 && d[i + 1] < 210 && d[i + 2] > 245;
      const label = d[i] < 12 && d[i + 1] < 12 && d[i + 2] > 160;
      const filler = d[i] === 0 && d[i + 1] < 70 && d[i + 2] > 120;  // blue placeholder tiles
      // `purple` layers keep only purple pixels (the rock spire, not the
      // wooden tiles packed next to it on the sheet).
      const other = layer.purple && !(d[i + 2] > d[i + 1] + 25 && d[i] > d[i + 1] && d[i] < 190);
      if (lav || label || filler || other) d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
  }
  let underColor = null;
  if (layer.under) {
    const row = ctx.getImageData(0, canvas.height - 1, canvas.width, 1).data;
    let R = 0; let G = 0; let B = 0; let n = 0;
    for (let i = 0; i < row.length; i += 4) if (row[i + 3]) { R += row[i]; G += row[i + 1]; B += row[i + 2]; n++; }
    if (n) underColor = `rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})`;
  }
  return { ...layer, canvas, underColor };
}

export class Backdrop {
  constructor(tileset, name, level, sky = null) {
    this.sky = sky;
    this.layers = BACKDROPS[name].map((l) => cutLayer(tileset, l));
    // Camera height at which `bottom` offsets apply: resting near the ground
    // (the level's surface row when it has caves below it).
    const ground = level.meta.horizon !== undefined ? level.meta.horizon * 32 : level.pixelH - 96;
    this.refY = ground - VIEW_H;
  }

  draw(ctx, camX, camY, time) {
    if (this.sky) this.sky.draw(ctx, camX, camY, time);
    for (const l of this.layers) {
      const w = l.canvas.width; const h = l.canvas.height;
      const step = w + (l.gap || 0);
      const ox = -(((camX * l.sx) % step) + step) % step;
      if (l.fill && l.stretch) {
        // Not a repeating square: scale to the view height, repeat sideways.
        const sw = Math.round(w * (VIEW_H / h));
        const sox = -(((camX * l.sx) % sw) + sw) % sw;
        for (let x = sox; x < VIEW_W; x += sw) ctx.drawImage(l.canvas, x, 0, sw, VIEW_H);
        continue;
      }
      if (l.fill) {
        const oy = -(((camY * l.sy) % h) + h) % h;
        for (let y = oy; y < VIEW_H; y += h) for (let x = ox; x < VIEW_W; x += w) ctx.drawImage(l.canvas, x, y);
        continue;
      }
      const y = Math.round(VIEW_H - (l.bottom || 0) - h - (camY - this.refY) * l.sy);
      for (let x = ox; x < VIEW_W; x += step) ctx.drawImage(l.canvas, Math.round(x), y);
      if (l.underColor && y + h < VIEW_H) {
        ctx.fillStyle = l.underColor;
        ctx.fillRect(0, y + h, VIEW_W, VIEW_H - y - h);
      }
    }
  }
}
