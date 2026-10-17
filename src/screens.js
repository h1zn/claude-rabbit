// Splash intro, main menu (live level backdrop, level select with thumbnails
// and stars, party lobby, options, help), level cards, pause, tally, game
// over and win screens, and the iris transition.

import { arcadeText, textWidth } from './art.js';
import { Backdrop, BACKDROP_SKY, BACKDROPS } from './backdrop.js';
import { TILE, VIEW_H, VIEW_W } from './config.js';
import { allJJ2, PACKS } from './jj2/catalog.js';
import { preview } from './jj2/preview.js';
import { LEVELS, levelDef } from './levels.js';
import { PARTY_LEVELS } from './party.js';
import { MISSIONS, totalStars } from './save.js';
import { Sky, Weather } from './sky.js';
import { TerrainRenderer } from './terrain.js';
import { THEME_TILESET } from './tilesets.js';

const TITLE = "KIP'S GEM RUSH";
const MAIN = ['PLAY', 'LEVELS', 'CLASSIC JJ2', 'PARTY', 'HOW TO PLAY', 'OPTIONS'];
const SUBS = [null, 'levels', 'jj2', 'party', 'help', 'options'];
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
    this.sub = null;        // null | levels | jj2 | help | options | party | host | join
    this.jj2 = allJJ2();
    this.jj2Index = 0;
    this.pauseIndex = 0;
    this.thumbs = [];
    this.codeBuf = '';
    this.lobby = { status: 'idle' };   // filled in by main.js for the party lobby
    this.partyLevel = 0;
    this.resetArmed = false;
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

  menuList(items, index, y, t, gap = 24) {
    items.forEach((label, i) => {
      const on = i === index;
      const wobble = on ? Math.sin(t * 0.15) * 2 : 0;
      arcadeText(this.ctx, label, VIEW_W / 2, y + i * gap + wobble, {
        size: on ? 18 : 15, align: 'center',
        top: on ? '#ffffff' : '#b8a8d8', bottom: on ? '#ffb02e' : '#7a6aa0',
      });
      if (on) {
        const gem = this.art.gems.red[Math.floor(t / 5) % 8];
        const half = textWidth(this.ctx, label, 18) / 2 + 12;
        this.ctx.drawImage(gem, VIEW_W / 2 - half - gem.width, y + i * gap + 1);
        this.ctx.drawImage(gem, VIEW_W / 2 + half, y + i * gap + 1);
      }
    });
  }

  blink(t, text, y, size = 13) {
    arcadeText(this.ctx, text, VIEW_W / 2, y, { size, align: 'center', alpha: Math.floor(t / 25) % 2 ? 1 : 0.4 });
  }

  // The bouncing logo, letter by letter.
  logo(t, y, scale = 1) {
    const ctx = this.ctx;
    const sizeOf = (i) => Math.round((i >= 5 ? 46 : 30) * scale);
    const advance = (i) => textWidth(ctx, TITLE[i], sizeOf(i)) + 2;
    let total = 0;
    for (let i = 0; i < TITLE.length; i++) total += advance(i);
    let x = VIEW_W / 2 - total / 2;
    // Soft pulsing glow behind the logo (filled over its whole radius).
    const r = 200 * scale;
    const g = ctx.createRadialGradient(VIEW_W / 2, y + 26 * scale, 10, VIEW_W / 2, y + 26 * scale, r);
    g.addColorStop(0, `rgba(255,170,60,${0.28 + Math.sin(t * 0.05) * 0.08})`); g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g; ctx.fillRect(VIEW_W / 2 - r, y + 26 * scale - r, r * 2, r * 2);
    for (let i = 0; i < TITLE.length; i++) {
      const big = i >= 5;
      const dy = Math.sin(t * 0.08 + i * 0.5) * 4;
      arcadeText(ctx, TITLE[i], x, y + dy + (big ? 14 * scale : 0), {
        size: sizeOf(i), top: big ? '#fff6c0' : '#bff8ff', bottom: big ? '#ff7a1a' : '#22b8e8',
      });
      x += advance(i);
    }
  }

  // ---------------------------------------------------------------- splash / intro

  // `gated`: audio still locked, so wait for a key. `t` counts from the key.
  splash(t, gated) {
    const ctx = this.ctx;
    ctx.fillStyle = '#05020c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (gated) {
      this.starfield(t, 0.3);
      const gem = this.art.gems.purple[Math.floor(t / 4) % 8];
      ctx.drawImage(gem, VIEW_W / 2 - 24, VIEW_H / 2 - 80, 48, 48);
      arcadeText(ctx, 'PRESS ANY KEY', VIEW_W / 2, VIEW_H / 2 + 10, { size: 22, align: 'center', alpha: 0.6 + Math.sin(t * 0.08) * 0.4 });
      arcadeText(ctx, 'headphones recommended', VIEW_W / 2, VIEW_H / 2 + 44, { size: 10, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
      return;
    }
    // 0-150: studio card.
    if (t < 150) {
      const a = Math.min(1, t / 30, (150 - t) / 30);
      const gem = this.art.gems.purple[Math.floor(t / 4) % 8];
      ctx.globalAlpha = a;
      ctx.drawImage(gem, VIEW_W / 2 - 30, VIEW_H / 2 - 74, 60, 60);
      ctx.globalAlpha = 1;
      arcadeText(ctx, 'REA LABS', VIEW_W / 2, VIEW_H / 2, { size: 30, align: 'center', alpha: a, top: '#e8d8ff', bottom: '#9a6aff' });
      arcadeText(ctx, 'presents', VIEW_W / 2, VIEW_H / 2 + 40, { size: 12, align: 'center', alpha: a * 0.8, shadow: false, top: '#c8b8e8', bottom: '#c8b8e8' });
      return;
    }
    // 150+: warp starfield, the hero runs in, gems burst, logo slams down.
    const k = t - 150;
    this.starfield(t, Math.min(3, 0.5 + k / 60));
    const run = this.art.kip.run;
    const hx = Math.min(VIEW_W / 2, -60 + k * 5);
    const rf = run[Math.floor(t / 3) % run.length];
    ctx.drawImage(rf.right, hx - rf.ax, 300 - rf.ay);
    ctx.fillStyle = 'rgba(255,214,90,0.25)';
    ctx.fillRect(0, 300, VIEW_W, 2);
    if (k > 120) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + k * 0.01;
        const r = Math.min(220, (k - 120) * 4);
        const gem = this.art.gems[['red', 'green', 'blue', 'purple'][i % 4]][Math.floor(t / 4 + i) % 8];
        ctx.globalAlpha = Math.max(0, 1 - (k - 120) / 260);
        ctx.drawImage(gem, VIEW_W / 2 + Math.cos(a) * r - 10, 170 + Math.sin(a) * r * 0.6 - 10);
      }
      ctx.globalAlpha = 1;
    }
    if (k > 150) {
      const drop = Math.max(0, 180 - (k - 150) * 9);
      if (k >= 170 && k < 180) { ctx.fillStyle = `rgba(255,255,255,${(180 - k) / 10})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
      this.logo(t, 70 - drop, 1.15);
      if (k > 220) arcadeText(ctx, 'A fast platform adventure', VIEW_W / 2, 158, { size: 12, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0', alpha: Math.min(1, (k - 220) / 40) });
      if (k > 300) this.blink(t, 'Press any key', 228);
    }
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

  // A slowly panning view of the first level behind the menu.
  menuWorld(t) {
    if (!this.world) {
      const level = LEVELS[0]();
      const theme = level.meta.theme;
      const ts = THEME_TILESET[theme];
      this.world = {
        level,
        terrain: new TerrainRenderer(level, theme, this.art),
        sky: ts && BACKDROPS[ts] ? new Backdrop(this.art.tilesets[ts].pixels, ts, level, BACKDROP_SKY[ts] && new Sky(BACKDROP_SKY[ts])) : new Sky(theme),
      };
    }
    const w = this.world;
    const span = w.level.pixelW - VIEW_W;
    const camX = Math.round((Math.sin(t * 0.0009) * 0.5 + 0.5) * span);
    const camY = Math.round(w.level.meta.horizon * TILE - VIEW_H * 0.7);
    w.sky.draw(this.ctx, camX, camY, t);
    w.terrain.draw(this.ctx, camX, camY, VIEW_W, VIEW_H);
    this.dim(0.28);
  }

  title(t, save) {
    const ctx = this.ctx;
    this.menuWorld(t);
    if (this.sub === null) this.logo(t, 26);
    else this.logo(t, 10, 0.62);
    const stars = totalStars(save);
    const max = LEVELS.length * 3;
    if (this.sub === null) {
      this.panel(VIEW_W / 2 - 120, 114, 240, 166);
      this.menuList(MAIN, this.menu, 124, t);
      this.star(VIEW_W - 92, 16, 9, true);
      arcadeText(ctx, `${stars}/${max}`, VIEW_W - 78, 8, { size: 15, top: '#ffffff', bottom: '#ffd54a' });
      const run = this.art.kip.run;
      const kx = ((t * 3) % (VIEW_W + 120)) - 60;
      const rf = run[Math.floor(t / 3) % run.length];
      ctx.drawImage(rf.right, kx - rf.ax, VIEW_H - 22 - rf.ay);
    } else if (this.sub === 'levels') this.levelGrid(t, save);
    else if (this.sub === 'jj2') this.jj2List(t, save);
    else if (this.sub === 'help') this.help(t);
    else if (this.sub === 'options') this.options(t, save);
    else this.lobbyScreen(t);
    arcadeText(ctx, 'Fan project - sprites, tiles, sounds and music (c) Epic MegaGames, not for distribution', VIEW_W / 2, VIEW_H - 12, { size: 8, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
  }

  // Minimap of a level for its select card.
  thumb(i) {
    if (this.thumbs[i]) return this.thumbs[i];
    const level = LEVELS[i]();
    const W = 180; const H = 52;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x2 = c.getContext('2d');
    const img = x2.createImageData(W, H);
    const [sky, ground, back] = (THUMB[level.meta.theme] || THUMB.meadow).map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
    const sx = level.w / W; const sy = level.h / H;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tx = Math.floor(x * sx); const ty = Math.floor(y * sy);
        const ch = level.tiles[ty][tx];
        let col = level.back[ty][tx] ? back : sky;
        if (ch === '#' || ch === '=' || '/\\qryz'.includes(ch)) col = ground;
        else if (ch === '~') col = [255, 120, 30];
        else if (ch === '-') col = [230, 210, 160];
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
    this.dim(0.35);
    arcadeText(ctx, 'LEVELS', VIEW_W / 2, 84, { size: 18, align: 'center' });
    const cw = 196; const ch = 74; const x0 = (VIEW_W - cw * 3 - 16) / 2; const y0 = 112;
    LEVELS.forEach((make, i) => {
      const x = x0 + (i % 3) * (cw + 8); const y = y0 + Math.floor(i / 3) * (ch + 6);
      const open = i < save.unlocked;
      const on = i === this.menu;
      ctx.save();
      ctx.fillStyle = on ? 'rgba(60,30,90,0.92)' : 'rgba(14,8,32,0.85)';
      ctx.strokeStyle = on ? '#ffd54a' : 'rgba(150,120,200,0.6)';
      ctx.lineWidth = on ? 3 : 1;
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 8); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (open) {
        ctx.drawImage(this.thumb(i), x + 8, y + 6);
        arcadeText(ctx, `${i + 1}. ${make.title}`, x + 8, y + 58, { size: 10, shadow: false, top: '#ffffff', bottom: on ? '#ffd54a' : '#c8b8f0' });
        const rec = save.levels[i];
        for (let s = 0; s < 3; s++) this.star(x + cw - 44 + s * 15, y + 64, 6, !!(rec && rec.stars[s]));
      } else {
        arcadeText(ctx, 'LOCKED', x + cw / 2, y + 24, { size: 14, align: 'center', top: '#8a7aaa', bottom: '#5a4a7a' });
        arcadeText(ctx, `${i + 1}. ???`, x + 8, y + 58, { size: 10, shadow: false, top: '#8a7aaa', bottom: '#5a4a7a' });
      }
    });
    const sel = this.menu === LEVELS.length;
    arcadeText(ctx, 'BACK', VIEW_W / 2, VIEW_H - 32, { size: sel ? 16 : 13, align: 'center', top: sel ? '#ffffff' : '#b8a8d8', bottom: sel ? '#ffb02e' : '#7a6aa0' });
  }

  // Original JJ2 levels from Levels/, grouped by pack, with a map preview.
  jj2List(t, save) {
    const ctx = this.ctx;
    this.dim(0.55);
    this.panel(24, 70, VIEW_W - 48, 252, 0.88);
    arcadeText(ctx, 'CLASSIC JJ2 LEVELS', VIEW_W / 2, 78, { size: 16, align: 'center' });
    let y = 104;
    let n = 0;
    for (const pack of PACKS) {
      arcadeText(ctx, pack.title.toUpperCase(), 40, y, { size: 11, shadow: false, top: '#bff8ff', bottom: '#22b8e8' });
      y += 15;
      for (let i = 0; i < pack.levels.length; i++, n++) {
        const def = this.jj2[n];
        const on = n === this.jj2Index;
        const rec = save.levels[def.key];
        arcadeText(ctx, `${on ? '> ' : '  '}${def.title}`, 48, y, { size: 11, shadow: false, top: on ? '#ffffff' : '#c8b8f0', bottom: on ? '#ffd54a' : '#9a8ab0' });
        if (rec) for (let s = 0; s < 3; s++) this.star(262 + s * 12, y + 6, 5, rec.stars[s]);
        y += 14;
      }
      y += 4;
    }
    const sel = this.jj2Index === this.jj2.length;
    arcadeText(ctx, `${sel ? '> ' : '  '}BACK`, 48, y + 2, { size: 11, shadow: false, top: sel ? '#ffffff' : '#c8b8f0', bottom: sel ? '#ffb02e' : '#9a8ab0' });
    // Preview of the selected level (loaded on demand).
    // Load every level once, so the list shows real titles.
    for (const d of this.jj2) {
      if (d.loaded() || d.loading || d.error) continue;
      d.loading = true;
      d.prepare().catch((e) => { d.error = e.message; }).finally(() => { d.loading = false; });
    }
    const def = this.jj2[this.jj2Index];
    const bx = 326; const by = 100; const bw = 276; const bh = 150;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);
    if (def) {
      const got = def.loaded();
      if (got) {
        const map = preview(got.file, got.ts);
        const k = Math.min(bw / map.width, bh / map.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(map, bx + (bw - map.width * k) / 2, by + (bh - map.height * k) / 2, map.width * k, map.height * k);
        arcadeText(ctx, `${got.file.layers[3].w} x ${got.file.layers[3].h} tiles - ${got.ts.name}`, bx + bw / 2, by + bh + 6, { size: 9, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' });
      } else {
        arcadeText(ctx, def.error ? 'CAN\'T LOAD' : 'LOADING...', bx + bw / 2, by + bh / 2 - 8, { size: 12, align: 'center' });
      }
      wrap(def.error || def.pack.blurb, 46).forEach((line, i) => arcadeText(ctx, line, bx + bw / 2, by + bh + 22 + i * 12, { size: 9, align: 'center', shadow: false, top: def.error ? '#ffd0d8' : '#ffffff', bottom: def.error ? '#ff8a8a' : '#cfe6ff' }));
    }
  }

  help(t) {
    const ctx = this.ctx;
    this.dim(0.6);
    this.panel(40, 92, VIEW_W - 80, 214, 0.85);
    arcadeText(ctx, 'HOW TO PLAY', VIEW_W / 2, 100, { size: 18, align: 'center' });
    const lines = [
      ['ARROWS / WASD', 'move (hold SHIFT to run)'],
      ['SPACE / Z', 'jump - hold for higher, again in the air to hover'],
      ['DOWN, then JUMP', 'super jump (60% higher, smashes blocks above)'],
      ['DOWN in the air', 'butt-stomp: breaks stomp blocks, kills enemies'],
      ['X / J', 'blast     UP + X: uppercut'],
      ['Poles & springs', 'touch a pole to spin and fly; JUMP lets go'],
      ['Blocks', 'star: shoot  number: shoot N times  arrow: stomp'],
      ['', 'plain: run into it  !: crate that flips switch blocks'],
      ['Stars', 'exit  /  75% of gems  /  every secret'],
      ['P / M', 'pause / mute'],
    ];
    lines.forEach(([a, b], i) => {
      arcadeText(ctx, a, 60, 128 + i * 16, { size: 10, shadow: false, top: '#ffd54a', bottom: '#ffb02e' });
      arcadeText(ctx, b, 200, 128 + i * 16, { size: 10, shadow: false, top: '#ffffff', bottom: '#cfe6ff' });
    });
    this.blink(t, 'Press ENTER', 290, 12);
  }

  options(t, save) {
    const ctx = this.ctx;
    this.dim(0.5);
    this.panel(VIEW_W / 2 - 160, 100, 320, 170, 0.85);
    arcadeText(ctx, 'OPTIONS', VIEW_W / 2, 108, { size: 18, align: 'center' });
    const rows = [['MUSIC', save.options.music], ['EFFECTS', save.options.sfx]];
    rows.forEach(([label, v], i) => {
      const on = this.menu === i;
      const y = 146 + i * 30;
      arcadeText(ctx, label, VIEW_W / 2 - 130, y, { size: 14, top: on ? '#ffffff' : '#b8a8d8', bottom: on ? '#ffb02e' : '#7a6aa0' });
      ctx.fillStyle = '#1a0b1e'; ctx.fillRect(VIEW_W / 2 - 10, y + 3, 124, 12);
      ctx.fillStyle = on ? '#ffd54a' : '#9a7ad0'; ctx.fillRect(VIEW_W / 2 - 8, y + 5, Math.round(120 * v), 8);
    });
    const reset = this.menu === 2;
    arcadeText(ctx, this.resetArmed ? 'PRESS AGAIN TO ERASE' : 'RESET PROGRESS', VIEW_W / 2, 210, { size: reset ? 15 : 13, align: 'center', top: reset ? '#ffd0d8' : '#b8a8d8', bottom: reset ? '#e8244a' : '#7a6aa0' });
    const back = this.menu === 3;
    arcadeText(ctx, 'BACK', VIEW_W / 2, 240, { size: back ? 16 : 13, align: 'center', top: back ? '#ffffff' : '#b8a8d8', bottom: back ? '#ffb02e' : '#7a6aa0' });
    arcadeText(ctx, 'LEFT / RIGHT to change', VIEW_W / 2, 284, { size: 10, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
  }

  lobbyScreen(t) {
    const ctx = this.ctx;
    const L = this.lobby;
    this.dim(0.5);
    this.panel(VIEW_W / 2 - 200, 96, 400, 200, 0.88);
    arcadeText(ctx, 'PARTY MODE', VIEW_W / 2, 104, { size: 18, align: 'center' });
    if (this.sub === 'party') {
      arcadeText(ctx, 'Two players hunt gems. Shoot your rival to make', VIEW_W / 2, 134, { size: 10, align: 'center', shadow: false, top: '#ffffff', bottom: '#cfe6ff' });
      arcadeText(ctx, 'them drop gems; first to the exit with 100 wins!', VIEW_W / 2, 148, { size: 10, align: 'center', shadow: false, top: '#ffffff', bottom: '#cfe6ff' });
      this.menuList(['HOST A GAME', 'JOIN A GAME', 'BACK'], this.menu, 178, t);
      arcadeText(ctx, 'Run party.bat (serve.py --lan) so your friend can connect', VIEW_W / 2, 270, { size: 9, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
      return;
    }
    if (L.status === 'error') {
      arcadeText(ctx, L.error || 'Connection failed.', VIEW_W / 2, 160, { size: 10, align: 'center', shadow: false, top: '#ffd0d8', bottom: '#ff8a8a' });
      this.blink(t, 'Press ENTER', 250, 12);
      return;
    }
    if (this.sub === 'host') {
      if (!L.code) { arcadeText(ctx, 'Connecting...', VIEW_W / 2, 160, { size: 14, align: 'center' }); return; }
      arcadeText(ctx, 'ROOM CODE', VIEW_W / 2, 130, { size: 12, align: 'center' });
      arcadeText(ctx, L.code, VIEW_W / 2, 146, { size: 34, align: 'center', top: '#ffffff', bottom: '#5ae08a' });
      (L.urls || []).slice(0, 2).forEach((u, i) => arcadeText(ctx, `Friend opens ${u}`, VIEW_W / 2, 190 + i * 13, { size: 9, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' }));
      const lv = levelDef(PARTY_LEVELS[this.partyLevel]);
      arcadeText(ctx, `< ${lv.title} >`, VIEW_W / 2, 224, { size: 14, align: 'center', top: '#ffffff', bottom: '#ffd54a' });
      if (L.peer) this.blink(t, 'Player 2 is here! Press ENTER to start', 256, 12);
      else arcadeText(ctx, 'Waiting for player 2' + '.'.repeat(1 + Math.floor(t / 20) % 3), VIEW_W / 2, 256, { size: 12, align: 'center' });
      return;
    }
    // join
    if (L.joined) {
      arcadeText(ctx, `Joined room ${L.code}`, VIEW_W / 2, 150, { size: 16, align: 'center', top: '#ffffff', bottom: '#5ae08a' });
      arcadeText(ctx, 'Waiting for the host to start' + '.'.repeat(1 + Math.floor(t / 20) % 3), VIEW_W / 2, 190, { size: 12, align: 'center' });
      return;
    }
    arcadeText(ctx, 'Type the room code', VIEW_W / 2, 136, { size: 12, align: 'center' });
    const code = this.codeBuf.padEnd(4, '_');
    arcadeText(ctx, code.split('').join(' '), VIEW_W / 2, 160, { size: 34, align: 'center', top: '#ffffff', bottom: '#ffd54a' });
    if (L.error) arcadeText(ctx, L.error, VIEW_W / 2, 214, { size: 10, align: 'center', shadow: false, top: '#ffd0d8', bottom: '#ff8a8a' });
    arcadeText(ctx, 'ENTER to join   ESC to go back', VIEW_W / 2, 250, { size: 11, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' });
  }

  // Returns an action string when the player chooses something.
  titleInput(input, save) {
    const choose = input.pressed('start') || (this.sub !== 'join' && input.pressed('jump'));
    const back = input.pressed('pause');
    const move = (n, count) => { this.menu = (this.menu + n + count) % count; this.audio.play('menu'); };
    switch (this.sub) {
      case null:
        if (input.pressed('up')) move(-1, MAIN.length);
        if (input.pressed('down')) move(1, MAIN.length);
        if (!choose) return null;
        this.audio.play('select');
        if (this.menu === 0) return 'play';
        this.sub = SUBS[this.menu];
        this.menu = 0;
        return null;
      case 'jj2': {
        const n = this.jj2.length;
        const step = (d) => { this.jj2Index = (this.jj2Index + d + n + 1) % (n + 1); this.audio.play('menu'); };
        if (input.pressed('up')) step(-1);
        if (input.pressed('down')) step(1);
        if (back || (choose && this.jj2Index === n)) { this.sub = null; this.menu = 2; return null; }
        if (!choose) return null;
        const def = this.jj2[this.jj2Index];
        if (def.error) { this.audio.play('denied'); return null; }
        this.audio.play('select');
        return `level:${def.key}`;
      }
      case 'levels': {
        const n = LEVELS.length;
        if (input.pressed('left')) move(-1, n + 1);
        if (input.pressed('right')) move(1, n + 1);
        if (input.pressed('up')) { this.menu = this.menu === n ? n - 1 : Math.max(0, this.menu - 3); this.audio.play('menu'); }
        if (input.pressed('down')) { this.menu = Math.min(n, this.menu + 3); this.audio.play('menu'); }
        if (back || (choose && this.menu === n)) { this.sub = null; this.menu = 1; return null; }
        if (!choose) return null;
        if (this.menu < save.unlocked) { this.audio.play('select'); return `level:${this.menu}`; }
        this.audio.play('denied');
        return null;
      }
      case 'help':
        if (choose || back) { this.sub = null; this.menu = 4; this.audio.play('select'); }
        return null;
      case 'options':
        if (input.pressed('up')) { move(-1, 4); this.resetArmed = false; }
        if (input.pressed('down')) { move(1, 4); this.resetArmed = false; }
        if (this.menu < 2) {
          const key = this.menu === 0 ? 'music' : 'sfx';
          const d = (input.pressed('right') ? 0.1 : 0) - (input.pressed('left') ? 0.1 : 0);
          if (d) { save.options[key] = Math.round(Math.max(0, Math.min(1, save.options[key] + d)) * 10) / 10; this.audio.play('menu'); return 'options'; }
        }
        if (back || (choose && this.menu === 3)) { this.sub = null; this.menu = 5; this.resetArmed = false; return 'options'; }
        if (choose && this.menu === 2) {
          if (this.resetArmed) { this.resetArmed = false; this.audio.play('denied'); return 'reset'; }
          this.resetArmed = true; this.audio.play('menu');
        }
        return null;
      case 'party':
        if (input.pressed('up')) move(-1, 3);
        if (input.pressed('down')) move(1, 3);
        if (back || (choose && this.menu === 2)) { this.sub = null; this.menu = 3; return null; }
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
        if (choose && this.lobby.peer) return `party-start:${PARTY_LEVELS[this.partyLevel]}`;
        return null;
      case 'join':
        if (back || (choose && this.lobby.status === 'error')) { this.sub = 'party'; this.menu = 1; return 'leave'; }
        if (choose && !this.lobby.joined && this.codeBuf.length === 4) return `join:${this.codeBuf}`;
        return null;
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------- level card

  card(game, t, save) {
    const ctx = this.ctx;
    ctx.fillStyle = '#05020c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.starfield(t, 0.4);
    const meta = game.cardMeta;
    const slide = Math.max(0, 40 - t) * 8;
    const label = typeof game.cardIndex === 'number' ? `LEVEL ${game.cardIndex + 1}` : meta.label || 'CLASSIC JJ2';
    arcadeText(ctx, label, VIEW_W / 2 - slide, 70, { size: 16, align: 'center', top: '#bff8ff', bottom: '#22b8e8' });
    if (meta.error) arcadeText(ctx, `${meta.error} - press ENTER`, VIEW_W / 2, 296, { size: 11, align: 'center', top: '#ffd0d8', bottom: '#ff8a8a' });
    else if (meta.loading && t > 60) arcadeText(ctx, 'LOADING' + '.'.repeat(1 + Math.floor(t / 15) % 3), VIEW_W / 2, 296, { size: 11, align: 'center' });
    arcadeText(ctx, meta.title.toUpperCase(), VIEW_W / 2 + slide, 94, { size: 32, align: 'center' });
    arcadeText(ctx, meta.tip, VIEW_W / 2, 140, { size: 11, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0', alpha: Math.min(1, t / 40) });
    const rec = save && save.levels[game.cardIndex];
    MISSIONS.forEach((m, i) => {
      const y = 172 + i * 22;
      const a = Math.min(1, Math.max(0, (t - 30 - i * 10) / 20));
      ctx.globalAlpha = a;
      this.star(VIEW_W / 2 - 110, y + 7, 7, !!(rec && rec.stars[i]));
      ctx.globalAlpha = 1;
      arcadeText(ctx, m, VIEW_W / 2 - 96, y, { size: 12, alpha: a, top: '#ffffff', bottom: '#ffd54a' });
    });
    if (rec) arcadeText(ctx, `BEST ${rec.score}   ${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, '0')}`, VIEW_W / 2, 248, { size: 11, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
    const idle = this.art.kip.victory;
    const cf = idle[Math.min(idle.length - 1, Math.floor(t / 8))];
    ctx.drawImage(cf.right, VIEW_W / 2 - cf.ax, 320 - cf.ay);
  }

  // ---------------------------------------------------------------- pause

  pause(t) {
    this.dim(0.6);
    arcadeText(this.ctx, 'PAUSED', VIEW_W / 2, 90, { size: 32, align: 'center' });
    this.menuList(['RESUME', 'RESTART LEVEL', 'QUIT TO TITLE'], this.pauseIndex, 150, t);
  }

  pauseInput(input) {
    if (input.pressed('up')) { this.pauseIndex = (this.pauseIndex + 2) % 3; this.audio.play('menu'); }
    if (input.pressed('down')) { this.pauseIndex = (this.pauseIndex + 1) % 3; this.audio.play('menu'); }
    if (input.pressed('pause')) return 'resume';
    if (input.pressed('start') || input.pressed('jump')) {
      this.audio.play('select');
      return ['resume', 'restart', 'quit'][this.pauseIndex];
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
    this.dim(Math.min(0.75, k / 40));
    arcadeText(ctx, 'LEVEL CLEAR!', VIEW_W / 2, 26, { size: 30, align: 'center' });
    // Stars pop in one by one.
    const res = game.result || { stars: [true, false, false], newStars: [false, false, false] };
    for (let i = 0; i < 3; i++) {
      if (k < 20 + i * 18) continue;
      const pop = Math.max(1, 2.2 - (k - 20 - i * 18) / 6);
      this.star(VIEW_W / 2 - 50 + i * 50, 88, 16 * pop, res.stars[i]);
      if (k === 20 + i * 18 && res.stars[i]) this.audio.play('rank');
      if (res.newStars[i] && k > 40 + i * 18) arcadeText(ctx, 'NEW', VIEW_W / 2 - 50 + i * 50, 108, { size: 9, align: 'center', top: '#ffffff', bottom: '#5ae08a' });
    }
    const rows = [
      ['GEMS', `${s.gems}%`],
      ['SECRETS', `${s.secrets}%`],
      ['ENEMIES', `${s.enemies}%`],
      ['TIME', `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}${res.bestTime ? '  BEST!' : ''}`],
      ['BONUS', `${s.bonus.time + s.bonus.gems + s.bonus.perfect}`],
      ['SCORE', `${game.score}${res.bestScore ? '  BEST!' : ''}`],
    ];
    rows.forEach(([label, value], i) => {
      if (k < 80 + i * 14) return;
      arcadeText(ctx, label, VIEW_W / 2 - 150, 132 + i * 22, { size: 13, top: '#e8d8ff', bottom: '#9a8ad0' });
      arcadeText(ctx, value, VIEW_W / 2 + 150, 132 + i * 22, { size: 13, align: 'right', top: '#ffffff', bottom: '#ffd54a' });
      if (k === 80 + i * 14) this.audio.play('tally');
    });
    if (k > 180) {
      const pop = Math.max(1, 3 - (k - 180) / 6);
      arcadeText(ctx, s.rank, VIEW_W / 2 + 220, 150, {
        size: Math.round(54 * pop), align: 'center',
        top: s.rank === 'S' ? '#fff6c0' : '#ffffff', bottom: s.rank === 'S' ? '#ff4ad8' : '#ffb02e',
      });
      arcadeText(ctx, 'RANK', VIEW_W / 2 + 220, 130, { size: 11, align: 'center' });
    }
    if (k > 210) this.blink(k, 'Press ENTER', VIEW_H - 34);
  }

  // ---------------------------------------------------------------- game over / win

  gameOver(game, t) {
    this.dim(Math.min(0.8, t / 60));
    const drop = Math.max(0, 60 - t) * 3;
    arcadeText(this.ctx, 'GAME OVER', VIEW_W / 2, 120 - drop, { size: 40, align: 'center', top: '#ffd0d8', bottom: '#e8244a' });
    arcadeText(this.ctx, `SCORE ${game.score}`, VIEW_W / 2, 180, { size: 16, align: 'center', alpha: Math.min(1, t / 80) });
    if (t > 90) this.blink(t, 'Press ENTER', 230);
  }

  win(game, t) {
    const ctx = this.ctx;
    this.sky.draw(ctx, t, 0, t);
    this.weather.update(t, 0, t);
    this.weather.draw(ctx, true, t);
    arcadeText(ctx, 'YOU WIN!', VIEW_W / 2, 50, { size: 40, align: 'center' });
    const v = this.art.kip.victory;
    const vf = v[Math.min(v.length - 1, Math.floor(t / 8))];
    ctx.drawImage(vf.right, VIEW_W / 2 - vf.ax, 170 - vf.ay);
    arcadeText(ctx, `FINAL SCORE ${game.score}`, VIEW_W / 2, 186, { size: 16, align: 'center' });
    arcadeText(ctx, `GEMS ${game.gems}   COINS ${game.coins}`, VIEW_W / 2, 212, { size: 12, align: 'center' });
    const credits = ['Sprites, tiles, sound effects and music: Jazz Jackrabbit 2 (c) Epic MegaGames', 'Sprite rips via The Spriters Resource - not owned by this project', 'Thanks for playing!'];
    credits.forEach((c, i) => arcadeText(ctx, c, VIEW_W / 2, 250 + i * 18, { size: 10, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' }));
    if (t > 120) this.blink(t, 'Press ENTER', VIEW_H - 26, 12);
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
