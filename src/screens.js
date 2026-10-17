// Splash, title menu, level cards, iris transitions, pause, tally, game over, win.

import { arcadeText, textWidth } from './art.js';
import { VIEW_H, VIEW_W } from './config.js';
import { LEVELS } from './levels.js';
import { Sky, Weather } from './sky.js';

const TITLE = "KIP'S GEM RUSH";

export class Screens {
  constructor(ctx, art, audio) {
    this.ctx = ctx;
    this.art = art;
    this.audio = audio;
    this.sky = new Sky('winter');
    this.weather = new Weather('snow', 110);
    this.menu = 0;
    this.sub = null;      // 'levels' | 'help'
    this.pauseIndex = 0;
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

  menuList(items, index, y, t) {
    items.forEach((label, i) => {
      const on = i === index;
      const wobble = on ? Math.sin(t * 0.15) * 2 : 0;
      arcadeText(this.ctx, label, VIEW_W / 2, y + i * 24 + wobble, {
        size: on ? 18 : 15, align: 'center',
        top: on ? '#ffffff' : '#b8a8d8', bottom: on ? '#ffb02e' : '#7a6aa0',
      });
      if (on) {
        const gem = this.art.gems.red[Math.floor(t / 5) % 8];
        const half = label.length * 6.2 + 16;
        this.ctx.drawImage(gem, VIEW_W / 2 - half - 20, y + i * 24 + 1);
        this.ctx.drawImage(gem, VIEW_W / 2 + half, y + i * 24 + 1);
      }
    });
  }

  // ---------------------------------------------------------------- splash

  splash(t) {
    const ctx = this.ctx;
    ctx.fillStyle = '#05020c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const a = Math.min(1, t / 40, Math.max(0, (200 - t) / 40));
    // A spinning gem as the studio mark.
    const gem = this.art.gems.purple[Math.floor(t / 4) % 8];
    ctx.globalAlpha = a;
    ctx.drawImage(gem, VIEW_W / 2 - 30, VIEW_H / 2 - 70, 60, 60);
    ctx.globalAlpha = 1;
    arcadeText(ctx, 'REA LABS', VIEW_W / 2, VIEW_H / 2, { size: 30, align: 'center', alpha: a, top: '#e8d8ff', bottom: '#9a6aff' });
    arcadeText(ctx, 'presents', VIEW_W / 2, VIEW_H / 2 + 40, { size: 12, align: 'center', alpha: a * 0.8, shadow: false, top: '#c8b8e8', bottom: '#c8b8e8' });
  }

  // ---------------------------------------------------------------- title

  title(t, unlocked) {
    const ctx = this.ctx;
    this.sky.draw(ctx, t * 1.2, 0, t);
    this.weather.update(t * 1.2, 0, t);
    this.weather.draw(ctx, false, t);
    // Snowy ground strip with Kip running across.
    ctx.fillStyle = '#0e0818'; ctx.fillRect(0, VIEW_H - 50, VIEW_W, 50);
    ctx.fillStyle = '#eef4ff'; ctx.fillRect(0, VIEW_H - 54, VIEW_W, 6);
    ctx.fillStyle = '#cfdcf8'; ctx.fillRect(0, VIEW_H - 48, VIEW_W, 2);
    const run = this.art.kip.run;
    const kx = ((t * 3) % (VIEW_W + 120)) - 60;
    const rf = run[Math.floor(t / 3) % run.length];
    ctx.drawImage(rf.right, kx - rf.ax, VIEW_H - 52 - rf.ay);
    // Bouncing logo, letter by letter, spaced by each glyph's real width.
    const sizeOf = (i) => (i >= 5 ? 44 : 30);
    const advance = (i) => textWidth(ctx, TITLE[i], sizeOf(i)) + 2;
    let total = 0;
    for (let i = 0; i < TITLE.length; i++) total += advance(i);
    let x = VIEW_W / 2 - total / 2;
    for (let i = 0; i < TITLE.length; i++) {
      const big = i >= 5;
      const y = 34 + Math.sin(t * 0.08 + i * 0.5) * 5;
      arcadeText(ctx, TITLE[i], x, y + (big ? 14 : 0), {
        size: sizeOf(i), top: big ? '#fff6c0' : '#bff8ff', bottom: big ? '#ff8a1a' : '#22b8e8',
      });
      x += advance(i);
    }
    arcadeText(ctx, 'A fast platform adventure', VIEW_W / 2, 112, { size: 11, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' });

    if (this.sub === 'levels') {
      this.dim(0.45);
      arcadeText(ctx, 'LEVEL SELECT', VIEW_W / 2, 132, { size: 18, align: 'center' });
      const names = LEVELS.map((make, i) => (i < unlocked ? `${i + 1}. ${make.title}` : `${i + 1}. ???`));
      this.menuList([...names, 'BACK'], this.menu, 166, t);
    } else if (this.sub === 'help') {
      this.dim(0.7);
      arcadeText(ctx, 'HOW TO PLAY', VIEW_W / 2, 124, { size: 18, align: 'center' });
      const lines = [
        'ARROWS/WASD move   SHIFT run   SPACE/Z jump (hold = higher)',
        'Jump again in the air and hold: HOVER BOOTS',
        'X/J blast   DOWN in the air: BUTTSTOMP   UP + X: UPPERCUT',
        'Collect gems and coins, find secrets, eat 100 treats for a SUGAR RUSH',
        'Reach the spinning goal sign to clear the level',
        'P pause   M mute',
      ];
      lines.forEach((l, i) => arcadeText(ctx, l, VIEW_W / 2, 154 + i * 20, { size: 10, align: 'center', shadow: false, top: '#ffffff', bottom: '#cfe6ff' }));
      arcadeText(ctx, 'Press ENTER', VIEW_W / 2, 290, { size: 12, align: 'center', alpha: Math.floor(t / 30) % 2 ? 1 : 0.4 });
    } else {
      this.menuList(['START GAME', 'LEVEL SELECT', 'HOW TO PLAY', `SOUND: ${this.audio.muted ? 'OFF' : 'ON'}`], this.menu, 150, t);
    }
    arcadeText(ctx, 'Fan project - sprites, tiles and sounds (c) Epic MegaGames, not for distribution', VIEW_W / 2, VIEW_H - 16, { size: 8, align: 'center', shadow: false, top: '#c8b8e8', bottom: '#9a8ab0' });
    this.weather.draw(ctx, true, t);
  }

  // Returns an action string when the player chooses something.
  titleInput(input, unlocked) {
    const move = (n) => { this.menu = (this.menu + n + this.count(unlocked)) % this.count(unlocked); this.audio.play('menu'); };
    if (input.pressed('up')) move(-1);
    if (input.pressed('down')) move(1);
    const choose = input.pressed('start') || input.pressed('jump');
    const back = input.pressed('pause');
    if (this.sub === 'help') {
      if (choose || back) { this.sub = null; this.menu = 2; this.audio.play('select'); }
      return null;
    }
    if (this.sub === 'levels') {
      if (back) { this.sub = null; this.menu = 1; return null; }
      if (!choose) return null;
      if (this.menu === LEVELS.length) { this.sub = null; this.menu = 1; this.audio.play('select'); return null; }
      if (this.menu < unlocked) { this.audio.play('select'); return `level:${this.menu}`; }
      this.audio.play('denied');
      return null;
    }
    if (!choose) return null;
    this.audio.play('select');
    if (this.menu === 0) return 'start';
    if (this.menu === 1) { this.sub = 'levels'; this.menu = 0; }
    else if (this.menu === 2) { this.sub = 'help'; }
    else if (this.menu === 3) { this.audio.toggleMute(); }
    return null;
  }

  count(unlocked) {
    if (this.sub === 'levels') return LEVELS.length + 1;
    if (this.sub === 'help') return 1;
    return 4;
  }

  // ---------------------------------------------------------------- level card

  card(game, t) {
    const ctx = this.ctx;
    ctx.fillStyle = '#05020c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const meta = game.cardMeta;
    const slide = Math.max(0, 40 - t) * 8;
    arcadeText(ctx, `LEVEL ${game.cardIndex + 1}`, VIEW_W / 2 - slide, 110, { size: 16, align: 'center', top: '#bff8ff', bottom: '#22b8e8' });
    arcadeText(ctx, meta.title.toUpperCase(), VIEW_W / 2 + slide, 136, { size: 32, align: 'center' });
    arcadeText(ctx, meta.tip, VIEW_W / 2, 186, { size: 11, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0', alpha: Math.min(1, t / 40) });
    const idle = this.art.kip.victory;
    const cf = idle[Math.min(idle.length - 1, Math.floor(t / 8))];
    ctx.drawImage(cf.right, VIEW_W / 2 - cf.ax, 262 - cf.ay);
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
    this.dim(Math.min(0.72, k / 40));
    arcadeText(ctx, 'LEVEL CLEAR!', VIEW_W / 2, 40, { size: 30, align: 'center' });
    const rows = [
      ['GEMS', `${Math.min(s.gems, Math.floor(k * 2))}%`],
      ['ENEMIES', `${Math.min(s.enemies, Math.max(0, Math.floor((k - 20) * 2)))}%`],
      ['SECRETS', `${Math.min(s.secrets, Math.max(0, Math.floor((k - 40) * 2)))}%`],
      ['TIME', `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}`],
      ['TIME BONUS', `${s.bonus.time}`],
      ['GEM BONUS', `${s.bonus.gems}`],
      ['PERFECT', `${s.bonus.perfect}`],
      ['SCORE', `${game.score}`],
    ];
    rows.forEach(([label, value], i) => {
      if (k < i * 20) return;
      arcadeText(ctx, label, VIEW_W / 2 - 150, 92 + i * 22, { size: 13, top: '#e8d8ff', bottom: '#9a8ad0' });
      arcadeText(ctx, value, VIEW_W / 2 + 150, 92 + i * 22, { size: 13, align: 'right', top: '#ffffff', bottom: '#ffd54a' });
      if (k === i * 20) this.audio.play('tally');
    });
    if (k > 180) {
      const pop = Math.max(1, 3 - (k - 180) / 6);
      arcadeText(ctx, s.rank, VIEW_W / 2 + 210, 120, {
        size: Math.round(54 * pop), align: 'center',
        top: s.rank === 'S' ? '#fff6c0' : '#ffffff', bottom: s.rank === 'S' ? '#ff4ad8' : '#ffb02e',
      });
      arcadeText(ctx, 'RANK', VIEW_W / 2 + 210, 100, { size: 11, align: 'center' });
      if (k === 181) this.audio.play('rank');
    }
    if (k > 210) arcadeText(ctx, 'Press ENTER', VIEW_W / 2, VIEW_H - 34, { size: 13, align: 'center', alpha: Math.floor(k / 25) % 2 ? 1 : 0.35 });
  }

  // ---------------------------------------------------------------- game over / win

  gameOver(game, t) {
    this.dim(Math.min(0.8, t / 60));
    const drop = Math.max(0, 60 - t) * 3;
    arcadeText(this.ctx, 'GAME OVER', VIEW_W / 2, 120 - drop, { size: 40, align: 'center', top: '#ffd0d8', bottom: '#e8244a' });
    arcadeText(this.ctx, `SCORE ${game.score}`, VIEW_W / 2, 180, { size: 16, align: 'center', alpha: Math.min(1, t / 80) });
    if (t > 90) arcadeText(this.ctx, 'Press ENTER', VIEW_W / 2, 230, { size: 13, align: 'center', alpha: Math.floor(t / 25) % 2 ? 1 : 0.35 });
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
    const credits = ['Character sprites, tiles and sound effects: Jazz Jackrabbit (c) Epic MegaGames', 'Sprite rips via The Spriters Resource - not owned by this project', 'Thanks for playing!'];
    credits.forEach((c, i) => arcadeText(ctx, c, VIEW_W / 2, 250 + i * 18, { size: 10, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' }));
    if (t > 120) arcadeText(ctx, 'Press ENTER', VIEW_W / 2, VIEW_H - 26, { size: 12, align: 'center', alpha: Math.floor(t / 25) % 2 ? 1 : 0.35 });
  }
}
