// Splash intro, main menu (live level backdrop, level select with thumbnails
// and stars, party lobby, options, help), level cards, pause, tally, game
// over and win screens, and the iris transition.

import { arcadeText, jjText, jjWidth } from './art.js';
import { VIEW_H, VIEW_W } from './config.js';
import { ACTION_NAMES, clearKey, defaultKeys, KEY_SLOTS, keyName, REBINDABLE } from './input.js';
import { allJJ2, discoverPacks, PACKS } from './jj2/catalog.js';
import { preview } from './jj2/preview.js';
import { LEVELS, levelDef } from './levels.js';
import { PARTY_LEVELS } from './party.js';
import { MISSIONS, totalStars } from './save.js';
import { AREA } from './level.js';
import { frameAt, tilePixel } from './sheets.js';
import { TERRAIN_THEMES } from './terrain.js';
import { THEME_TILESET } from './tilesets.js';
import { Sky, Weather } from './sky.js';

const MAIN = ['New Game', 'Party', 'How to Play', 'Options'];
const MAIN_INFO = [
  "Kip's Gem Rush or a classic JJ2 episode",
  'Two players on two computers: race for gems',
  'Controls, moves and blocks',
  'Volume, keyboard and video',
];
const SUBS = ['char', 'party', 'help', 'options'];
const PAUSE_ITEMS = ['RESUME', 'OPTIONS', 'RESTART LEVEL', 'QUIT TO TITLE'];
const CHARACTERS = [
  { id: 'jazz', moves: ['Copter ears: JUMP again in the air', 'Uppercut: DOWN, then JUMP'] },
  { id: 'spaz', moves: ['Double jump: JUMP again in the air', 'Side kick: DOWN, then JUMP'] },
  { id: 'lori', moves: ['Copter ears: JUMP again in the air', 'Flying kick: DOWN, then JUMP'] },
];
// Episode pictures (JJ2's episode select) for this game and each level pack.
const EPISODE_ART = { kip: 'prince', xx: 'time', episode2: 'flashback', overgrown: 'monkeys', bl18: 'christmas', threed: 'secret' };
// Thumbnail colours per theme: sky, ground, back wall.
const THUMB = {
  meadow: ['#5aa8f0', '#e0b860', '#6a4a28'], castle: ['#1e120c', '#c88a50', '#4a2a1a'], town: ['#9a8aff', '#c070b0', '#3a2a4a'],
  winter: ['#4a2a6a', '#eef4ff', '#5a3a2a'], grove: ['#0b1440', '#5ae08a', '#2a0f5c'], candy: ['#a8c8ff', '#ff8ac8', '#8a2a7a'],
  tube: ['#1a0a2a', '#9a7aba', '#6a1a1a'], forge: ['#1a0404', '#d0601a', '#3a0a08'], crystal: ['#0a0418', '#7a5aba', '#1a0e34'],
};

export class Screens {
  constructor(ctx, art, audio) {
    this.ctx = ctx;
    this.art = art;
    this.audio = audio;
    this.sky = new Sky('winter');
    this.weather = new Weather('snow', 110);
    this.menu = 0;
    this.sub = null;        // null | char | episodes | levels | jj2 | help | options | party | host | join
    this.charPick = 'jazz';
    this.episode = 0;
    this.pack = null;
    this.continueYes = true;
    this.jj2 = allJJ2();
    this.jj2Index = 0;
    discoverPacks().then((added) => { if (added) this.jj2 = allJJ2(); });
    this.pauseIndex = 0;
    this.thumbs = [];
    this.codeBuf = '';
    this.lobby = { status: 'idle' };   // filled in by main.js for the party lobby
    this.partyLevel = 0;
    this.resetArmed = false;
    this.keyCol = 0;           // keyboard screen: which key slot
    this.capturing = null;     // keyboard screen: waiting for a key { action, col }
    window.addEventListener('keydown', (e) => {
      if (this.sub !== 'join') return;
      if (/^Key[A-Z]$/.test(e.code) && this.codeBuf.length < 4) this.codeBuf += e.code.slice(3);
      if (e.code === 'Backspace') this.codeBuf = this.codeBuf.slice(0, -1);
    });
  }

  // ---------------------------------------------------------------- helpers

