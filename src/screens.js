// Splash intro, main menu (live level backdrop, level select with thumbnails
// and stars, party lobby, options, help), level cards, pause, tally, game
// over and win screens, and the iris transition.

import { arcadeText, jjText, jjWidth } from './art.js';
import { VIEW_H, VIEW_W } from './config.js';
import { allJJ2, discoverPacks, PACKS } from './jj2/catalog.js';
import { preview } from './jj2/preview.js';
import { LEVELS, levelDef } from './levels.js';
import { PARTY_LEVELS } from './party.js';
import { MISSIONS, totalStars } from './save.js';
import { frameAt } from './sheets.js';
import { Sky, Weather } from './sky.js';

const MAIN = ['New Game', 'Party', 'How to Play', 'Options'];
const SUBS = ['char', 'party', 'help', 'options'];
const CHARACTERS = [
  { id: 'jazz', moves: ['Copter ears: JUMP again in the air', 'Uppercut: UP + FIRE'] },
  { id: 'spaz', moves: ['Double jump: JUMP again in the air', 'Side kick: UP + FIRE'] },
  { id: 'lori', moves: ['Copter ears: JUMP again in the air', 'Flying kick: UP + FIRE'] },
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
    this.top(this.art.screens.title_plus);
    if (this.sub === null) {
      // Darken the left side for the menu.
      const g = ctx.createLinearGradient(0, 0, 330, 0);
      g.addColorStop(0, 'rgba(8,4,24,0.88)'); g.addColorStop(0.7, 'rgba(8,4,24,0.55)'); g.addColorStop(1, 'rgba(8,4,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 330, VIEW_H);
      this.menuList(MAIN, this.menu, 150, t, 36, 46, 'left');
      this.star(54, VIEW_H - 38, 9, true);
      this.med(`${totalStars(save)} / ${LEVELS.length * 3}`, 68, VIEW_H - 47, { scale: 0.7 });
    } else {
      this.dim(0.8);
      if (this.sub === 'char') this.charSelect(t, save);
      else if (this.sub === 'episodes') this.episodeSelect(t, save);
      else if (this.sub === 'levels') this.levelGrid(t, save);
      else if (this.sub === 'jj2') this.jj2List(t, save);
      else if (this.sub === 'help') this.help(t);
      else if (this.sub === 'options') this.options(t, save);
      else this.lobbyScreen(t);
    }
    arcadeText(ctx, 'Fan project - sprites, tiles, sounds and music (c) Epic MegaGames, not for distribution', VIEW_W / 2, VIEW_H - 12, { size: 8, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
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
      if (on) c.moves.forEach((m, k) => this.med(m, x, 290 + k * 15, { align: 'center', scale: 0.55 }));
    });
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
    wrap(ep.blurb, 34).slice(0, 3).forEach((line, i) => this.med(line, 470, y + h + 10 + i * 14, { align: 'center', scale: 0.55 }));
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
      const label = def ? def.title : 'Back';
      this.med(label, 60, y, { scale: on ? 0.7 : 0.62, color: on ? null : def && def.error ? '#7a6a8a' : '#b8a8e0', wave: on ? 2 : 0, t });
      if (on) ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], 32, y);
      if (rec) for (let s = 0; s < 3; s++) this.star(282 + s * 12, y + 7, 5, rec.stars[s]);
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
        const k = Math.min(bw / map.width, bh / map.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(map, bx + (bw - map.width * k) / 2, by + (bh - map.height * k) / 2, map.width * k, map.height * k);
        this.med(`${got.file.layers[3].w} x ${got.file.layers[3].h} tiles - ${got.ts.name}`, bx + bw / 2, by + bh + 6, { align: 'center', scale: 0.5, color: '#c8b8f0' });
      } else {
        this.med(def.error ? 'Can not load' : 'Loading...', bx + bw / 2, by + bh / 2 - 8, { align: 'center', scale: 0.7 });
      }
      wrap(def.error || def.pack.blurb, 40).slice(0, 4).forEach((line, i) => this.med(line, bx + bw / 2, by + bh + 24 + i * 13, { align: 'center', scale: 0.52, color: def.error ? '#ff9a9a' : null }));
    }
  }

  help(t) {
    const ctx = this.ctx;
    this.dim(0.6);
    this.panel(40, 92, VIEW_W - 80, 214, 0.85);
    arcadeText(ctx, 'HOW TO PLAY', VIEW_W / 2, 100, { size: 18, align: 'center' });
    const lines = [
      ['ARROWS / WASD', 'move (hold SHIFT to run)'],
      ['SPACE / Z', 'jump - hold for higher; again in the air:'],
      ['', 'Jazz & Lori hover on their ears, Spaz jumps again'],
      ['DOWN, then JUMP', 'super jump (60% higher, smashes blocks above)'],
      ['DOWN in the air', 'butt-stomp: breaks stomp blocks, kills enemies'],
      ['X / J', 'blast    UP + X: uppercut (Jazz) or kick (Spaz, Lori)'],
      ['Poles & vines', 'touch a pole to spin and fly; hang from vines'],
      ['Blocks', 'star: shoot  number: shoot N times  arrow: stomp'],
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
        if (def.error) { this.audio.play('denied'); return null; }
        this.audio.play('select');
        return `level:${def.key}`;
      }
      case 'help':
        if (choose || back) { this.sub = null; this.menu = 2; this.audio.play('select'); }
        return null;
      case 'options':
        if (input.pressed('up')) { move(-1, 4); this.resetArmed = false; }
        if (input.pressed('down')) { move(1, 4); this.resetArmed = false; }
        if (this.menu < 2) {
          const key = this.menu === 0 ? 'music' : 'sfx';
          const d = (input.pressed('right') ? 0.1 : 0) - (input.pressed('left') ? 0.1 : 0);
          if (d) { save.options[key] = Math.round(Math.max(0, Math.min(1, save.options[key] + d)) * 10) / 10; this.audio.play('menu'); return 'options'; }
        }
        if (back || (choose && this.menu === 3)) { this.sub = null; this.menu = 3; this.resetArmed = false; return 'options'; }
        if (choose && this.menu === 2) {
          if (this.resetArmed) { this.resetArmed = false; this.audio.play('denied'); return 'reset'; }
          this.resetArmed = true; this.audio.play('menu');
        }
        return null;
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
    if (meta.error) this.med(`${meta.error} - press ENTER`, VIEW_W / 2, 306, { align: 'center', scale: 0.55, color: '#b0180c' });
    else if (rec) this.med(`Best ${rec.score}   ${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, '0')}`, VIEW_W / 2, 306, { align: 'center', scale: 0.5, color: '#8a4a1a' });
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

  // Game over: JJ2's "Continue?" screen. LEFT/RIGHT pick NO or YES.
  gameOver(game, t) {
    const ctx = this.ctx;
    this.fit(this.art.screens.continue, Math.min(1, t / 40));
    if (t < 40) return;
    // The NO and YES of the picture sit at (277, 302) and (358, 302).
    const x = this.continueYes ? 358 : 277;
    const gem = this.art.gems.red[Math.floor(t / 5) % 8];
    ctx.drawImage(gem, x - gem.width / 2, 312 + Math.sin(t * 0.15) * 2);
    this.med(`Score ${game.score}`, VIEW_W / 2, 336, { align: 'center', scale: 0.6 });
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
