// Assembles all original procedural art: shaded sprites, plus helpers for
// styled arcade text (gradient fill, thick outline, drop shadow).

import { loadImage, loadSheet, loadTileset } from './sheets.js';
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

// A copy of a sheet with its greens turned red (the party-mode rival), or,
// for characters without green (`wash`), everything washed toward red.
function tintSheet(sheet, wash = false) {
  const recolor = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
      if (!d[i + 3]) continue;
      // Green-dominant pixels swap their green and red channels.
      if (wash) { d[i] = Math.min(255, r * 0.7 + 90); d[i + 1] = Math.round(g * 0.35); d[i + 2] = Math.round(b * 0.35); }
      else if (g > r * 1.15 && g > b * 1.05) { d[i] = g; d[i + 1] = Math.round(r * 0.6); d[i + 2] = Math.round(b * 0.7); }
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
  // The three playable characters (see tools/*_anims.json for the frames).
  const [jazz, spaz, lori] = await Promise.all(['hero', 'spaz', 'lori'].map((n) => loadSheet(`assets/${n}.json`)));
  art.hero = jazz;
  art.heroes = { jazz, spaz, lori };
  // Jazz's and Spaz's extra moves (new/sprites other movements.png): aiming
  // up, fidgets, dizzy, knocked down. Lori falls back to her own poses.
  const [jazzX, spazX, beta] = await Promise.all(['jazz_extra', 'spaz_extra', 'beta_items'].map((n) => loadSheet(`assets/${n}.json`)));
  Object.assign(jazz.anims, jazzX.anims);
  Object.assign(spaz.anims, spazX.anims);
  art.beta = beta;
  [art.items, art.enemy, art.turtle, art.fx, art.queen, art.bilsy, art.robot, art.uterus] = await Promise.all(
    ['items', 'enemies', 'turtles', 'fx', 'queen', 'bilsy', 'robot', 'uterus'].map((n) => loadSheet(`assets/${n}.json`)),
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
  // JJ2 menu art: bitmap fonts, title/loading/continue screens, episode
  // pictures and the character-select portraits (tools/build_font.py etc.).
  const font = async (name) => ({ img: await loadImage(`assets/font_${name}.png`), ...(await (await fetch(`assets/font_${name}.json`)).json()), tints: new Map(), space: name === 'big' ? 16 : 9 });
  art.fonts = { big: await font('big'), med: await font('med') };
  art.fonts.med.fallback = art.fonts.big;   // for the few marks the medium font lacks
  art.screens = {};
  await Promise.all(['title_jj2', 'title_plus', 'title_tsf', 'loading', 'continue'].map(async (n) => { art.screens[n] = await loadImage(`assets/screens/${n}.jpg`); }));
  art.episodes = {};
  await Promise.all(['prince', 'time', 'flashback', 'monkeys', 'demo', 'homecooked', 'christmas', 'secret'].map(async (n) => { art.episodes[n] = await loadImage(`assets/episodes/${n}.jpg`); }));
  art.charsel = await loadSheet('assets/charsel.json');
  art.heroRed = tintSheet(art.hero);
  art.heroesRed = { jazz: art.heroRed, spaz: tintSheet(spaz, true), lori: tintSheet(lori, true) };
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

// ---------------------------------------------------------------- JJ2 bitmap fonts

// The font image multiplied by a colour (cached per colour).
function tinted(font, color) {
  if (!color) return font.img;
  if (!font.tints.has(color)) {
    const c = document.createElement('canvas');
    c.width = font.img.width; c.height = font.img.height;
    const x = c.getContext('2d');
    x.drawImage(font.img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(font.img, 0, 0);
    font.tints.set(color, c);
  }
  return font.tints.get(color);
}

// Marks the fonts lack, spelled out.
const spell = (str) => str.replace(/%/g, ' percent').replace(/\s*\+\s*/g, ' and ');

export function jjWidth(font, str, scale = 1) {
  str = spell(str);
  let w = 0;
  for (const ch of str) {
    const [f, g, k] = glyph(font, ch);
    w += g ? (g[2] + 1) * k : font.space;
  }
  return w * scale;
}

// A character's glyph: its own, its capital, or the fallback font's (scaled
// to this font's height). Returns [font, glyph, scale] or [font, null, 1].
function glyph(font, ch) {
  const g = font.glyphs[ch] || font.glyphs[ch.toUpperCase()];
  if (g) return [font, g, 1];
  const fb = font.fallback;
  if (fb && fb.glyphs[ch]) return [fb, fb.glyphs[ch], font.height / fb.height];
  return [font, null, 1];
}

// Draw text in a JJ2 font: `color` tints it, `wave` makes the letters bob
// (the menu's selected item), `t` drives the wave.
export function jjText(ctx, font, str, x, y, { scale = 1, align = 'left', color = null, wave = 0, t = 0, alpha = 1 } = {}) {
  str = spell(str);
  let cx = x - (align === 'center' ? jjWidth(font, str, scale) / 2 : align === 'right' ? jjWidth(font, str, scale) : 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = scale < 1;
  let i = 0;
  for (const ch of str) {
    const [f, g, k] = glyph(font, ch);
    if (!g) { cx += font.space * scale; i++; continue; }
    const [gx, gy, w, h, top] = g;
    const s = scale * k;
    const dy = wave ? Math.sin(t * 0.12 + i * 0.7) * wave : 0;
    ctx.drawImage(tinted(f, color), gx, gy, w, h, Math.round(cx), Math.round(y + top * s + dy * scale), Math.round(w * s), Math.round(h * s));
    cx += (w + 1) * s;
    i++;
  }
  ctx.restore();
}
