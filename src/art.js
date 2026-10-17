// Assembles all original procedural art: shaded sprites, plus helpers for
// styled arcade text (gradient fill, thick outline, drop shadow).

import { loadSheet, loadTileset } from './sheets.js';
import { TILESETS } from './tilesets.js';
import { buildSprites } from './sprites.js';

// A rectangle of tiles as its own canvas, with some tiles blanked out.
function cutTiles(image, [c, r, cols, rows, clear = []]) {
  const canvas = document.createElement('canvas');
  canvas.width = cols * 32;
  canvas.height = rows * 32;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, c * 32, r * 32, cols * 32, rows * 32, 0, 0, cols * 32, rows * 32);
  for (const [x, y, w, h] of clear) ctx.clearRect(x * 32, y * 32, w * 32, h * 32);
  return canvas;
}

// Recolour a tileset in place: each pixel's brightness picks a colour along
// `stops` ([[0..1, '#rrggbb'], ...]), so one tileset can become a new world.
function gradientMap(ts, stops) {
  const rgb = stops.map(([at, hex]) => [at, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = v / 255;
    let k = 0;
    while (k < rgb.length - 2 && t > rgb[k + 1][0]) k++;
    const [a0, r0, g0, b0] = rgb[k]; const [a1, r1, g1, b1] = rgb[k + 1];
    const f = Math.max(0, Math.min(1, (t - a0) / (a1 - a0 || 1)));
    lut[v * 3] = r0 + (r1 - r0) * f; lut[v * 3 + 1] = g0 + (g1 - g0) * f; lut[v * 3 + 2] = b0 + (b1 - b0) * f;
  }
  const d = ts.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const v = Math.round(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
    d[i] = lut[v * 3]; d[i + 1] = lut[v * 3 + 1]; d[i + 2] = lut[v * 3 + 2];
  }
  // Keep the drawable copy in step with the pixel data.
  const ctx = ts.image.getContext('2d');
  const img = ctx.getImageData(0, 0, ts.w, ts.h);
  img.data.set(d);
  ctx.putImageData(img, 0, 0);
}

// A copy of a sheet with its greens turned red (the party-mode rival).
function tintSheet(sheet) {
  const recolor = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
      // Green-dominant pixels swap their green and red channels.
      if (d[i + 3] && g > r * 1.15 && g > b * 1.05) { d[i] = g; d[i + 1] = Math.round(r * 0.6); d[i + 2] = Math.round(b * 0.7); }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };
  const map = new Map();
  for (const f of sheet.frames) map.set(f, { ...f, right: recolor(f.right), left: recolor(f.left) });
  const anims = {};
  for (const [k, a] of Object.entries(sheet.anims)) anims[k] = { ...a, frames: a.frames.map((f) => map.get(f)) };
  return { frames: [...map.values()], anims };
}

export async function buildArt() {
  const art = buildSprites();
  art.hero = await loadSheet('assets/hero.json');
  [art.items, art.enemy, art.turtle, art.fx] = await Promise.all(
    ['items', 'enemies', 'turtles', 'fx'].map((n) => loadSheet(`assets/${n}.json`)),
  );
  // Special blocks (see tools/build_blocks.py for the order).
  const blocks = await loadTileset('assets/blocks.png');
  art.blocks = Array.from({ length: blocks.w / 32 }, (_, i) => cutTiles(blocks.image, [i, 0, 1, 1]));
  // Menus and the HUD draw gems as plain images.
  for (const [color, anim] of [['red', 'gemRed'], ['green', 'gemGreen'], ['blue', 'gemBlue'], ['purple', 'gemPurple']]) {
    art.gems[color] = art.items.anims[anim].frames.map((f) => f.right);
  }
  art.tilesets = {};
  for (const [name, t] of Object.entries(TILESETS)) {
    const pixels = await loadTileset(t.image);
    if (t.gradient) gradientMap(pixels, t.gradient);
    const props = {};
    for (const [kind, list] of Object.entries(t.props || {})) props[kind] = list.map((r) => cutTiles(pixels.image, r));
    art.tilesets[name] = { ...t, pixels, props };
  }
  art.heroRed = tintSheet(art.hero);
  // Screens draw the hero through `art.kip[anim][i].right/left`.
  const pick = (name) => art.hero.anims[name].frames;
  art.kip = {
    idle: pick('idle'), run: pick('run'), victory: pick('victory'), icon: pick('icon'),
  };
  return art;
}

const FONT = '"Arial Black", "Segoe UI Black", Impact, sans-serif';

// Draw chunky arcade text: drop shadow, thick outline, vertical gradient.
export function arcadeText(ctx, str, x, y, {
  size = 16, align = 'left', top = '#fff6c0', bottom = '#ffb02e', outline = '#1a0b1e', shadow = true, alpha = 1,
} = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  const lw = Math.max(2, Math.round(size / 6));
  if (shadow) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeText(str, x + Math.max(1, size / 12), y + Math.max(1, size / 10));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(str, x + Math.max(1, size / 12), y + Math.max(1, size / 10));
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = outline;
  ctx.strokeText(str, x, y);
  const g = ctx.createLinearGradient(0, y, 0, y + size);
  g.addColorStop(0, top);
  g.addColorStop(0.55, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function textWidth(ctx, str, size) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}
