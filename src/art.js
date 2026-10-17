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
    const props = {};
    for (const [kind, list] of Object.entries(t.props || {})) props[kind] = list.map((r) => cutTiles(pixels.image, r));
    art.tilesets[name] = { ...t, pixels, props };
  }
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