  dim(alpha) {
    this.ctx.fillStyle = `rgba(8,4,18,${alpha})`;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Black overlay with a circular hole (iris wipe). r=0 is fully closed.
  iris(cx, cy, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#05020c';
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
  }

  // A rounded, translucent panel.
  panel(x, y, w, h, alpha = 0.72) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = `rgba(12,6,30,${alpha})`;
    ctx.strokeStyle = 'rgba(255,214,90,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  star(x, y, r, on) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = on ? '#ffd54a' : 'rgba(60,40,90,0.9)';
    ctx.strokeStyle = on ? '#8a4a00' : '#1a0b1e';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    if (on) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(x - r * 0.25, y - r * 0.45, r * 0.25, r * 0.3); }
    ctx.restore();
  }

  // A menu in the big JJ2 font: the chosen item is bright and bobs, with a
  // spinning gem beside it.
  menuList(items, index, y, t, gap = 26, x = VIEW_W / 2, align = 'center') {
    const font = this.art.fonts.big;
    items.forEach((label, i) => {
      const on = i === index;
      const scale = on ? 0.55 : 0.48;
      this.big(label, x, y + i * gap, { align, scale, color: on ? null : '#9d8fc8', wave: on ? 3 : 0, t });
      if (on) {
        const gem = this.art.gems.red[Math.floor(t / 5) % 8];
        const w = jjWidth(font, label, scale);
        const left = align === 'center' ? x - w / 2 : x;
        this.ctx.drawImage(gem, left - gem.width - 8, y + i * gap + 2);
        if (align === 'center') this.ctx.drawImage(gem, left + w + 8, y + i * gap + 2);
      }
    });
  }

  big(str, x, y, opts = {}) { jjText(this.ctx, this.art.fonts.big, str, x, y, { scale: 0.5, ...opts }); }
  med(str, x, y, opts = {}) { jjText(this.ctx, this.art.fonts.med, str, x, y, { scale: 0.75, ...opts }); }

  // The top 640x360 of a 640x480 JJ2 screen (where its logo and art are).
  top(img, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, img.width, img.width * (VIEW_H / VIEW_W), 0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  // A whole picture fitted to the screen height, on a blurred copy of itself.
  fit(img, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.filter = 'blur(6px) brightness(0.45)';
    ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H);
    ctx.filter = 'none';
    const w = img.width * (VIEW_H / img.height);
    ctx.drawImage(img, (VIEW_W - w) / 2, 0, w, VIEW_H);
    ctx.restore();
  }

  // Word-wrap to a pixel width in the medium JJ2 font.
  wrapTo(text, width, scale) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && jjWidth(this.art.fonts.med, next, scale) > width) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  blink(t, text, y, scale = 0.75) {
    this.med(text, VIEW_W / 2, y, { align: 'center', scale, alpha: Math.floor(t / 25) % 2 ? 1 : 0.4 });
  }

  // ---------------------------------------------------------------- splash / intro

  // `gated`: audio still locked, so wait for a key. `t` counts from the key.
  splash(t, gated) {
    const ctx = this.ctx;
    ctx.fillStyle = '#05020c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (gated) {
      this.top(this.art.screens.title_jj2, 0.35);
      this.med('PRESS ANY KEY', VIEW_W / 2, VIEW_H / 2 + 60, { align: 'center', scale: 1, alpha: 0.6 + Math.sin(t * 0.08) * 0.4 });
      this.med('headphones recommended', VIEW_W / 2, VIEW_H / 2 + 92, { align: 'center', scale: 0.55, color: '#c8b8e8' });
      return;
    }
    // 0-150: studio card.
    if (t < 150) {
      const a = Math.min(1, t / 30, (150 - t) / 30);
      const gem = this.art.gems.purple[Math.floor(t / 4) % 8];
      ctx.globalAlpha = a;
      ctx.drawImage(gem, VIEW_W / 2 - 30, VIEW_H / 2 - 74, 60, 60);
      ctx.globalAlpha = 1;
      this.big('REA LABS', VIEW_W / 2, VIEW_H / 2 - 4, { align: 'center', scale: 0.7, alpha: a });
      this.med('presents', VIEW_W / 2, VIEW_H / 2 + 36, { align: 'center', scale: 0.6, alpha: a * 0.8, color: '#c8b8e8' });
      return;
    }
    // 150+: the title screen fades in over a warp starfield.
    const k = t - 150;
    this.starfield(t, Math.max(0.4, 3 - k / 30));
    this.top(this.art.screens.title_jj2, Math.min(1, k / 60));
    if (k > 90) this.blink(t, 'Press any key', VIEW_H - 30);
  }

  starfield(t, speed) {
    const ctx = this.ctx;
    if (!this.stars) this.stars = Array.from({ length: 140 }, (_, i) => ({ a: (i * 2.39996) % (Math.PI * 2), d: (i * 37) % 400 }));
    for (const s of this.stars) {
      s.d += speed * (0.5 + s.d / 200);
      if (s.d > 420) s.d = Math.random() * 20;
      const x = VIEW_W / 2 + Math.cos(s.a) * s.d * 1.6; const y = VIEW_H / 2 + Math.sin(s.a) * s.d;
      const size = s.d > 250 ? 2 : 1;
      ctx.fillStyle = s.d > 300 ? '#ffffff' : '#a8a0ff';
      ctx.fillRect(x, y, size + (speed > 1.5 ? Math.min(6, speed * 2) : 0), size);
    }
  }

  // ---------------------------------------------------------------- main menu

  title(t, save) {
    const ctx = this.ctx;
    if (this.sub === null) {
      this.mainMenu(t, save);
    } else {
      this.backdrop();
      if (this.sub === 'char') this.charSelect(t, save);
      else if (this.sub === 'episodes') this.episodeSelect(t, save);
      else if (this.sub === 'levels') this.levelGrid(t, save);
      else if (this.sub === 'jj2') this.jj2List(t, save);
      else if (this.sub === 'help') this.help(t, save);
      else if (this.sub === 'options') this.options(t, save);
      else if (this.sub === 'keys') this.keysScreen(t, save);
      else if (this.sub === 'video') this.videoScreen(t, save);
      else this.lobbyScreen(t);
    }
    arcadeText(ctx, 'Fan project - sprites, tiles, sounds and music (c) Epic MegaGames, not for distribution', VIEW_W / 2, VIEW_H - 12, { size: 8, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
  }

  // JJ2's title picture, untouched, with the menu in a dark band along the
  // bottom: the items side by side, the chosen one gold and bobbing under a
  // spinning gem, and a line saying what it does.
  mainMenu(t, save) {
    const ctx = this.ctx;
    this.top(this.art.screens.title_jj2);
    const g = ctx.createLinearGradient(0, 246, 0, VIEW_H);
    g.addColorStop(0, 'rgba(10,4,26,0)'); g.addColorStop(0.38, 'rgba(10,4,26,0.8)'); g.addColorStop(1, 'rgba(10,4,26,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 246, VIEW_W, VIEW_H - 246);
    // Fixed slots (sized for the chosen scale) so items don't shift as the
    // selection moves.
    const font = this.art.fonts.big;
    const slots = MAIN.map((label) => jjWidth(font, label, 0.46));
    const gap = 28;
    let x = (VIEW_W - slots.reduce((a, b) => a + b, 0) - gap * (MAIN.length - 1)) / 2;
    const y = 294;
    MAIN.forEach((label, i) => {
      const on = i === this.menu;
      const cx = x + slots[i] / 2;
      this.big(label, cx, on ? y - 2 : y, { align: 'center', scale: on ? 0.46 : 0.4, color: on ? null : '#a898d0', wave: on ? 2 : 0, t });
      if (on) {
        const gem = this.art.gems.red[Math.floor(t / 5) % 8];
        ctx.drawImage(gem, Math.round(cx - gem.width / 2), y - gem.height - 6);
      }
      x += slots[i] + gap;
    });
    this.med(MAIN_INFO[this.menu], VIEW_W / 2, 324, { align: 'center', scale: 0.55, color: '#e8dcff' });
    this.star(20, 20, 9, true);
    this.med(`${totalStars(save)} / ${LEVELS.length * 3}`, 34, 12, { scale: 0.62 });
  }

  // Behind every other menu screen: the title picture blurred and darkened,
  // so it doesn't fight with the text (built once).
  backdrop() {
    if (!this.backCanvas) {
      const c = document.createElement('canvas');
      c.width = VIEW_W; c.height = VIEW_H;
      const x = c.getContext('2d');
      const img = this.art.screens.title_jj2;
      x.filter = 'blur(4px) saturate(1.2)';
      x.drawImage(img, 0, 0, img.width, img.width * (VIEW_H / VIEW_W), -8, -8, VIEW_W + 16, VIEW_H + 16);
      x.filter = 'none';
      x.fillStyle = 'rgba(14,6,34,0.74)';
      x.fillRect(0, 0, VIEW_W, VIEW_H);
      this.backCanvas = c;
    }
    this.ctx.drawImage(this.backCanvas, 0, 0);
  }

  // Jazz, Spaz or Lori: animated portraits, name logos and their moves.
  charSelect(t, save) {
    const ctx = this.ctx;
    this.big('SELECT YOUR CHARACTER', VIEW_W / 2, 14, { align: 'center', scale: 0.5 });
    const anims = this.art.charsel.anims;
    CHARACTERS.forEach((c, i) => {
      const x = 120 + i * 200;
      const on = c.id === this.charPick;
      const f = on ? frameAt(anims[c.id], t, 7) : anims[c.id].frames[0];
      if (on) {
        const g = ctx.createRadialGradient(x, 160, 10, x, 160, 110);
        g.addColorStop(0, 'rgba(255,214,90,0.35)'); g.addColorStop(1, 'rgba(255,214,90,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 110, 50, 220, 220);
      }
      ctx.globalAlpha = on ? 1 : 0.4;
      ctx.drawImage(f.right, Math.round(x - f.w / 2), Math.round(236 - f.h));
      const name = on ? anims[`${c.id}Name`] : anims[`${c.id}NameDim`];
      const nf = name.frames[on ? Math.floor(t / 12) % name.frames.length : 0];
      ctx.drawImage(nf.right, Math.round(x - nf.w * 0.35), 246, Math.round(nf.w * 0.7), Math.round(nf.h * 0.7));
      ctx.globalAlpha = 1;
    });
    // The chosen hero's moves, centred (under the outer heroes they ran off screen).
    const pick = CHARACTERS.find((c) => c.id === this.charPick);
    pick.moves.forEach((m, k) => this.med(m, VIEW_W / 2, 290 + k * 15, { align: 'center', scale: 0.58 }));
    this.med('LEFT / RIGHT to choose   ENTER to go on', VIEW_W / 2, VIEW_H - 34, { align: 'center', scale: 0.55, color: '#c8b8e8' });
  }

  // The episodes: this game's own levels and every JJ2 level pack.
  episodes() {
    return [
      { id: 'kip', title: "Kip's Gem Rush", blurb: 'Nine big levels made for this game: beaches, castles, towns, ice, groves, candy clouds, tubes, lava and crystal caves.', count: LEVELS.length },
      ...PACKS.map((pack) => ({ id: pack.id, title: pack.title, blurb: pack.blurb, pack, count: pack.levels.length })),
    ];
  }

  episodeSelect(t, save) {
    const ctx = this.ctx;
    this.big('EPISODE SELECT', VIEW_W / 2, 14, { align: 'center', scale: 0.5 });
    const eps = this.episodes();
    eps.forEach((ep, i) => {
      const on = i === this.episode;
      const y = 58 + i * 34;
      this.med(ep.title, 52, y, { scale: on ? 0.72 : 0.64, color: on ? null : '#9d8fc8', wave: on ? 2 : 0, t });
      this.med(`${ep.count} level${ep.count === 1 ? '' : 's'}`, 52, y + 17, { scale: 0.45, color: '#8a7ab0' });
      if (on) ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], 26, y + 1);
    });
    const ep = eps[this.episode];
    const img = this.art.episodes[EPISODE_ART[ep.id] || 'homecooked'];
    const h = 220; const w = Math.round(img.width * (h / img.height));
    const x = 470 - w / 2; const y = 48;
    ctx.fillStyle = '#ffd54a'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, x, y, w, h);
    if (ep.id === 'kip') {
      this.star(x + w - 54, y + h - 14, 8, true);
      this.med(`${totalStars(save)}/${LEVELS.length * 3}`, x + w - 42, y + h - 22, { scale: 0.6 });
    }
    wrap(ep.blurb, 34).slice(0, 5).forEach((line, i) => this.med(line, 470, y + h + 10 + i * 14, { align: 'center', scale: 0.55 }));
  }

  // Average colour of some tileset tiles (rows y0..y1 of each), as [r, g, b].
  tileColor(ts, ids, y0 = 0, y1 = 32) {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (const id of ids) {
      for (let y = y0; y < y1; y += 2) {
        for (let x = 0; x < 32; x += 2) {
          const k = tilePixel(ts, id, x, y);
          if (ts.data[k + 3] < 128) continue;
          r += ts.data[k]; g += ts.data[k + 1]; b += ts.data[k + 2]; n++;
        }
      }
    }
    return n ? [r / n, g / n, b / n] : null;
  }

  // Minimap of a level for its select card, coloured like the level: the
  // ground's surface and fill from its tileset (or palette), sky, back wall,
  // water and lava, with the start (green) and exit (pink).
  thumb(i) {
    if (this.thumbs[i]) return this.thumbs[i];
    const level = LEVELS[i]();
    const W = 180; const H = 52;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x2 = c.getContext('2d');
    const img = x2.createImageData(W, H);
    const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const theme = level.meta.theme;
    const [sky, , back] = (THUMB[theme] || THUMB.meadow).map(hex);
    const ts = this.art.tilesets[THEME_TILESET[theme]];
    const pal = TERRAIN_THEMES[theme] || TERRAIN_THEMES.meadow;
    let cap = hex(pal.cap[Math.floor(pal.cap.length * 0.6)]);
    let rock = hex(pal.rock[Math.floor(pal.rock.length * 0.5)]);
    if (ts) {
      const fill = ts.fillList || (ts.fillBlock ? ts.fillBlock.flat() : null);
      cap = this.tileColor(ts.pixels, ts.cap, 0, 10) || cap;
      if (fill) rock = this.tileColor(ts.pixels, fill) || rock;
    }
    const mix = (a, b, k) => [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * k);
    const sx = level.w / W; const sy = level.h / H;
    const solidAt = (x, y) => {
      if (y < 0) return false;
      const ch = level.tiles[Math.floor(y * sy)][Math.floor(x * sx)];
      return ch === '#' || ch === '=' || '/\\qryz'.includes(ch);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tx = Math.floor(x * sx); const ty = Math.floor(y * sy);
        const ch = level.tiles[ty][tx];
        let col = level.back[ty][tx] ? back : mix(sky, [255, 255, 255], 0.25 * (y / H));
        if (solidAt(x, y)) {
          let depth = 0;
          while (depth < 4 && solidAt(x, y - depth - 1)) depth++;
          col = depth === 0 ? cap : mix(rock, [0, 0, 0], Math.min(0.35, depth * 0.06) + ((x * 7 + y * 13) % 5) * 0.02);
        } else if (ch === '~') col = [255, 120, 30];
        else if (ch === '-') col = mix(cap, [255, 255, 255], 0.3);
        else if (level.areas && level.areas[ty * level.w + tx] === AREA.WATER) col = mix(col, [40, 120, 255], 0.6);
        const k = (y * W + x) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
    x2.putImageData(img, 0, 0);
    for (const e of level.entities) {
      if (e.ch === 'E') { x2.fillStyle = '#ff4ad8'; x2.fillRect(e.tx / sx - 2, e.ty / sy - 3, 4, 4); }
      if (e.ch === 'P') { x2.fillStyle = '#5aff5a'; x2.fillRect(e.tx / sx - 2, e.ty / sy - 3, 4, 4); }
    }
    this.thumbs[i] = c;
    return c;
  }

  levelGrid(t, save) {
    const ctx = this.ctx;
    this.big('LEVELS', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    const cw = 196; const ch = 86; const gap = 8;
    const x0 = (VIEW_W - cw * 3 - gap * 2) / 2; const y0 = 42;
    LEVELS.forEach((make, i) => {
      const x = x0 + (i % 3) * (cw + gap); const y = y0 + Math.floor(i / 3) * (ch + 6);
      const open = i < save.unlocked;
      const on = i === this.menu;
      ctx.save();
      ctx.fillStyle = on ? 'rgba(60,30,90,0.94)' : 'rgba(14,8,32,0.88)';
      ctx.strokeStyle = on ? '#ffd54a' : 'rgba(150,120,200,0.55)';
      ctx.lineWidth = on ? 3 : 1;
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 8); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (open) {
        ctx.drawImage(this.thumb(i), x + 8, y + 7);
        this.med(`${i + 1}. ${make.title}`, x + 9, y + 64, { scale: 0.5, color: on ? null : '#d8ccf4' });
        const rec = save.levels[i];
        for (let s = 0; s < 3; s++) this.star(x + cw - 40 + s * 13, y + 71, 5.5, !!(rec && rec.stars[s]));
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 8, y + 7, 180, 52);
        this.med('LOCKED', x + cw / 2, y + 26, { align: 'center', scale: 0.6, color: '#7a6aa0' });
        this.med(`${i + 1}. ???`, x + 9, y + 64, { scale: 0.5, color: '#7a6aa0' });
      }
    });
    const sel = this.menu === LEVELS.length;
    const by = y0 + 3 * (ch + 6) + 2;
    this.med('BACK', VIEW_W / 2, by, { align: 'center', scale: sel ? 0.72 : 0.62, color: sel ? null : '#b8a8d8', wave: sel ? 2 : 0, t });
    if (sel) ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], VIEW_W / 2 - 46, by);
  }

  // Original JJ2 levels from Levels/, grouped by pack, with a map preview.
  jj2List(t, save) {
    const ctx = this.ctx;
    const list = this.packLevels();
    this.panel(24, 54, VIEW_W - 48, 272, 0.88);
    this.big(this.pack.title, VIEW_W / 2, 62, { align: 'center', scale: Math.min(0.45, 560 / jjWidth(this.art.fonts.big, this.pack.title, 1)) });
    // Up to 11 rows, scrolling with the selection; the last row is Back.
    const rows = [...list, null];
    const shown = 11;
    const first = Math.max(0, Math.min(rows.length - shown, this.jj2Index - 5));
    rows.slice(first, first + shown).forEach((def, k) => {
      const n = first + k;
      const y = 98 + k * 19;
      const on = n === this.jj2Index;
      const rec = def && save.levels[def.key];
      // Long titles shrink (then get cut) so they stop short of the stars.
      const room = (rec ? 284 : 314) - 60;
      let label = def ? def.title : 'Back';
      // Two levels share a title in some packs: tell them apart.
      const twin = def && list.findIndex((o) => o !== def && o.title === def.title);
      if (def && twin >= 0) label += def.story ? ' - story' : twin < list.indexOf(def) ? ' II' : '';
      let scale = on ? 0.7 : 0.62;
      const font = this.art.fonts.med;
      const w = jjWidth(font, label, scale);
      if (w > room) scale = Math.max(0.5, scale * (room / w));
      while (label.length > 4 && jjWidth(font, label, scale) > room) label = `${label.slice(0, -4).trimEnd()}...`;
      this.med(label, 60, y, { scale, color: on ? null : def && def.error ? '#7a6a8a' : '#b8a8e0', wave: on ? 2 : 0, t });
      if (on) ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], 32, y);
      if (rec) for (let s = 0; s < 3; s++) this.star(292 + s * 11, y + 7, 4.5, rec.stars[s]);
    });
    if (first > 0) this.med('...', 60, 84, { scale: 0.6, color: '#8a7ab0' });
    if (first + shown < rows.length) this.med('...', 60, 98 + shown * 19 - 6, { scale: 0.6, color: '#8a7ab0' });
    // Load this episode's levels once, so the list shows real titles.
    for (const d of list) {
      if (d.loaded() || d.loading || d.error) continue;
      d.loading = true;
      d.prepare().catch((e) => { d.error = e.message; }).finally(() => { d.loading = false; });
    }
    const def = list[this.jj2Index];
    const bx = 326; const by = 100; const bw = 276; const bh = 150;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);
    if (def) {
      const got = def.loaded();
      if (got) {
        const map = preview(got.file, got.ts);
        if (def.story && map.lit < 0.05) {
          // Story levels are mostly text on black: say so rather than show an empty map.
          this.big('STORY', bx + bw / 2, by + bh / 2 - 22, { align: 'center', scale: 0.6 });
          this.med('text and a short ride to the next level', bx + bw / 2, by + bh / 2 + 10, { align: 'center', scale: 0.5, color: '#c8b8f0' });
        } else {
          const k = Math.min(bw / map.width, bh / map.height);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(map, bx + (bw - map.width * k) / 2, by + (bh - map.height * k) / 2, map.width * k, map.height * k);
        }
        this.med(`${got.file.layers[3].w} x ${got.file.layers[3].h} tiles - ${got.ts.name}`, bx + bw / 2, by + bh + 4, { align: 'center', scale: 0.5, color: '#c8b8f0' });
      } else {
        this.med(def.error ? 'Can not load' : 'Loading...', bx + bw / 2, by + bh / 2 - 8, { align: 'center', scale: 0.7 });
      }
      this.wrapTo(def.error || def.pack.blurb, bw, 0.5).slice(0, 4).forEach((line, i) => this.med(line, bx + bw / 2, by + bh + 19 + i * 12, { align: 'center', scale: 0.5, color: def.error ? '#ff9a9a' : null }));
    }
  }

  // The controls, naming the keys actually bound (OPTIONS > KEYBOARD).
  help(t, save) {
    this.big('HOW TO PLAY', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(28, 40, VIEW_W - 56, 284, 0.85);
    const keys = save.options.keys || defaultKeys();
    const n = (a) => keyName(keys[a][0]);
    const n2 = (a) => keys[a].slice(0, 2).map(keyName).join(' / ');
    const lines = [
      [`${n('left')} / ${n('right')}`, `move - hold ${n('run')} to run`],
      [n2('jump'), 'jump - hold for higher; again in the air:'],
      ['', 'Jazz and Lori hover on their ears, Spaz jumps again'],
      [`${n('down')}, then ${n('jump')}`, 'uppercut, Jazz / kick; sliding: super jump'],
      [`${n('down')} in the air`, 'butt-stomp: breaks stomp blocks, kills enemies'],
      [n2('shoot'), `fire    ${n('up')} and ${n('shoot')}: aim up, diagonal while moving`],
      [`${n('weapon')}, 1-9`, 'change weapon: bouncer, frostbiter, missiles, TNT...'],
      ['Poles and vines', 'touch a pole to spin and fly; hang from vines'],
      ['Blocks', 'star: shoot  number: N shots  arrow: stomp  gun: that gun'],
      ['Stars', 'exit  /  75% of gems  /  every secret'],
      [`${n('pause')} / M`, 'pause / mute    Keys can be changed in OPTIONS'],
    ];
    lines.forEach(([a, b], i) => {
      this.med(a, 46, 54 + i * 21, { scale: 0.5 });
      this.med(b, 190, 54 + i * 21, { scale: 0.5, color: '#ece4ff' });
    });
    this.blink(t, 'Press ENTER', 300, 0.6);
  }

  // A list of rows in the JJ2 font, the chosen one gold with a gem; `value`
  // (optional) is drawn right-aligned.
  rows(list, index, x0, x1, y0, gap, t) {
    list.forEach(([label, value], i) => {
      const on = i === index;
      const y = y0 + i * gap;
      this.med(label, x0, y, { scale: on ? 0.66 : 0.6, color: on ? null : '#b8a8e0', wave: on ? 2 : 0, t });
      if (on) this.ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], x0 - 26, y);
      if (value !== undefined && value !== null) this.med(value, x1, y, { align: 'right', scale: 0.6, color: on ? '#ffffff' : '#d8ccf4' });
    });
  }

  options(t, save) {
    const ctx = this.ctx;
    this.big('OPTIONS', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(130, 46, VIEW_W - 260, 262, 0.85);
    const list = [['MUSIC'], ['EFFECTS'], ['KEYBOARD', '>'], ['VIDEO', '>'],
      [this.resetArmed ? 'PRESS AGAIN TO ERASE' : 'RESET PROGRESS'], ['BACK']];
    this.rows(list, this.menu, 180, VIEW_W - 170, 66, 38, t);
    [save.options.music, save.options.sfx].forEach((v, i) => {
      const y = 66 + i * 38 + 3;
      const on = this.menu === i;
      ctx.fillStyle = '#1a0b1e'; ctx.fillRect(330, y, 124, 12);
      ctx.fillStyle = on ? '#ffd54a' : '#9a7ad0'; ctx.fillRect(332, y + 2, Math.round(120 * v), 8);
    });
    const hint = this.menu < 2 ? 'LEFT / RIGHT to change' : 'ENTER to choose   ESC to go back';
    this.med(hint, VIEW_W / 2, 290, { align: 'center', scale: 0.5, color: '#c8b8e8' });
  }

  // Rebind the play keys: up to three per action. ENTER waits for a key,
  // BACKSPACE clears one, a key already in use swaps over.
  keysScreen(t, save) {
    const ctx = this.ctx;
    const keys = save.options.keys || defaultKeys();
    this.big('KEYBOARD', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(28, 40, VIEW_W - 56, 282, 0.88);
    const colX = [252, 368, 484];
    const head = { scale: 0.48, color: '#8a7ab0' };
    this.med('ACTION', 62, 50, head);
    colX.forEach((x, c) => this.med(`KEY ${c + 1}`, x + 50, 50, { ...head, align: 'center' }));
    REBINDABLE.forEach((a, i) => {
      const y = 70 + i * 21;
      const on = this.menu === i;
      if (on) { ctx.fillStyle = 'rgba(255,214,90,0.10)'; ctx.fillRect(40, y - 3, VIEW_W - 80, 20); }
      this.med(ACTION_NAMES[a], 62, y, { scale: 0.55, color: on ? null : '#d8ccf4' });
      for (let c = 0; c < KEY_SLOTS; c++) {
        const cell = on && this.keyCol === c;
        const waiting = cell && this.capturing;
        if (cell) {
          ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(colX[c], y - 3, 100, 19, 4); ctx.stroke();
        }
        const label = waiting ? (Math.floor(t / 20) % 2 ? 'PRESS A KEY' : '') : keyName(keys[a][c]);
        this.med(label, colX[c] + 50, y, { align: 'center', scale: 0.5, color: waiting ? '#ffd54a' : keys[a][c] ? '#ffffff' : '#6a5a8a' });
      }
    });
    const n = REBINDABLE.length;
    this.rows([['RESET TO DEFAULTS'], ['BACK']], this.menu - n, 62, 0, 70 + n * 21 + 6, 21, t);
    const hint = this.capturing ? 'Press the new key   ESC cancels' : 'ENTER change   BACKSPACE clear   ESC back';
    this.med(hint, VIEW_W / 2, 302, { align: 'center', scale: 0.5, color: '#c8b8e8' });
  }

  videoScreen(t, save) {
    const v = save.options.video;
    this.big('VIDEO', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(100, 46, VIEW_W - 200, 262, 0.85);
    const onOff = (b) => (b ? 'ON' : 'OFF');
    const list = [
      ['FULLSCREEN', onOff(!!document.fullscreenElement)],
      ['SCALING', v.scale === 'pixel' ? 'PIXEL PERFECT' : 'FIT WINDOW'],
      ['FILTER', v.filter === 'smooth' ? 'SMOOTH' : 'SHARP'],
      ['SCREEN SHAKE', onOff(v.shake)],
      ['FLASHES', onOff(v.flash)],
      ['BACK'],
    ];
    this.rows(list, this.menu, 150, VIEW_W - 140, 66, 36, t);
    const tips = [
      'Fill the screen (F11 works too)',
      'Fit: fill the window   Pixel perfect: whole-number scale, no uneven pixels',
      'Sharp: crisp pixels   Smooth: softened',
      'Shake the screen on explosions and stomps',
      'Flash the screen on big hits and explosions',
      '',
    ];
    this.wrapTo(tips[this.menu], VIEW_W - 240, 0.5).forEach((line, i) => this.med(line, VIEW_W / 2, 282 + i * 12, { align: 'center', scale: 0.5, color: '#c8b8e8' }));
  }

  lobbyScreen(t) {
    const ctx = this.ctx;
    const L = this.lobby;
    this.big('PARTY MODE', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(VIEW_W / 2 - 220, 46, 440, 262, 0.88);
    const say = (text, y, opts = {}) => this.med(text, VIEW_W / 2, y, { align: 'center', scale: 0.55, ...opts });
    if (this.sub === 'party') {
      say('Two players hunt gems. Shoot your rival to make', 66, { color: '#ece4ff' });
      say('them drop gems; first to the exit with 100 wins!', 80, { color: '#ece4ff' });
      this.menuList(['HOST A GAME', 'JOIN A GAME', 'BACK'], this.menu, 120, t, 34);
      say('Run party.bat - serve.py --lan - so your friend can connect', 278, { scale: 0.45, color: '#c8b8e8' });
      return;
    }
    if (L.status === 'error') {
      this.wrapTo(L.error || 'Connection failed.', 380, 0.55).forEach((line, i) => say(line, 130 + i * 15, { color: '#ffb0b8' }));
      this.blink(t, 'Press ENTER', 250, 0.6);
      return;
    }
    if (this.sub === 'host') {
      if (!L.code) { say('Connecting' + '.'.repeat(1 + Math.floor(t / 20) % 3), 150, { scale: 0.7 }); return; }
      say('ROOM CODE', 66, { color: '#c8b8e8' });
      this.big(L.code.split('').join(' '), VIEW_W / 2, 84, { align: 'center', scale: 0.9 });
      (L.urls || []).slice(0, 2).forEach((u, i) => say(`Friend opens ${u}`, 148 + i * 14, { scale: 0.48, color: '#ece4ff' }));
      const lv = levelDef(PARTY_LEVELS[this.partyLevel]);
      const name = lv.loaded && !lv.loaded() && lv.pack ? lv.pack.title : lv.title;
      say(`< ${name} >`, 196, { scale: 0.7, color: null });
      say('LEFT / RIGHT: level', 216, { scale: 0.45, color: '#8a7ab0' });
      if (L.peer) this.blink(t, 'Player 2 is here! Press ENTER to start', 252, 0.6);
      else say('Waiting for player 2' + '.'.repeat(1 + Math.floor(t / 20) % 3), 252, { scale: 0.6 });
      return;
    }
    // join
    if (L.joined) {
      say(`Joined room ${L.code}`, 120, { scale: 0.75, color: null });
      say('Waiting for the host to start' + '.'.repeat(1 + Math.floor(t / 20) % 3), 160, { scale: 0.6 });
      return;
    }
    say('Type the room code', 80, { scale: 0.6 });
    this.big(this.codeBuf.padEnd(4, '_').split('').join(' '), VIEW_W / 2, 106, { align: 'center', scale: 0.9 });
    if (L.error) say(L.error, 190, { color: '#ffb0b8' });
    say('ENTER to join   ESC to go back', 270, { scale: 0.5, color: '#c8b8e8' });
  }

  // Returns an action string when the player chooses something.
  titleInput(input, save) {
    const choose = input.pressed('start') || (this.sub !== 'join' && input.pressed('jump'));
    const back = input.pressed('pause');
    const move = (n, count) => { this.menu = (this.menu + n + count) % count; this.audio.play('menu'); };
    switch (this.sub) {
      case null:
        // The menu runs side by side; up/down work too.
        if (input.pressed('left') || input.pressed('up')) move(-1, MAIN.length);
        if (input.pressed('right') || input.pressed('down')) move(1, MAIN.length);
        if (!choose) return null;
        this.audio.play('select');
        this.sub = SUBS[this.menu];
        if (this.sub === 'char') this.charPick = save.character || 'jazz';
        this.menu = 0;
        return null;
      case 'char': {
        const i = CHARACTERS.findIndex((c) => c.id === this.charPick);
        const d = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
        if (d) { this.charPick = CHARACTERS[(i + d + CHARACTERS.length) % CHARACTERS.length].id; this.audio.play('menu'); }
        if (back) { this.sub = null; this.menu = 0; return null; }
        if (!choose) return null;
        this.audio.play('select');
        save.character = this.charPick;
        this.sub = 'episodes';
        return 'save';
      }
      case 'episodes': {
        const eps = this.episodes();
        const d = (input.pressed('down') ? 1 : 0) - (input.pressed('up') ? 1 : 0);
        if (d) { this.episode = (this.episode + d + eps.length) % eps.length; this.audio.play('menu'); }
        if (back) { this.sub = 'char'; return null; }
        if (!choose) return null;
        this.audio.play('select');
        const ep = eps[this.episode];
        if (ep.id === 'kip') { this.sub = 'levels'; this.menu = Math.min(save.unlocked, LEVELS.length) - 1; }
        else { this.sub = 'jj2'; this.pack = ep.pack; this.jj2Index = 0; }
        return null;
      }
      case 'levels': {
        const n = LEVELS.length;
        if (input.pressed('left')) move(-1, n + 1);
        if (input.pressed('right')) move(1, n + 1);
        if (input.pressed('up')) { this.menu = this.menu === n ? n - 1 : Math.max(0, this.menu - 3); this.audio.play('menu'); }
        if (input.pressed('down')) { this.menu = Math.min(n, this.menu + 3); this.audio.play('menu'); }
        if (back || (choose && this.menu === n)) { this.sub = 'episodes'; return null; }
        if (!choose) return null;
        if (this.menu < save.unlocked) { this.audio.play('select'); return `level:${this.menu}`; }
        this.audio.play('denied');
        return null;
      }
      case 'jj2': {
        const list = this.packLevels();
        const n = list.length;
        const d = (input.pressed('down') ? 1 : 0) - (input.pressed('up') ? 1 : 0);
        if (d) { this.jj2Index = (this.jj2Index + d + n + 1) % (n + 1); this.audio.play('menu'); }
        if (back || (choose && this.jj2Index === n)) { this.sub = 'episodes'; return null; }
        if (!choose) return null;
        const def = list[this.jj2Index];
        if (def.error) { def.error = null; this.audio.play('menu'); return null; }   // try loading again
        this.audio.play('select');
        return `level:${def.key}`;
      }
      case 'help':
        if (choose || back) { this.sub = null; this.menu = 2; this.audio.play('select'); }
        return null;
      case 'options': {
        if (input.pressed('up')) { move(-1, 6); this.resetArmed = false; }
        if (input.pressed('down')) { move(1, 6); this.resetArmed = false; }
        if (this.menu < 2) {
          const key = this.menu === 0 ? 'music' : 'sfx';
          const d = (input.pressed('right') ? 0.1 : 0) - (input.pressed('left') ? 0.1 : 0);
          if (d) { save.options[key] = Math.round(Math.max(0, Math.min(1, save.options[key] + d)) * 10) / 10; this.audio.play('menu'); return 'options'; }
        }
        if (back || (choose && this.menu === 5)) { this.sub = null; this.menu = 3; this.resetArmed = false; return 'options'; }
        if (choose && this.menu === 2) { this.audio.play('select'); this.sub = 'keys'; this.menu = 0; this.keyCol = 0; return null; }
        if (choose && this.menu === 3) { this.audio.play('select'); this.sub = 'video'; this.menu = 0; return null; }
        if (choose && this.menu === 4) {
          if (this.resetArmed) { this.resetArmed = false; this.audio.play('denied'); return 'reset'; }
          this.resetArmed = true; this.audio.play('menu');
        }
        return null;
      }
      case 'keys': {
        if (this.capturing) return null;
        const n = REBINDABLE.length;
        if (input.pressed('up')) move(-1, n + 2);
        if (input.pressed('down')) move(1, n + 2);
        if (this.menu < n) {
          const d = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
          if (d) { this.keyCol = (this.keyCol + d + KEY_SLOTS) % KEY_SLOTS; this.audio.play('menu'); }
        }
        if (back || (choose && this.menu === n + 1)) { this.sub = 'options'; this.menu = 2; return null; }
        if (!save.options.keys) save.options.keys = defaultKeys();
        const keys = save.options.keys;
        if (this.menu < n && input.pressed('clear')) {
          if (clearKey(keys, REBINDABLE[this.menu], this.keyCol)) { this.audio.play('menu'); return 'keys'; }
          this.audio.play('denied');
          return null;
        }
        if (!choose) return null;
        if (this.menu === n) { save.options.keys = defaultKeys(); this.audio.play('select'); return 'keys'; }
        this.capturing = { action: REBINDABLE[this.menu], col: Math.min(this.keyCol, keys[REBINDABLE[this.menu]].length) };
        this.audio.play('select');
        return 'capture';
      }
      case 'video': {
        if (input.pressed('up')) move(-1, 6);
        if (input.pressed('down')) move(1, 6);
        if (back || (choose && this.menu === 5)) { this.sub = 'options'; this.menu = 3; return null; }
        const flip = choose || input.pressed('left') || input.pressed('right');
        if (!flip) return null;
        this.audio.play('menu');
        const v = save.options.video;
        if (this.menu === 0) return 'fullscreen';
        if (this.menu === 1) v.scale = v.scale === 'pixel' ? 'fit' : 'pixel';
        if (this.menu === 2) v.filter = v.filter === 'smooth' ? 'sharp' : 'smooth';
        if (this.menu === 3) v.shake = !v.shake;
        if (this.menu === 4) v.flash = !v.flash;
        return 'video';
      }
      case 'party':
        if (input.pressed('up')) move(-1, 3);
        if (input.pressed('down')) move(1, 3);
        if (back || (choose && this.menu === 2)) { this.sub = null; this.menu = 1; return null; }
        if (!choose) return null;
        this.audio.play('select');
        this.lobby = { status: 'connecting' };
        if (this.menu === 0) { this.sub = 'host'; return 'host'; }
        this.sub = 'join'; this.codeBuf = '';
        return null;
      case 'host':
        if (back || (choose && this.lobby.status === 'error')) { this.sub = 'party'; this.menu = 0; return 'leave'; }
        if (input.pressed('left')) { this.partyLevel = (this.partyLevel + PARTY_LEVELS.length - 1) % PARTY_LEVELS.length; this.audio.play('menu'); }
        if (input.pressed('right')) { this.partyLevel = (this.partyLevel + 1) % PARTY_LEVELS.length; this.audio.play('menu'); }
        if (choose && this.lobby.peer && this.lobby.status !== 'loading') return `party-start:${PARTY_LEVELS[this.partyLevel]}`;
        return null;
      case 'join':
        if (back || (choose && this.lobby.status === 'error')) { this.sub = 'party'; this.menu = 1; return 'leave'; }
        if (choose && !this.lobby.joined && this.codeBuf.length === 4) return `join:${this.codeBuf}`;
        return null;
      default:
        return null;
    }
  }

  // The levels of the episode (JJ2 pack) picked in the episode select.
  packLevels() { return this.jj2.filter((d) => d.pack === this.pack); }

  // ---------------------------------------------------------------- level card

  // The level card, on JJ2's loading screen: name, tip and the three stars
  // on the parchment, while an original JJ2 level's files load.
  card(game, t, save) {
    const ctx = this.ctx;
    this.fit(this.art.screens.loading, Math.min(1, t / 20));
    const meta = game.cardMeta;
    const ink = '#5a2c0c';
    const font = this.art.fonts.big;
    const label = typeof game.cardIndex === 'number' ? `Level ${game.cardIndex + 1}` : meta.label || 'Classic JJ2';
    if (label.toLowerCase() !== meta.title.toLowerCase()) this.med(label, VIEW_W / 2, 176, { align: 'center', scale: 0.55, color: '#8a4a1a' });
    const scale = Math.min(0.5, 340 / jjWidth(font, meta.title, 1));
    this.big(meta.title, VIEW_W / 2, 189, { align: 'center', scale, color: ink });
    wrap(meta.tip || '', 54).slice(0, 2).forEach((line, i) => this.med(line, VIEW_W / 2, 220 + i * 12, { align: 'center', scale: 0.5, color: ink }));
    const rec = save && save.levels[game.cardIndex];
    MISSIONS.forEach((m, i) => {
      const y = 250 + i * 17;
      const a = Math.min(1, Math.max(0, (t - 20 - i * 10) / 20));
      ctx.globalAlpha = a;
      this.star(VIEW_W / 2 - 92, y + 6, 6, !!(rec && rec.stars[i]));
      ctx.globalAlpha = 1;
      this.med(m, VIEW_W / 2 - 80, y, { scale: 0.55, color: ink, alpha: a });
    });
    if (meta.error) {
      this.wrapTo(meta.error, 330, 0.5).slice(0, 2).forEach((line, i) => this.med(line, VIEW_W / 2, 296 + i * 11, { align: 'center', scale: 0.5, color: '#b0180c' }));
      this.med(meta.next ? 'ENTER: skip to the next level   ESC: menu' : 'Press ENTER', VIEW_W / 2, 320, { align: 'center', scale: 0.45, color: '#8a4a1a' });
    }
    else if (rec) this.med(`Best ${rec.score}   ${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, '0')}`, VIEW_W / 2, 306, { align: 'center', scale: 0.5, color: '#8a4a1a' });
  }

  // ---------------------------------------------------------------- pause

  // The pause menu; OPTIONS opens the same options screens as the title.
  pause(t, save) {
    this.dim(0.62);
    if (this.sub === 'options' || this.sub === 'keys' || this.sub === 'video') {
      this.backdrop();
      if (this.sub === 'options') this.options(t, save);
      else if (this.sub === 'keys') this.keysScreen(t, save);
      else this.videoScreen(t, save);
      return;
    }
    this.panel(VIEW_W / 2 - 150, 70, 300, 210, 0.9);
    this.big('PAUSED', VIEW_W / 2, 84, { align: 'center', scale: 0.6 });
    this.menuList(PAUSE_ITEMS, this.pauseIndex, 136, t, 32);
  }

  pauseInput(input, save) {
    if (this.sub) {
      const action = this.titleInput(input, save);
      if (this.sub === null) { this.pauseIndex = 1; return 'options-closed'; }
      return action;
    }
    const n = PAUSE_ITEMS.length;
    if (input.pressed('up')) { this.pauseIndex = (this.pauseIndex + n - 1) % n; this.audio.play('menu'); }
    if (input.pressed('down')) { this.pauseIndex = (this.pauseIndex + 1) % n; this.audio.play('menu'); }
    if (input.pressed('pause')) return 'resume';
    if (input.pressed('start') || input.pressed('jump')) {
      this.audio.play('select');
      const pick = ['resume', 'options', 'restart', 'quit'][this.pauseIndex];
      if (pick === 'options') { this.sub = 'options'; this.menu = 0; return null; }
      return pick;
    }
    return null;
  }

  // ---------------------------------------------------------------- level clear tally

  tally(game) {
    const ctx = this.ctx;
    const t = game.clearTime;
    const s = game.stats;
    if (t < 70) return;
    const k = t - 70;
    this.dim(Math.min(0.78, k / 40));
    this.big('LEVEL CLEAR!', VIEW_W / 2, 18, { align: 'center', scale: 0.7, wave: 2, t: k });
    // Stars pop in one by one.
    const res = game.result || { stars: [true, false, false], newStars: [false, false, false] };
    for (let i = 0; i < 3; i++) {
      if (k < 20 + i * 18) continue;
      const pop = Math.max(1, 2.2 - (k - 20 - i * 18) / 6);
      this.star(VIEW_W / 2 - 50 + i * 50, 84, 16 * pop, res.stars[i]);
      if (k === 20 + i * 18 && res.stars[i]) this.audio.play('rank');
      if (res.newStars[i] && k > 40 + i * 18) this.med('NEW', VIEW_W / 2 - 50 + i * 50, 102, { align: 'center', scale: 0.45, color: '#7aff9a' });
    }
    const rows = [
      // Out of 100 (the JJ2 font has no percent sign).
      ['GEMS', `${s.gems} / 100`],
      ['SECRETS', `${s.secrets} / 100`],
      ['ENEMIES', `${s.enemies} / 100`],
      ['TIME', `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}${res.bestTime ? '  BEST!' : ''}`],
      ['BONUS', `${s.bonus.time + s.bonus.gems + s.bonus.perfect}`],
      ['SCORE', `${game.score}${res.bestScore ? '  BEST!' : ''}`],
    ];
    rows.forEach(([label, value], i) => {
      if (k < 80 + i * 14) return;
      this.med(label, VIEW_W / 2 - 160, 126 + i * 24, { scale: 0.7, color: '#d8ccf4' });
      this.med(value, VIEW_W / 2 + 130, 126 + i * 24, { align: 'right', scale: 0.7 });
      if (k === 80 + i * 14) this.audio.play('tally');
    });
    if (k > 180) {
      const pop = Math.max(1, 3 - (k - 180) / 6);
      this.med('RANK', VIEW_W / 2 + 214, 126, { align: 'center', scale: 0.55, color: '#d8ccf4' });
      this.big(s.rank, VIEW_W / 2 + 214, 146, { align: 'center', scale: 1.1 * pop, color: s.rank === 'S' ? '#ff9af0' : null });
    }
    if (k > 210) this.blink(k, 'Press ENTER', VIEW_H - 34);
  }

  // ---------------------------------------------------------------- game over / win

  // Game over: JJ2's "Continue?" screen. LEFT/RIGHT pick NO or YES.
  gameOver(game, t) {
    const ctx = this.ctx;
    this.fit(this.art.screens.continue, Math.min(1, t / 40));
    if (t < 40) return;
    // The NO and YES of the picture sit at (277, 302) and (358, 302).
    // The gem points at the chosen word from outside it (it used to cover YES).
    const gem = this.art.gems.red[Math.floor(t / 5) % 8];
    const x = this.continueYes ? 392 : 248 - gem.width;
    ctx.drawImage(gem, x + Math.sin(t * 0.15) * 2, 304 - gem.height / 2);
    this.med(`Score ${game.score}`, VIEW_W / 2, 336, { align: 'center', scale: 0.55 });
  }

  continueInput(input) {
    if (input.pressed('left') || input.pressed('right')) { this.continueYes = !this.continueYes; this.audio.play('menu'); }
    if (input.pressed('pause')) return 'no';
    if (input.pressed('start') || input.pressed('jump')) { this.audio.play('select'); return this.continueYes ? 'yes' : 'no'; }
    return null;
  }

  win(game, t) {
    const ctx = this.ctx;
    this.sky.draw(ctx, t, 0, t);
    this.weather.update(t, 0, t);
    this.weather.draw(ctx, true, t);
    this.big('YOU WIN!', VIEW_W / 2, 40, { align: 'center', scale: 0.9, wave: 3, t });
    const v = this.art.kip.victory;
    const vf = v[Math.min(v.length - 1, Math.floor(t / 8))];
    ctx.drawImage(vf.right, VIEW_W / 2 - vf.ax, 170 - vf.ay);
    this.med(`FINAL SCORE ${game.score}`, VIEW_W / 2, 184, { align: 'center', scale: 0.8 });
    this.med(`GEMS ${game.gems}   COINS ${game.coins}`, VIEW_W / 2, 210, { align: 'center', scale: 0.6, color: '#ece4ff' });
    const credits = ['Sprites, tiles, sound effects and music: Jazz Jackrabbit 2 (c) Epic MegaGames', 'Sprite rips via The Spriters Resource - not owned by this project', 'Thanks for playing!'];
    credits.forEach((c, i) => this.med(c, VIEW_W / 2, 248 + i * 16, { align: 'center', scale: 0.45, color: '#d8ccf4' }));
    if (t > 120) this.blink(t, 'Press ENTER', VIEW_H - 26);
  }
}

// Split text into lines of at most `n` characters.
function wrap(text, n) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + word.length + 1 > n) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}
