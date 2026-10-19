// Splash intro, main menu (live level backdrop, level select with thumbnails
// and stars, party lobby, options, help), level cards, pause, tally, game
// over and win screens, and the iris transition.

import { arcadeText, jjText, jjWidth } from './art.js';
import { VIEW_H, VIEW_W } from './config.js';
import { ACTION_NAMES, clearKey, connectedPads, defaultKeys, KEY_SLOTS, keyName, REBINDABLE } from './input.js';
import { discoverPacks, MODES, PACKS, playableJJ2, scanPlayable, soloJJ2 } from './jj2/catalog.js';
import { preview } from './jj2/preview.js';
import { LANGS, tr } from './lang.js';
import { LEVELS, levelDef } from './levels.js';
import { MAX_PLAYERS, MODE_INFO, partyLevels, SLOTS, TRUCES } from './party.js';
import { cleanName, DIFFICULTIES, MISSIONS, SAVE_SLOTS, SCORE_ROWS, totalStars } from './save.js';
import { AREA } from './level.js';
import { frameAt, tilePixel } from './sheets.js';
import { TERRAIN_THEMES } from './terrain.js';
import { THEME_TILESET } from './tilesets.js';
import { Sky, Weather } from './sky.js';

const MAIN = ['New Game', 'Load Game', 'Party', 'High Scores', 'Help', 'Options'];
const MAIN_INFO = [
  "Kip's Gem Rush or a classic JJ2 episode",
  'Carry on with a game you saved',
  'Up to five players, online or on one computer',
  'The best scores so far',
  'Controls, moves and blocks',
  'Volume, controls, video and language',
];
const SUBS = ['char', 'load', 'party', 'scores', 'help', 'options'];
const mainIndex = (sub) => SUBS.indexOf(sub);
const PAUSE_ITEMS = ['RESUME', 'SAVE GAME', 'LOAD GAME', 'OPTIONS', 'RESTART LEVEL', 'QUIT TO TITLE'];
const PAUSE_ACTIONS = ['resume', 'save', 'load', 'options', 'restart', 'quit'];
// The manual's difficulty levels.
const DIFF_INFO = {
  easy: ["Nothing a gung-ho rookie damsel-in-distress rescuer can't handle.", 'Fewer enemies.'],
  medium: ['A challenge for most stouthearted superhares.', 'Every enemy the level has.'],
  hard: ['The difficulty level of choice for seasoned turtle thumpers.', 'More enemies.'],
};
const DIFF_NAME = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
// Options screens (shared by the title and the pause menu).
const OPTION_SUBS = ['options', 'keys', 'video', 'lang'];
const CHARACTERS = [
  { id: 'jazz', moves: ['Copter ears: JUMP again in the air', 'Uppercut: DOWN, then JUMP'] },
  { id: 'spaz', moves: ['Double jump: JUMP again in the air', 'Side kick: DOWN, then JUMP'] },
  { id: 'lori', moves: ['Copter ears: JUMP again in the air', 'Flying kick: DOWN, then JUMP'] },
];
// Episode pictures (JJ2's episode select) for this game and each level pack.
// The original episodes have their own pictures; the other packs borrow one.
const EPISODE_ART = {
  prince: 'prince', rescue: 'time', flash: 'flashback', monk: 'monkeys', secretf: 'secret', share: 'demo', homecooked: 'homecooked', xmas: 'christmas', easter: 'secret',
  kip: 'christmas', xx: 'time', episode2: 'flashback', overgrown: 'monkeys', bl18: 'christmas', threed: 'secret', backintime: 'prince', stefan: 'flashback',
};
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
    this.jj2 = soloJJ2();
    this.jj2Index = 0;
    // Unplayable levels (missing tile sets) drop out once they're checked.
    this.jj2all = playableJJ2();
    discoverPacks().then(() => scanPlayable()).then(() => { this.jj2 = soloJJ2(); this.jj2all = playableJJ2(); });
    this.pauseIndex = 0;
    this.thumbs = [];
    this.codeBuf = '';
    this.lobby = { status: 'idle' };   // filled in by main.js for the party lobby
    // Party settings being picked (host and split screen): indexes into the
    // game types, their levels, goals and truce lengths; `row` is the cursor.
    this.ps = { row: 0, mode: 0, level: 0, goal: 0, truce: 0 };
    this.resetArmed = false;
    this.keyCol = 0;           // keyboard screen: which key slot
    this.capturing = null;     // keyboard screen: waiting for a key { action, col }
    this.keyPage = 0;          // controls screen: 0 keyboard 1, 1 keyboard 2, 2 gamepad
    this.typing = null;        // typing a name: { kind: 'slot' | 'score', buf, slot }
    this.slotArmed = -1;       // load screen: slot waiting for a second CLEAR
    this.scorePage = 0;        // high scores: 0 the table, 1 level bests
    this.highlight = -1;       // high scores: the row just added
    this.toast = null;         // { text, t }: a short note at the top of the screen
    window.addEventListener('keydown', (e) => {
      if (this.typing) {
        const T = this.typing;
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (!e.altKey) T.done = true; } else if (e.code === 'Escape') T.cancel = true;
        // The suggested name goes as soon as you type over it.
        else if (e.code === 'Backspace') { T.buf = T.fresh ? '' : T.buf.slice(0, -1); T.fresh = false; e.preventDefault(); } else if (e.key && e.key.length === 1) { T.buf = cleanName((T.fresh ? '' : T.buf) + e.key); T.fresh = false; e.preventDefault(); }
        return;
      }
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
        const w = jjWidth(font, tr(label), scale);
        const left = align === 'center' ? x - w / 2 : x;
        this.ctx.drawImage(gem, left - gem.width - 8, y + i * gap + 2);
        if (align === 'center') this.ctx.drawImage(gem, left + w + 8, y + i * gap + 2);
      }
    });
  }

  // Menu text, in the chosen language (src/lang.js); `raw` draws it as it
  // is (key names).
  big(str, x, y, opts = {}) { jjText(this.ctx, this.art.fonts.big, opts.raw ? str : tr(str), x, y, { scale: 0.5, ...opts }); }
  med(str, x, y, opts = {}) { jjText(this.ctx, this.art.fonts.med, opts.raw ? str : tr(str), x, y, { scale: 0.75, ...opts }); }

  // Medium text shrunk (if need be) to fit `width` pixels.
  fitMed(str, x, y, width, opts = {}) {
    const scale = opts.scale || 0.75;
    const w = jjWidth(this.art.fonts.med, tr(str), scale);
    this.med(str, x, y, { ...opts, scale: w > width ? scale * (width / w) : scale });
  }

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
    text = tr(text);
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
      this.subScreen(t, save);
    }
    arcadeText(ctx, tr('Fan project - sprites, tiles, sounds and music (c) Epic MegaGames, not for distribution'), VIEW_W / 2, VIEW_H - 12, { size: 8, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
  }

  // A menu screen (from the title, or the pause menu for options, help,
  // saving and loading).
  subScreen(t, save) {
    if (this.sub === 'char') this.charSelect(t, save);
    else if (this.sub === 'diff') this.diffSelect(t, save);
    else if (this.sub === 'episodes') this.episodeSelect(t, save);
    else if (this.sub === 'levels') this.levelGrid(t, save);
    else if (this.sub === 'jj2') this.jj2List(t, save);
    else if (this.sub === 'help') this.help(t, save);
    else if (this.sub === 'options') this.options(t, save);
    else if (this.sub === 'keys') this.keysScreen(t, save);
    else if (this.sub === 'video') this.videoScreen(t, save);
    else if (this.sub === 'lang') this.langScreen(t, save);
    else if (this.sub === 'load' || this.sub === 'save') this.slotsScreen(t, save);
    else if (this.sub === 'scores') this.scoresScreen(t, save);
    else if (this.sub === 'name') this.nameScreen(t, save);
    else this.lobbyScreen(t, save);
  }

  // A short note at the top of the screen (screen size, saved, gamepad).
  drawToast() {
    const n = this.toast;
    if (!n) return;
    if (++n.t > 110) { this.toast = null; return; }
    const ctx = this.ctx;
    const a = Math.min(1, (110 - n.t) / 20);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '14px "Arial Black", Impact, sans-serif';
    const w = ctx.measureText(n.text).width + 28;
    ctx.fillStyle = 'rgba(10,4,26,0.85)';
    ctx.strokeStyle = '#ffd54a';
    ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - w / 2, 8, w, 26, 8); ctx.fill(); ctx.stroke();
    ctx.restore();
    arcadeText(ctx, n.text, VIEW_W / 2, 12, { size: 14, align: 'center', alpha: a });
  }

  say(text) { this.toast = { text: tr(text), t: 0 }; }

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
    // Six items: shrink them (and the gaps) to fit the width.
    const gap = 18;
    const full = MAIN.reduce((a, label) => a + jjWidth(font, tr(label), 1), 0);
    const big = Math.min(0.46, (VIEW_W - 24 - gap * (MAIN.length - 1)) / full);
    const slots = MAIN.map((label) => jjWidth(font, tr(label), big));
    let x = (VIEW_W - slots.reduce((a, b) => a + b, 0) - gap * (MAIN.length - 1)) / 2;
    const y = 294;
    MAIN.forEach((label, i) => {
      const on = i === this.menu;
      const cx = x + slots[i] / 2;
      this.big(label, cx, on ? y - 2 : y, { align: 'center', scale: on ? big : big * 0.87, color: on ? null : '#a898d0', wave: on ? 2 : 0, t });
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

  // Easy, Medium or Hard, in the manual's words.
  diffSelect(t, save) {
    this.big('SELECT DIFFICULTY', VIEW_W / 2, 14, { align: 'center', scale: 0.5 });
    this.panel(90, 50, VIEW_W - 180, 250, 0.85);
    this.menuList(DIFFICULTIES.map((d) => DIFF_NAME[d]), this.menu, 74, t, 40);
    const [quote, rule] = DIFF_INFO[DIFFICULTIES[this.menu]];
    this.wrapTo(quote, VIEW_W - 240, 0.55).forEach((line, i) => this.med(line, VIEW_W / 2, 206 + i * 15, { align: 'center', scale: 0.55, color: '#ece4ff' }));
    this.med(rule, VIEW_W / 2, 250, { align: 'center', scale: 0.55, color: '#ffd54a' });
    this.med('UP / DOWN to choose   ENTER to go on', VIEW_W / 2, VIEW_H - 34, { align: 'center', scale: 0.55, color: '#c8b8e8' });
  }

  // Save slots: LOAD lists them to pick from, SAVE (from the pause menu) to
  // write over. Each shows its name, level, score, hero and difficulty.
  slotsScreen(t, save) {
    const ctx = this.ctx;
    const saving = this.sub === 'save';
    this.big(saving ? 'SAVE GAME' : 'LOAD GAME', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(40, 38, VIEW_W - 80, 290, 0.88);
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const slot = save.slots[i];
      const y = 48 + i * 31;
      const on = i === this.menu;
      if (on) { ctx.fillStyle = 'rgba(255,214,90,0.10)'; ctx.fillRect(52, y - 3, VIEW_W - 104, 29); ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], 56, y + 3); }
      if (!slot) { this.med(`${i + 1}.  ${saving ? tr('EMPTY SLOT') : '- - -'}`, 84, y + 6, { scale: 0.58, color: on ? null : '#7a6aa0' }); continue; }
      const armed = this.slotArmed === i;
      this.med(`${i + 1}.  ${armed ? tr('CLEAR AGAIN TO ERASE') : slot.name}`, 84, y, { scale: 0.6, color: armed ? '#ff9a9a' : on ? null : '#d8ccf4', wave: on ? 1 : 0, t });
      const title = slot.title || '';
      this.med(slot.date || '', VIEW_W - 64, y + 1, { align: 'right', scale: 0.45, color: '#8a7ab0' });
      const hero = (slot.character || 'jazz').toUpperCase();
      const info = `${title}   ${tr('{0} POINTS', slot.stats.score)}   ${tr('{0} LIVES', slot.stats.lives)}   ${hero}   ${tr(DIFF_NAME[slot.difficulty] || 'MEDIUM')}`;
      this.med(info, 106, y + 14, { scale: 0.45, color: '#b8a8e0' });
    }
    const back = this.menu === SAVE_SLOTS;
    const by = 48 + SAVE_SLOTS * 31 + 2;
    this.med('BACK', 84, by, { scale: back ? 0.66 : 0.6, color: back ? null : '#b8a8e0', wave: back ? 2 : 0, t });
    if (back) ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], 56, by);
    const hint = saving ? 'ENTER to save here' : 'ENTER to load   CLEAR twice to erase';
    this.med(`${tr(hint)}   ${tr('ESC to go back')}`, VIEW_W / 2, VIEW_H - 26, { align: 'center', scale: 0.5, color: '#c8b8e8' });
  }

  // Typing a name: for a saved game, or a new high score.
  nameScreen(t, save) {
    const T = this.typing;
    if (!T) return;
    this.panel(VIEW_W / 2 - 220, 70, 440, 200, 0.92);
    if (T.kind === 'pname' || T.kind === 'hostpw' || T.kind === 'pw') {
      this.big({ pname: 'YOUR NAME', hostpw: 'ROOM PASSWORD', pw: 'PASSWORD' }[T.kind], VIEW_W / 2, 84, { align: 'center', scale: 0.55 });
      this.med({ pname: 'The other players see it over your head', hostpw: 'Leave it empty for an open game', pw: tr('Room {0} is locked', T.code) }[T.kind], VIEW_W / 2, 124, { align: 'center', scale: 0.5, color: '#c8b8e8' });
    } else if (T.kind === 'score') {
      this.big('NEW HIGH SCORE!', VIEW_W / 2, 84, { align: 'center', scale: 0.6, wave: 2, t });
      this.med(`${tr('{0} POINTS', T.score)}   ${tr('RANK {0}', T.rank + 1)}`, VIEW_W / 2, 124, { align: 'center', scale: 0.65 });
      this.med('Type your name', VIEW_W / 2, 150, { align: 'center', scale: 0.55, color: '#c8b8e8' });
    } else {
      this.big('NAME YOUR GAME', VIEW_W / 2, 84, { align: 'center', scale: 0.55 });
      const old = save.slots[T.slot];
      this.med(old ? tr('Replaces {0}', old.name) : tr('Slot {0}', T.slot + 1), VIEW_W / 2, 124, { align: 'center', scale: 0.55, color: old ? '#ffb0b8' : '#c8b8e8' });
    }
    const cursor = Math.floor(t / 20) % 2 ? '_' : ' ';
    this.big(`${T.buf}${cursor}`, VIEW_W / 2, 178, { align: 'center', scale: 0.6, color: T.fresh ? '#b8a8e0' : null });
    this.med('ENTER when done   ESC to cancel', VIEW_W / 2, 240, { align: 'center', scale: 0.5, color: '#c8b8e8' });
  }

  // The high score table, and (RIGHT) the best score, time and stars of
  // each of this game's levels.
  scoresScreen(t, save) {
    const ctx = this.ctx;
    this.big('HIGH SCORES', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(40, 40, VIEW_W - 80, 280, 0.88);
    const head = { scale: 0.48, color: '#8a7ab0' };
    if (this.scorePage === 0) {
      this.med('NAME', 110, 50, head);
      this.med('SCORE', 360, 50, { ...head, align: 'right' });
      this.med('REACHED', 390, 50, head);
      save.scores.slice(0, SCORE_ROWS).forEach((r, i) => {
        const y = 70 + i * 23;
        const on = i === this.highlight;
        if (on) { ctx.fillStyle = 'rgba(255,214,90,0.14)'; ctx.fillRect(52, y - 4, VIEW_W - 104, 21); }
        const color = on ? null : i < 3 ? '#ffe8a0' : '#d8ccf4';
        this.med(`${i + 1}.`, 96, y, { align: 'right', scale: 0.6, color });
        this.med(r.name, 110, y, { scale: 0.6, color, wave: on ? 2 : 0, t });
        this.med(String(r.score), 360, y, { align: 'right', scale: 0.6, color });
        const where = r.seed ? '' : `${r.level || ''}${r.difficulty ? `  ${tr(DIFF_NAME[r.difficulty])[0]}` : ''}`;
        let label = where;
        while (label.length > 4 && jjWidth(this.art.fonts.med, label, 0.45) > 196) label = `${label.slice(0, -4).trimEnd()}...`;
        this.med(label, 390, y + 2, { scale: 0.45, color: '#b8a8e0' });
      });
    } else {
      this.med("KIP'S GEM RUSH - BEST OF EACH LEVEL", VIEW_W / 2, 50, { ...head, align: 'center' });
      LEVELS.forEach((make, i) => {
        const y = 72 + i * 26;
        const rec = save.levels[i];
        const open = i < save.unlocked;
        this.med(`${i + 1}. ${open ? make.title : '???'}`, 70, y, { scale: 0.56, color: open ? '#d8ccf4' : '#7a6aa0' });
        if (!rec) { this.med('-', 420, y, { align: 'right', scale: 0.56, color: '#7a6aa0' }); return; }
        this.med(String(rec.score), 420, y, { align: 'right', scale: 0.56 });
        if (rec.seconds !== null) this.med(`${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, '0')}`, 490, y, { align: 'right', scale: 0.56, color: '#c8b8f0' });
        for (let k = 0; k < 3; k++) this.star(516 + k * 13, y + 7, 5.5, rec.stars[k]);
      });
    }
    this.med(`${tr(this.scorePage === 0 ? 'RIGHT: best of each level' : 'LEFT: the high score table')}   ${tr('ESC to go back')}`, VIEW_W / 2, VIEW_H - 32, { align: 'center', scale: 0.5, color: '#c8b8e8' });
  }

  // The episodes: this game's own levels and every JJ2 level pack.
  episodes() {
    return [
      { id: 'kip', title: "Kip's Gem Rush", blurb: 'Nine big levels made for this game: beaches, castles, towns, ice, groves, candy clouds, tubes, lava and crystal caves.', count: LEVELS.length },
      ...PACKS.map((pack) => ({ id: pack.id, title: pack.title, blurb: pack.blurb, pack, count: this.jj2.filter((d) => d.pack === pack).length }))
        .filter((ep) => ep.count > 0),
    ];
  }

  episodeSelect(t, save) {
    const ctx = this.ctx;
    this.big('EPISODE SELECT', VIEW_W / 2, 14, { align: 'center', scale: 0.5 });
    const eps = this.episodes();
    this.episode = Math.min(this.episode, eps.length - 1);   // the list can shrink after the check
    eps.forEach((ep, i) => {
      const on = i === this.episode;
      const y = 58 + i * 34;
      this.med(ep.title, 52, y, { scale: on ? 0.72 : 0.64, color: on ? null : '#9d8fc8', wave: on ? 2 : 0, t });
      this.med(ep.count === 1 ? tr('1 level') : tr('{0} levels', ep.count), 52, y + 17, { scale: 0.45, color: '#8a7ab0' });
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
    wrap(tr(ep.blurb), 34).slice(0, 5).forEach((line, i) => this.med(line, 470, y + h + 10 + i * 14, { align: 'center', scale: 0.55 }));
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
    this.jj2Index = Math.min(this.jj2Index, list.length);
    const first = Math.max(0, Math.min(rows.length - shown, this.jj2Index - 5));
    rows.slice(first, first + shown).forEach((def, k) => {
      const n = first + k;
      const y = 98 + k * 19;
      const on = n === this.jj2Index;
      const rec = def && save.levels[def.key];
      // Long titles shrink (then get cut) so they stop short of the stars.
      const room = (rec ? 284 : 314) - 60;
      let label = def ? def.title : tr('Back');
      // Two levels share a title in some packs: tell them apart.
      const twin = def && list.findIndex((o) => o !== def && o.title === def.title);
      if (def && twin >= 0) label += def.story ? ` - ${tr('story')}` : twin < list.indexOf(def) ? ' II' : '';
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
        this.med(tr('{0} x {1} tiles - {2}', got.file.layers[3].w, got.file.layers[3].h, got.ts.name), bx + bw / 2, by + bh + 4, { align: 'center', scale: 0.5, color: '#c8b8f0' });
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
      [`${n('left')} / ${n('right')}`, tr('move - hold {0} to run', n('run'))],
      [n2('jump'), 'jump - hold for higher; again in the air:'],
      ['', 'Jazz and Lori hover on their ears, Spaz jumps again'],
      [tr('{0}, then {1}', n('down'), n('jump')), 'uppercut, Jazz / kick; sliding: super jump'],
      [tr('{0} in the air', n('down')), 'butt-stomp: breaks stomp blocks, kills enemies'],
      [n2('shoot'), tr('fire    {0} and {1}: aim up, diagonal while moving', n('up'), n('shoot'))],
      [`${n('weapon')}, 1-9`, 'change weapon: bouncer, frostbiter, missiles, TNT...'],
      ['Poles and vines', 'touch a pole to spin and fly; hang from vines'],
      ['Blocks', 'star: shoot  number: N shots  arrow: stomp  gun: that gun'],
      ['Monitors', 'shields power up the Blaster; the swirl one switches hero'],
      ['Stars', 'exit  /  75% of gems  /  every secret'],
      [`${n('pause')} / M`, 'pause / mute    Keys can be changed in OPTIONS'],
      ['F1  F3 / F4', 'help   screen size    ALT and ENTER: full screen'],
      ['F5 / F6', 'load / save a game    A gamepad works too'],
    ];
    lines.forEach(([a, b], i) => {
      this.fitMed(a, 46, 48 + i * 18, 138, { scale: 0.5 });
      this.fitMed(b, 190, 48 + i * 18, VIEW_W - 230, { scale: 0.5, color: '#ece4ff' });
    });
    this.blink(t, 'Press ENTER', 306, 0.6);
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
    const list = [['MUSIC'], ['EFFECTS'], ['CONTROLS', '>'], ['VIDEO', '>'], ['LANGUAGE', '>'],
      [this.resetArmed ? 'PRESS AGAIN TO ERASE' : 'RESET PROGRESS'], ['BACK']];
    this.rows(list, this.menu, 180, VIEW_W - 170, 62, 32, t);
    [save.options.music, save.options.sfx].forEach((v, i) => {
      const y = 62 + i * 32 + 3;
      const on = this.menu === i;
      ctx.fillStyle = '#1a0b1e'; ctx.fillRect(330, y, 124, 12);
      ctx.fillStyle = on ? '#ffd54a' : '#9a7ad0'; ctx.fillRect(332, y + 2, Math.round(120 * v), 8);
    });
    const hint = this.menu < 2 ? 'LEFT / RIGHT to change' : 'ENTER to choose   ESC to go back';
    this.med(hint, VIEW_W / 2, 292, { align: 'center', scale: 0.5, color: '#c8b8e8' });
  }

  // The on-screen language (level names and signs stay as they are).
  langScreen(t, save) {
    this.big('LANGUAGE', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(150, 46, VIEW_W - 300, 262, 0.85);
    const list = [...LANGS.map((l) => [l.name, l.id === save.options.lang ? '*' : '']), ['BACK']];
    this.rows(list, this.menu, 200, VIEW_W - 190, 64, 32, t);
  }

  // Rebind the play keys: up to three per action. ENTER waits for a key,
  // BACKSPACE clears one, a key already in use swaps over.
  // Three pages (TAB, or RB on a gamepad): Keyboard 1 (playing alone, and
  // player 1 in split screen), Keyboard 2 (player 2) and the gamepad.
  keysScreen(t, save) {
    const ctx = this.ctx;
    const pages = ['KEYBOARD 1', 'KEYBOARD 2', 'GAMEPAD'];
    this.big(pages[this.keyPage], VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    pages.forEach((_, i) => { this.ctx.fillStyle = i === this.keyPage ? '#ffd54a' : 'rgba(150,120,200,0.6)'; this.ctx.fillRect(VIEW_W / 2 - 22 + i * 18, 34, 8, 3); });
    this.panel(28, 40, VIEW_W - 56, 282, 0.88);
    if (this.keyPage === 2) { this.padPage(t); return; }
    const second = this.keyPage === 1;
    const keys = (second ? save.options.keys2 : save.options.keys) || defaultKeys(second);
    const colX = [252, 368, 484];
    const head = { scale: 0.48, color: '#8a7ab0' };
    this.med('ACTION', 62, 50, head);
    colX.forEach((x, c) => this.med(tr('KEY {0}', c + 1), x + 50, 50, { ...head, align: 'center' }));
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
        this.med(waiting ? tr(label) : label, colX[c] + 50, y, { align: 'center', scale: 0.5, raw: true, color: waiting ? '#ffd54a' : keys[a][c] ? '#ffffff' : '#6a5a8a' });
      }
    });
    const n = REBINDABLE.length;
    this.rows([['RESET TO DEFAULTS'], ['BACK']], this.menu - n, 62, 0, 70 + n * 21 + 6, 21, t);
    const hint = this.capturing ? 'Press the new key   ESC cancels' : 'ENTER change   BACKSPACE clear   TAB next page   ESC back';
    this.med(hint, VIEW_W / 2, 302, { align: 'center', scale: 0.5, color: '#c8b8e8' });
  }

  // The gamepad's buttons (fixed), and which pads are connected.
  padPage(t) {
    const rows = [
      ['D-PAD / LEFT STICK', 'move, look up, crouch'],
      ['A', 'jump        menus: choose'],
      ['X  or  RT', 'fire'],
      ['B, LB  or  LT', 'run         menus: back'],
      ['Y  or  RB', 'next weapon'],
      ['START', 'pause'],
    ];
    rows.forEach(([a, b], i) => {
      this.fitMed(a, 62, 60 + i * 22, 196, { scale: 0.55 });
      this.fitMed(b, 270, 60 + i * 22, VIEW_W - 320, { scale: 0.55, color: '#ece4ff' });
    });
    const pads = connectedPads();
    const say = pads.length ? pads.slice(0, 2).map((g, i) => `${i + 1}: ${g.id.replace(/\s*\(.*$/, '').slice(0, 40)}`) : ['No gamepad found - press a button on it'];
    say.forEach((line, i) => this.med(line, VIEW_W / 2, 210 + i * 16, { align: 'center', scale: 0.5, color: pads.length ? '#7aff9a' : '#c8b8e8' }));
    this.med('Split screen: two pads go one each; one pad goes to player 2', VIEW_W / 2, 252, { align: 'center', scale: 0.48, color: '#c8b8e8' });
    this.med('TAB next page   ESC back', VIEW_W / 2, 302, { align: 'center', scale: 0.5, color: '#c8b8e8' });
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
      ['SCREEN SIZE', `${Math.round((v.size || 1) * 10)} / 10`],
      ['BACK'],
    ];
    this.rows(list, this.menu, 150, VIEW_W - 140, 60, 31, t);
    const tips = [
      'Fill the screen: ALT and ENTER, or F11',
      'Fit: fill the window   Pixel perfect: whole-number scale, no uneven pixels',
      'Sharp: crisp pixels   Smooth: softened',
      'Shake the screen on explosions and stomps',
      'Flash the screen on big hits and explosions',
      'How much of the window the game fills: F3 / F4',
      '',
    ];
    this.wrapTo(tips[this.menu], VIEW_W - 240, 0.5).forEach((line, i) => this.med(line, VIEW_W / 2, 282 + i * 12, { align: 'center', scale: 0.5, color: '#c8b8e8' }));
  }

  // The party game being set up: { mode, level, goal, truce }.
  partySettings() {
    const ps = this.ps;
    const mode = MODES[ps.mode % MODES.length];
    const levels = partyLevels(mode, this.jj2all);
    const goals = MODE_INFO[mode].goals;
    return { mode, level: levels[ps.level % levels.length], levels, goal: goals[ps.goal % goals.length], truce: TRUCES[ps.truce % TRUCES.length] };
  }

  levelName(key) {
    const lv = key === undefined || key === null ? null : levelDef(key);
    if (!lv) return '-';
    return lv.title;
  }

  // The settings rows (host and split screen); `edit`: the cursor shows.
  settingsRows(st, y, t, edit, extra = []) {
    const truce = st.truce ? `${Math.floor(st.truce / 60)}:${String(st.truce % 60).padStart(2, '0')}` : tr('OFF');
    const rows = [
      ['MODE', tr(MODE_INFO[st.mode].name)],
      ['LEVEL', this.levelName(st.level)],
      ['GOAL', `${st.goal} ${tr(MODE_INFO[st.mode].unit)}`],
      ['NO FIGHTING FOR', truce],
      ...extra,
    ];
    rows.forEach(([label, value], i) => {
      const on = edit && i === this.ps.row;
      const yy = y + i * 17;
      if (on) this.ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], VIEW_W / 2 - 206, yy);
      this.med(label, VIEW_W / 2 - 184, yy, { scale: on ? 0.58 : 0.54, color: on ? null : '#b8a8e0' });
      const show = on && i < 4 ? `< ${value} >` : value;
      this.fitMed(show, VIEW_W / 2 + 200, yy, 230, { align: 'right', scale: 0.54, color: on ? '#ffffff' : '#d8ccf4', raw: i === 1 });
    });
    return y + rows.length * 17;
  }

  // The players in the room, in their colours.
  playerRows(players, me, y) {
    const HERO = { jazz: 'JAZZ', spaz: 'SPAZ', lori: 'LORI' };
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const pl = players.find((q) => q.id === i);
      const yy = y + (i - 1) * 14;
      const slot = SLOTS[i];
      this.ctx.fillStyle = pl ? slot.color : 'rgba(120,100,160,0.4)';
      this.ctx.fillRect(VIEW_W / 2 - 184, yy + 2, 8, 8);
      if (!pl) { this.med('- - -', VIEW_W / 2 - 170, yy, { scale: 0.48, color: '#6a5a8a' }); continue; }
      const hero = `${slot.tint ? `${tr(slot.tint.toUpperCase())} ` : ''}${tr(HERO[slot.character])}`;
      this.med(pl.name, VIEW_W / 2 - 170, yy, { scale: 0.5, color: pl.id === me ? '#ffffff' : '#ece4ff', raw: true });
      this.med(`${hero}${i === 1 ? `  ${tr('HOST')}` : ''}${pl.id === me ? `  ${tr('YOU')}` : ''}`, VIEW_W / 2 + 200, yy, { align: 'right', scale: 0.46, color: slot.color });
    }
    return y + MAX_PLAYERS * 14;
  }

  lobbyScreen(t, save) {
    const L = this.lobby;
    this.big('PARTY MODE', VIEW_W / 2, 10, { align: 'center', scale: 0.5 });
    this.panel(VIEW_W / 2 - 220, 40, 440, 276, 0.88);
    const say = (text, y, opts = {}) => this.med(text, VIEW_W / 2, y, { align: 'center', scale: 0.55, ...opts });
    if (this.typing) { this.nameScreen(t, save); return; }
    if (this.sub === 'party') {
      say('Up to five players: treasure hunt, battle,', 56, { color: '#ece4ff' });
      say('capture the flag or race - on a network or online', 70, { color: '#ece4ff' });
      const name = save.options.playerName || tr('NOT SET');
      this.menuList(['HOST A GAME', 'JOIN A GAME', 'SAME COMPUTER', `${tr('NAME')}: ${name}`, 'BACK'], this.menu, 96, t, 30);
      const tips = ['Run party.bat - serve.py --lan - so friends can connect', 'Pick a game from the list or type its code',
        'Split screen: Keyboard 1, Keyboard 2 and gamepads', 'The name the other players see', ''];
      say(tips[this.menu], 292, { scale: 0.45, color: '#c8b8e8' });
      return;
    }
    if (this.sub === 'local') {
      say('TWO PLAYERS, ONE COMPUTER', 52, { scale: 0.6, color: null });
      const keys = (field, second) => {
        const k = save.options[field] || defaultKeys(second);
        return `${keyName(k.left[0])} ${keyName(k.right[0])}  ${tr('jump')} ${keyName(k.jump[0])}  ${tr('fire')} ${keyName(k.shoot[0])}`;
      };
      say('PLAYER 1 - LEFT: Keyboard 1', 74, { scale: 0.5, color: '#ffe8a0' });
      say(keys('keys', false), 87, { scale: 0.45, color: '#ece4ff' });
      say('PLAYER 2 - RIGHT: Keyboard 2', 104, { scale: 0.5, color: '#a8e0ff' });
      say(keys('keys2', true), 117, { scale: 0.45, color: '#ece4ff' });
      const pads = connectedPads().length;
      say(pads >= 2 ? 'Two gamepads: one each' : pads === 1 ? 'The gamepad plays player 2' : 'A gamepad plugged in plays player 2', 134, { scale: 0.45, color: pads ? '#7aff9a' : '#c8b8e8' });
      const y = this.settingsRows(this.partySettings(), 160, t, true, [['START', '']]);
      if (this.lobby.status === 'loading') say('Loading...', y + 6, { scale: 0.55 });
      say('UP / DOWN: setting   LEFT / RIGHT: change', 296, { scale: 0.45, color: '#8a7ab0' });
      return;
    }
    if (L.status === 'error') {
      this.wrapTo(L.error || 'Connection failed.', 380, 0.55).forEach((line, i) => say(line, 130 + i * 15, { color: '#ffb0b8' }));
      this.blink(t, 'Press ENTER', 250, 0.6);
      return;
    }
    if (this.sub === 'host' || (this.sub === 'join' && L.joined)) {
      if (!L.code) { say(tr('Connecting') + '.'.repeat(1 + Math.floor(t / 20) % 3), 150, { scale: 0.7, raw: true }); return; }
      this.med('ROOM CODE', VIEW_W / 2 - 184, 50, { scale: 0.5, color: '#c8b8e8' });
      this.big(L.code.split('').join(' '), VIEW_W / 2 - 100, 46, { scale: 0.6 });
      const url = (L.urls || [])[0];
      if (url && this.sub === 'host') this.fitMed(tr('Friends open {0}', url), VIEW_W / 2 - 184, 70, 380, { scale: 0.42, color: '#ece4ff' });
      let y = this.playerRows(L.players || [], L.id, 86);
      if (this.sub === 'host') {
        const extra = [['PASSWORD', L.password || tr('NONE')], ['START', '']];
        y = this.settingsRows(this.partySettings(), y + 6, t, true, extra);
        const n = (L.players || []).length;
        say(n > 1 ? tr('ENTER on START when everyone is in') : tr('Waiting for players') + '.'.repeat(1 + Math.floor(t / 20) % 3), 298, { scale: 0.48, color: n > 1 ? '#7aff9a' : '#c8b8e8', raw: true });
      } else {
        if (L.settings) this.settingsRows(L.settings, y + 6, t, false);
        say(tr('Waiting for the host to start') + '.'.repeat(1 + Math.floor(t / 20) % 3), 298, { scale: 0.5, raw: true });
      }
      if (L.status === 'loading') say('Loading...', 280, { scale: 0.55 });
      return;
    }
    // Join: the open games on the server, or a typed code.
    this.med('OPEN GAMES', VIEW_W / 2 - 184, 50, { scale: 0.5, color: '#c8b8e8' });
    const rooms = (L.rooms || []).slice(0, 7);
    [...rooms, null].forEach((r, i) => {
      const on = i === this.menu;
      const y = 68 + i * 20;
      if (on) this.ctx.drawImage(this.art.gems.red[Math.floor(t / 5) % 8], VIEW_W / 2 - 206, y);
      if (!r) { this.med('REFRESH', VIEW_W / 2 - 184, y, { scale: on ? 0.58 : 0.54, color: on ? null : '#b8a8e0' }); return; }
      this.fitMed(`${r.code}  ${r.title}`, VIEW_W / 2 - 184, y, 210, { scale: on ? 0.56 : 0.52, color: on ? null : r.playing || r.players >= r.max ? '#7a6aa0' : '#d8ccf4', raw: true });
      const info = `${tr(MODE_INFO[r.mode] ? MODE_INFO[r.mode].name : 'TREASURE HUNT')}  ${r.players}/${r.max}${r.locked ? `  ${tr('LOCKED')}` : ''}${r.playing ? `  ${tr('PLAYING')}` : ''}`;
      this.fitMed(info, VIEW_W / 2 + 200, y + 1, 170, { align: 'right', scale: 0.44, color: '#b8a8e0' });
    });
    if (!rooms.length) say(L.rooms ? 'No open games yet' : 'Looking for games...', 96, { scale: 0.5, color: '#8a7ab0' });
    say('Or type a room code', 236, { scale: 0.5, color: '#c8b8e8' });
    this.big(this.codeBuf.padEnd(4, '_').split('').join(' '), VIEW_W / 2, 250, { align: 'center', scale: 0.55 });
    if (L.error) say(L.error, 282, { scale: 0.5, color: '#ffb0b8' });
    say('ENTER to join   ESC to go back', 298, { scale: 0.45, color: '#c8b8e8' });
  }

  // Returns an action string when the player chooses something.
  titleInput(input, save) {
    if (this.typing) return this.typingInput(input);
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
        this.open(SUBS[this.menu]);
        if (this.sub === 'char') this.charPick = save.character || 'jazz';
        return null;
      case 'char': {
        const i = CHARACTERS.findIndex((c) => c.id === this.charPick);
        const d = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
        if (d) { this.charPick = CHARACTERS[(i + d + CHARACTERS.length) % CHARACTERS.length].id; this.audio.play('menu'); }
        if (back) { this.sub = null; this.menu = 0; return null; }
        if (!choose) return null;
        this.audio.play('select');
        save.character = this.charPick;
        this.sub = 'diff';
        this.menu = Math.max(0, DIFFICULTIES.indexOf(save.difficulty));
        return 'save';
      }
      case 'diff': {
        if (input.pressed('up')) move(-1, DIFFICULTIES.length);
        if (input.pressed('down')) move(1, DIFFICULTIES.length);
        if (back) { this.sub = 'char'; return null; }
        if (!choose) return null;
        this.audio.play('select');
        save.difficulty = DIFFICULTIES[this.menu];
        this.sub = 'episodes';
        return 'save';
      }
      case 'episodes': {
        const eps = this.episodes();
        const d = (input.pressed('down') ? 1 : 0) - (input.pressed('up') ? 1 : 0);
        if (d) { this.episode = (this.episode + d + eps.length) % eps.length; this.audio.play('menu'); }
        if (back) { this.sub = 'diff'; this.menu = Math.max(0, DIFFICULTIES.indexOf(save.difficulty)); return null; }
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
        if (choose || back) { this.sub = null; this.menu = mainIndex('help'); this.audio.play('select'); }
        return null;
      case 'scores':
        if (input.pressed('left') || input.pressed('right')) { this.scorePage = 1 - this.scorePage; this.audio.play('menu'); }
        if (choose || back) { this.sub = null; this.menu = mainIndex('scores'); this.highlight = -1; this.audio.play('select'); }
        return null;
      case 'load':
      case 'save': {
        const n = SAVE_SLOTS + 1;
        if (input.pressed('up')) { move(-1, n); this.slotArmed = -1; }
        if (input.pressed('down')) { move(1, n); this.slotArmed = -1; }
        if (back || (choose && this.menu === SAVE_SLOTS)) { this.sub = null; this.menu = mainIndex('load'); this.slotArmed = -1; return null; }
        const slot = save.slots[this.menu];
        if (this.menu < SAVE_SLOTS && slot && input.pressed('clear')) {
          if (this.slotArmed !== this.menu) { this.slotArmed = this.menu; this.audio.play('menu'); return null; }
          save.slots[this.menu] = null; this.slotArmed = -1; this.audio.play('denied');
          return 'slots';
        }
        if (!choose) return null;
        if (this.sub === 'save') {
          this.audio.play('select');
          this.typing = { kind: 'slot', slot: this.menu, buf: cleanName(slot ? slot.name : this.levelTitle || `GAME ${this.menu + 1}`), fresh: true };
          this.sub = 'name';
          return null;
        }
        if (!slot) { this.audio.play('denied'); return null; }
        this.audio.play('select');
        this.sub = null;
        return `load-slot:${this.menu}`;
      }
      case 'lang': {
        const n = LANGS.length + 1;
        if (input.pressed('up')) move(-1, n);
        if (input.pressed('down')) move(1, n);
        if (back || (choose && this.menu === LANGS.length)) { this.sub = 'options'; this.menu = 4; return null; }
        if (!choose) return null;
        this.audio.play('select');
        save.options.lang = LANGS[this.menu].id;
        return 'lang';
      }
      case 'options': {
        if (input.pressed('up')) { move(-1, 7); this.resetArmed = false; }
        if (input.pressed('down')) { move(1, 7); this.resetArmed = false; }
        if (this.menu < 2) {
          const key = this.menu === 0 ? 'music' : 'sfx';
          const d = (input.pressed('right') ? 0.1 : 0) - (input.pressed('left') ? 0.1 : 0);
          if (d) { save.options[key] = Math.round(Math.max(0, Math.min(1, save.options[key] + d)) * 10) / 10; this.audio.play('menu'); return 'options'; }
        }
        if (back || (choose && this.menu === 6)) { this.sub = null; this.menu = mainIndex('options'); this.resetArmed = false; return 'options'; }
        if (choose && this.menu === 2) { this.audio.play('select'); this.sub = 'keys'; this.menu = 0; this.keyCol = 0; this.keyPage = 0; return null; }
        if (choose && this.menu === 3) { this.audio.play('select'); this.sub = 'video'; this.menu = 0; return null; }
        if (choose && this.menu === 4) { this.audio.play('select'); this.sub = 'lang'; this.menu = Math.max(0, LANGS.findIndex((l) => l.id === save.options.lang)); return null; }
        if (choose && this.menu === 5) {
          if (this.resetArmed) { this.resetArmed = false; this.audio.play('denied'); return 'reset'; }
          this.resetArmed = true; this.audio.play('menu');
        }
        return null;
      }
      case 'keys': {
        if (this.capturing) return null;
        const n = REBINDABLE.length;
        if (input.pressed('page')) { this.keyPage = (this.keyPage + 1) % 3; this.menu = 0; this.keyCol = 0; this.audio.play('menu'); return null; }
        if (this.keyPage === 2) {
          if (back || choose) { this.sub = 'options'; this.menu = 2; }
          return null;
        }
        const field = this.keyPage === 1 ? 'keys2' : 'keys';
        if (input.pressed('up')) move(-1, n + 2);
        if (input.pressed('down')) move(1, n + 2);
        if (this.menu < n) {
          const d = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
          if (d) { this.keyCol = (this.keyCol + d + KEY_SLOTS) % KEY_SLOTS; this.audio.play('menu'); }
        }
        if (back || (choose && this.menu === n + 1)) { this.sub = 'options'; this.menu = 2; return null; }
        if (!save.options[field]) save.options[field] = defaultKeys(field === 'keys2');
        const keys = save.options[field];
        if (this.menu < n && input.pressed('clear')) {
          if (clearKey(keys, REBINDABLE[this.menu], this.keyCol)) { this.audio.play('menu'); return 'keys'; }
          this.audio.play('denied');
          return null;
        }
        if (!choose) return null;
        if (this.menu === n) { save.options[field] = defaultKeys(field === 'keys2'); this.audio.play('select'); return 'keys'; }
        this.capturing = { field, action: REBINDABLE[this.menu], col: Math.min(this.keyCol, keys[REBINDABLE[this.menu]].length) };
        this.audio.play('select');
        return 'capture';
      }
      case 'video': {
        if (input.pressed('up')) move(-1, 7);
        if (input.pressed('down')) move(1, 7);
        if (back || (choose && this.menu === 6)) { this.sub = 'options'; this.menu = 3; return null; }
        const v = save.options.video;
        if (this.menu === 5) {
          const d = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
          if (!d) return null;
          this.audio.play('menu');
          return d > 0 ? 'bigger' : 'smaller';
        }
        const flip = choose || input.pressed('left') || input.pressed('right');
        if (!flip) return null;
        this.audio.play('menu');
        if (this.menu === 0) return 'fullscreen';
        if (this.menu === 1) v.scale = v.scale === 'pixel' ? 'fit' : 'pixel';
        if (this.menu === 2) v.filter = v.filter === 'smooth' ? 'sharp' : 'smooth';
        if (this.menu === 3) v.shake = !v.shake;
        if (this.menu === 4) v.flash = !v.flash;
        return 'video';
      }
      case 'party':
        if (input.pressed('up')) move(-1, 5);
        if (input.pressed('down')) move(1, 5);
        if (back || (choose && this.menu === 4)) { this.sub = null; this.menu = mainIndex('party'); return null; }
        if (!choose) return null;
        this.audio.play('select');
        if (this.menu === 3) { this.typing = { kind: 'pname', buf: cleanName(save.options.playerName || ''), fresh: true }; return null; }
        if (this.menu === 2) { this.sub = 'local'; this.lobby = { status: 'idle' }; this.ps.row = 0; return null; }
        this.lobby = { status: 'connecting', players: [] };
        if (this.menu === 0) { this.sub = 'host'; this.ps.row = 0; return 'host'; }
        this.sub = 'join'; this.codeBuf = ''; this.menu = 0;
        return 'rooms';
      case 'local': {
        if (back) { this.sub = 'party'; this.menu = 2; return null; }
        if (this.lobby.status === 'loading') return null;
        if (this.settingsInput(input, 5)) return null;
        if (choose && this.ps.row === 4) { this.audio.play('select'); return 'local-start'; }
        return null;
      }
      case 'host': {
        if (back || (choose && this.lobby.status === 'error')) { this.sub = 'party'; this.menu = 0; return 'leave'; }
        if (!this.lobby.code || this.lobby.status === 'loading') return null;
        const act = this.settingsInput(input, 6);
        if (act) return act;
        if (choose && this.ps.row === 4) { this.audio.play('select'); this.typing = { kind: 'hostpw', buf: cleanName(this.lobby.password || ''), fresh: true }; return null; }
        if (choose && this.ps.row === 5) {
          if ((this.lobby.players || []).length > 1) return 'party-start';
          this.audio.play('denied');
        }
        return null;
      }
      case 'join': {
        if (back || (choose && this.lobby.status === 'error')) { this.sub = 'party'; this.menu = 1; return 'leave'; }
        if (this.lobby.joined) return null;
        const rooms = (this.lobby.rooms || []).slice(0, 7);
        const n = rooms.length + 1;
        if (input.pressed('up')) move(-1, n);
        if (input.pressed('down')) move(1, n);
        if (!input.pressed('start')) return null;
        // A typed code wins over the list.
        if (this.codeBuf.length === 4) return `join:${this.codeBuf}`;
        const r = rooms[this.menu];
        if (!r) { this.audio.play('menu'); return 'rooms'; }
        if (r.playing || r.players >= r.max) { this.audio.play('denied'); return null; }
        if (r.locked) { this.typing = { kind: 'pw', buf: '', code: r.code }; return null; }
        return `join:${r.code}`;
      }
      default:
        return null;
    }
  }

  // UP / DOWN between the party settings rows (`count` with the extra rows),
  // LEFT / RIGHT changes one. Returns 'settings' when one changed.
  settingsInput(input, count) {
    const ps = this.ps;
    if (input.pressed('up')) { ps.row = (ps.row + count - 1) % count; this.audio.play('menu'); }
    if (input.pressed('down')) { ps.row = (ps.row + 1) % count; this.audio.play('menu'); }
    const d = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
    if (!d || ps.row > 3) return null;
    const st = this.partySettings();
    const wrap = (v, n) => (v + d + n) % n;
    if (ps.row === 0) { ps.mode = wrap(ps.mode, MODES.length); ps.level = 0; ps.goal = 0; }
    if (ps.row === 1) ps.level = wrap(ps.level % st.levels.length, st.levels.length);
    if (ps.row === 2) ps.goal = wrap(ps.goal % MODE_INFO[st.mode].goals.length, MODE_INFO[st.mode].goals.length);
    if (ps.row === 3) ps.truce = wrap(ps.truce, TRUCES.length);
    this.audio.play('menu');
    return 'settings';
  }

  // Open a menu screen (from the main menu, the pause menu or an F key).
  open(sub) {
    this.sub = sub;
    this.menu = 0;
    this.slotArmed = -1;
    if (sub === 'scores') { this.scorePage = 0; this.highlight = -1; }
  }

  // Typing a name: ENTER (or A) when done, ESC (or B) to cancel. Typed keys
  // are kept out of the menus meanwhile.
  typingInput(input) {
    const T = this.typing;
    const done = T.done || input.padPressed('start');
    const cancel = T.cancel || input.padPressed('pause');
    T.done = false; T.cancel = false;
    if (!done && !cancel) return null;
    this.typing = null;
    if (T.kind === 'score') {
      // A new high score is kept either way, under the name shown.
      this.typedName = T.buf;
      this.audio.play('select');
      return 'score-name';
    }
    if (T.kind === 'pname') { if (done) this.typedName = T.buf; this.audio.play(done ? 'select' : 'menu'); return done ? 'pname' : null; }
    if (T.kind === 'hostpw') { if (done) this.lobby.password = T.buf; this.audio.play(done ? 'select' : 'menu'); return done ? 'host-password' : null; }
    if (T.kind === 'pw') { this.audio.play(done ? 'select' : 'menu'); return done ? `join:${T.code}:${T.buf}` : null; }
    if (cancel) { this.sub = 'save'; this.menu = T.slot; this.audio.play('menu'); return null; }
    this.typedName = T.buf;
    this.sub = null;
    this.audio.play('select');
    return `save-slot:${T.slot}`;
  }

  // Ask for a high-score name (after a game ends).
  askName(score, rank, name) {
    this.sub = 'name';
    this.typing = { kind: 'score', buf: cleanName(name), score, rank, fresh: true };
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
    const label = typeof game.cardIndex === 'number' ? tr('Level {0}', game.cardIndex + 1) : meta.label || tr('Classic JJ2');
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
    else if (rec) this.med(`${tr('Best {0}', rec.score)}   ${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, '0')}`, VIEW_W / 2, 306, { align: 'center', scale: 0.5, color: '#8a4a1a' });
  }

  // ---------------------------------------------------------------- pause

  // The pause menu; OPTIONS opens the same options screens as the title.
  pause(t, save) {
    this.dim(0.62);
    if (this.sub) {
      this.backdrop();
      this.subScreen(t, save);
      return;
    }
    this.panel(VIEW_W / 2 - 150, 52, 300, 252, 0.9);
    this.big('PAUSED', VIEW_W / 2, 64, { align: 'center', scale: 0.6 });
    this.menuList(PAUSE_ITEMS, this.pauseIndex, 108, t, 30);
  }

  // Open a pause-menu screen; backing out of it returns to its item.
  pauseOpen(sub) {
    this.open(sub);
    const i = PAUSE_ACTIONS.indexOf(sub);
    this.pauseFrom = i >= 0 ? i : this.pauseIndex;
  }

  pauseInput(input, save) {
    if (this.sub) {
      const action = this.titleInput(input, save);
      if (this.sub === null) { this.pauseIndex = this.pauseFrom ?? this.pauseIndex; return action || 'options-closed'; }
      return action;
    }
    const n = PAUSE_ITEMS.length;
    if (input.pressed('up')) { this.pauseIndex = (this.pauseIndex + n - 1) % n; this.audio.play('menu'); }
    if (input.pressed('down')) { this.pauseIndex = (this.pauseIndex + 1) % n; this.audio.play('menu'); }
    if (input.pressed('pause')) return 'resume';
    if (input.pressed('start') || input.pressed('jump')) {
      this.audio.play('select');
      const pick = PAUSE_ACTIONS[this.pauseIndex];
      if (pick === 'options' || pick === 'save' || pick === 'load') { this.pauseOpen(pick); return null; }
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
      ['TIME', `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}${res.bestTime ? `  ${tr('BEST!')}` : ''}`],
      ['BONUS', `${s.bonus.time + s.bonus.gems + s.bonus.perfect}`],
      ['SCORE', `${game.score}${res.bestScore ? `  ${tr('BEST!')}` : ''}`],
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
    if (game.continues <= 0) {
      // No continues left: the game is over.
      ctx.fillStyle = '#05020c';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const a = Math.min(1, t / 40);
      this.big('GAME OVER', VIEW_W / 2, 130, { align: 'center', scale: 0.9, alpha: a, wave: 2, t });
      this.med(tr('Score {0}', game.score), VIEW_W / 2, 196, { align: 'center', scale: 0.7, alpha: a });
      if (t > 60) this.blink(t, 'Press ENTER', 290, 0.6);
      return;
    }
    this.fit(this.art.screens.continue, Math.min(1, t / 40));
    if (t < 40) return;
    this.med(game.continues === 1 ? tr('1 CONTINUE LEFT') : tr('{0} CONTINUES LEFT', game.continues), VIEW_W / 2, 18, { align: 'center', scale: 0.6 });
    // The NO and YES of the picture sit at (277, 302) and (358, 302).
    // The gem points at the chosen word from outside it (it used to cover YES).
    const gem = this.art.gems.red[Math.floor(t / 5) % 8];
    const x = this.continueYes ? 392 : 248 - gem.width;
    ctx.drawImage(gem, x + Math.sin(t * 0.15) * 2, 304 - gem.height / 2);
    this.med(tr('Score {0}', game.score), VIEW_W / 2, 336, { align: 'center', scale: 0.55 });
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
    this.med(tr('FINAL SCORE {0}', game.score), VIEW_W / 2, 184, { align: 'center', scale: 0.8 });
    this.med(tr('GEMS {0}   COINS {1}', game.gems, game.coins), VIEW_W / 2, 210, { align: 'center', scale: 0.6, color: '#ece4ff' });
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
