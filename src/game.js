// Game world: level setup, entity updates, interactions, objectives, camera.

import { Backdrop, BACKDROP_SKY, BACKDROPS } from './backdrop.js';
import { THEME_TILESET } from './tilesets.js';
import { CAMERA, PHYS, PLAYER, TILE, VIEW_H, VIEW_W } from './config.js';
import {
  Checkpoint, Effect, Hint, makeEnemy, overlap, Particle, Pickup, Pole, SecretZone, Shot, Sign, Spring, SPRING_CHARS, Warp,
} from './entities.js';
import { LEVELS } from './levels.js';
import { PARTY_GOAL, PARTY_RESPAWN } from './party.js';
import { Player } from './player.js';
import { Sky, Weather } from './sky.js';
import { TerrainRenderer } from './terrain.js';

const WEATHER = { meadow: 'leaves', winter: 'snow', crystal: 'motes', grove: 'fireflies', candy: 'sparkles', forge: 'embers' };

export class Game {
  constructor(audio, art) {
    this.audio = audio;
    this.art = art;
    this.state = 'title';
    this.levelIndex = 0;
    this.score = 0;
    this.gems = 0;
    this.coins = 0;
    this.lives = 3;
    this.player = null;
    this.time = 0;
    this.unlocked = 1;
    this.party = null;      // a Party while a two-player hunt is running
  }

  // Start a two-player hunt on a level (both sides call this).
  newParty(index, party) {
    this.party = party;
    this.score = 0; this.gems = 0; this.coins = 0; this.lives = 99; this.food = 0;
    this.loadLevel(index, true);
  }

  newGame(startLevel = 0) {
    this.score = 0;
    this.gems = 0;
    this.coins = 0;
    this.lives = 3;
    this.food = 0;
    this.loadLevel(startLevel, true);
  }

  loadLevel(index, freshPlayer = false) {
    this.levelIndex = index;
    this.level = LEVELS[index]();
    const theme = this.level.meta.theme;
    this.terrain = new TerrainRenderer(this.level, theme, this.art);
    const tsName = THEME_TILESET[theme];
    this.sky = tsName && BACKDROPS[tsName] ? new Backdrop(this.art.tilesets[tsName].pixels, tsName, this.level, BACKDROP_SKY[tsName] && new Sky(BACKDROP_SKY[tsName])) : new Sky(theme);
    this.weather = new Weather(WEATHER[theme]);
    Object.assign(this, {
      enemies: [], enemyShots: [], pickups: [], props: [], shots: [], particles: [], popups: [], debris: [], effects: [], warps: [],
      levelTime: 0, levelGems: 0, enemiesKilled: 0, secretsFound: 0, levelCoins: 0, hintText: null,
      combo: 0, comboTimer: 0, comboMult: 1,
      shakeTime: 0, flashTime: 0, flashColor: '#ffffff', food: this.food || 0, rushMusic: false,
    });
    let start = { x: 64, y: 64 };
    const totals = { gems: 0, enemies: 0, secrets: 0, coins: 0, food: 0 };
    for (const e of this.level.entities) {
      const px = e.tx * TILE;
      const py = e.ty * TILE;
      const enemy = makeEnemy(e.ch, px, py);
      if (enemy) { this.enemies.push(enemy); totals.enemies++; continue; }
      if (SPRING_CHARS.includes(e.ch)) { this.props.push(new Spring(e.tx, e.ty, e.ch)); continue; }
      switch (e.ch) {
        case 'P': start = { x: px + (TILE - PLAYER.w) / 2, y: py + TILE - PLAYER.h }; break;
        case 'H': this.props.push(new Pole(e.tx, e.ty, false)); break;
        case 'I': this.props.push(new Pole(e.tx, e.ty, true)); break;
        case 'C': this.props.push(new Checkpoint(e.tx, e.ty)); break;
        case 'E': this.props.push(new Sign(e.tx, e.ty)); break;
        case 'X': this.props.push(new SecretZone(e.tx, e.ty)); totals.secrets++; break;
        default: {
          const pickup = Pickup.fromChar(e.ch, e.tx, e.ty);
          if (!pickup) break;
          this.pickups.push(pickup);
          if (pickup.kind === 'gem') totals.gems += pickup.value;
          if (pickup.kind === 'coin') totals.coins += pickup.coins;
          if (pickup.kind === 'food') totals.food++;
        }
      }
    }
    for (const o of this.level.objects) {
      if (o.type === 'warp') { const w = new Warp(o); this.warps.push(w); this.props.push(w); }
      if (o.type === 'hint') this.props.push(new Hint(o));
    }
    this.totals = totals;
    this.start = start;
    this.respawn = { ...start };
    if (freshPlayer || !this.player) this.player = new Player(start.x, start.y);
    else this.player.spawn(start.x, start.y);
    this.player.health = Math.max(this.player.health, 3);
    this.cam = { x: this.player.cx - VIEW_W / 2, y: this.player.cy - VIEW_H / 2 };
    this.clampCamera();
    this.prevCam = { ...this.cam };
    this.terrain.warm(this.player.cx, this.player.cy);
    this.state = 'play';
    if (this.party) this.party.begin(this);
    this.banner(this.party ? `FIRST TO ${PARTY_GOAL} GEMS + EXIT WINS!` : this.level.meta.name.toUpperCase(), 160);
    this.audio.startMusic(this.level.meta.music, { restart: true });
  }

  // ---------------------------------------------------------------- effects and helpers

  addScore(points, x, y) {
    this.score += points;
    this.popups.push({ x, y, text: String(points), life: 50 });
  }

  // Combo: kills and gems in quick succession build a score multiplier
  // (x2 after 4, up to x4), shown on the HUD. Call before addScore.
  bump() {
    this.combo = (this.comboTimer > 0 ? this.combo : 0) + 1;
    this.comboTimer = 110;
    const mult = Math.min(4, 1 + Math.floor(this.combo / 4));
    if (mult > (this.comboMult || 1)) { this.banner(`COMBO x${mult}!`, 50); this.audio.play('rank'); }
    this.comboMult = mult;
    return mult;
  }

  banner(text, ticks) { this.bannerText = text; this.bannerTime = ticks; }
  shake(ticks) { this.shakeTime = Math.max(this.shakeTime, ticks); }
  flash(color, ticks) { this.flashColor = color; this.flashTime = ticks; }

  dust(x, y, n) {
    const color = this.level.meta.theme === 'winter' ? '#eef4ff' : this.level.meta.theme === 'crystal' ? '#a8f4ff' : '#e6d6b8';
    for (let i = 0; i < n; i++) {
      this.particles.push(new Particle(x + (Math.random() - 0.5) * 16, y - 2, (Math.random() - 0.5) * 2.4, -Math.random() * 1.5, color, 24, 3, 0.06));
    }
  }

  spark(x, y, color) {
    this.particles.push(new Particle(x, y, (Math.random() - 0.5) * 3, -Math.random() * 3, color, 26, 2, 0.12, true));
  }

  trail(x, y, color) {
    this.particles.push(new Particle(x, y, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, color, 14, 3, 0, true));
  }

  ring(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.particles.push(new Particle(x, y, Math.cos(a) * 2.2, Math.sin(a) * 2.2, i % 2 ? color : '#ffffff', 22, 2, 0, true));
    }
  }

  effect(name, x, y, speed) {
    this.effects.push(new Effect(name, x, y, speed));
  }

  // Move Kip to a warp and snap the camera there.
  warpTo(target) {
    const p = this.player;
    this.effect('sparkle', p.cx, p.cy);
    p.x = target.x + (target.w - p.w) / 2;
    p.y = target.bottom - p.h;
    p.prevX = p.x; p.prevY = p.y;
    p.vx = 0; p.vy = 0;
    p.warpLock = target;
    p.stomping = false; p.hovering = false;
    this.audio.play('secret');
    this.flash('#ffffff', 8);
    this.effect('sparkle', p.cx, p.cy);
    this.cam = { x: p.cx - VIEW_W / 2, y: p.cy - VIEW_H / 2 };
    this.clampCamera();
    this.prevCam = { ...this.cam };
    this.terrain.warm(p.cx, p.cy);
  }

  explode(x, y, color) {
    this.effect('explosion', x, y);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3.8;
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 1, i % 3 ? color : '#ffffff', 30 + Math.random() * 20, 3, 0.18, i % 4 === 0));
    }
    this.particles.push(new Particle(x, y, 0, 0, '#ffffff', 8, 18, 0, true));
    this.shake(4);
  }

  rushTrail(p) {
    const hue = (this.levelTime * 12) % 360;
    this.particles.push(new Particle(p.cx + (Math.random() - 0.5) * 10, p.y + 10 + Math.random() * 26, -p.vx * 0.1, 0, `hsl(${hue},100%,65%)`, 18, 4, 0, true));
  }

  fire(player, spread) {
    const dir = player.facing;
    const x = dir > 0 ? player.x + player.w + 8 : player.x - 22;
    const y = player.y + 20;
    // Measured: blaster speed plus the player's own speed in the firing direction.
    const speed = PLAYER.shotSpeed + Math.max(0, Math.min(PHYS.moveCap, player.vx * dir));
    const made = spread ? [-1.6, 0, 1.6].map((vy) => new Shot(x, y, dir * speed, vy, true)) : [new Shot(x, y, dir * speed, 0, false)];
    this.shots.push(...made);
    this.audio.play(spread ? 'spread' : 'shoot');
    if (this.party) for (const s of made) this.party.fire(s);
    this.particles.push(new Particle(x + (dir > 0 ? 4 : 10), y + 4, 0, 0, spread ? '#fff2a0' : '#d8fbff', 4, 8, 0, true));
  }

  // ---------------------------------------------------------------- objectives

  eat() {
    this.food++;
    if (this.food >= PHYS.foodForRush) {
      this.food = 0;
      this.startRush();
    }
  }

  startRush() {
    this.player.rush = PHYS.rushTicks;
    this.banner('SUGAR RUSH!', 120);
    this.flash('#ffffff', 10);
    this.audio.play('rush');
    this.audio.startMusic('rush');
    this.rushMusic = true;
  }

  endRush() {
    if (this.rushMusic && this.state === 'play') this.audio.startMusic(this.level.meta.music);
    this.rushMusic = false;
  }

  breakBlock(tx, ty) {
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    this.audio.play('break');
    this.addScore(50, x, y);
    for (let i = 0; i < 10; i++) {
      this.debris.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 5, life: 60, spin: Math.random() * 6 });
    }
    this.shake(3);
    // Unsupported breakable blocks stacked above crumble too, so one shot at
    // the base of a wall clears the way instead of leaving a hanging stub.
    let up = ty - 1;
    while (this.level.at(tx, up) === 'x' && this.level.breakTile(tx, up)) {
      const cy = up * TILE + TILE / 2;
      this.addScore(50, x, cy);
      for (let i = 0; i < 6; i++) {
        this.debris.push({ x: x + (Math.random() - 0.5) * 20, y: cy + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 5, vy: -1 - Math.random() * 3, life: 60, spin: Math.random() * 6 });
      }
      up--;
    }
  }

  // Hit one tile with an attack. Returns true when the tile took the hit
  // (broke, or a countdown block lost a point), so a shot stops there.
  hitTile(tx, ty, opts = {}) {
    const r = this.level.breakTile(tx, ty, opts);
    if (!r) return false;
    if (this.party && !opts.remote) this.party.tile(tx, ty);
    if (r === 'dent') {
      this.audio.play('hit');
      this.effect('hitSpark', tx * TILE + TILE / 2, ty * TILE + TILE / 2);
      this.shake(2);
      return true;
    }
    this.breakBlock(tx, ty);
    if (r === 'switch') {
      for (const [x, y, solid] of this.level.flipSwitches()) this.effect(solid ? 'sparkle' : 'poof', x * TILE + TILE / 2, y * TILE + TILE / 2);
      this.banner('SWITCH!', 70);
      this.audio.play('checkpoint');
    }
    return true;
  }

  // Break blocks around a point (stomp / uppercut / super jump).
  breakAround(px, py) {
    let broke = false;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    for (const dx of [-1, 0, 1]) {
      if (this.hitTile(tx + dx, ty, { stomp: true, speed: true })) broke = true;
    }
    return broke;
  }

  killPlayer() {
    const p = this.player;
    if (p.dead) return;
    if (this.party) {
      // Party: knocked out (falling off the world), back in 10 s.
      p.dead = true; p.vy = -8; p.vx = 0; p.pole = null;
      this.party.respawn = PARTY_RESPAWN;
      this.audio.play('death');
      return;
    }
    p.dead = true;
    p.pole = null;
    p.health = 0;
    p.rush = 0;
    p.vy = -8;
    p.vx = 0;
    this.audio.hover(false);
    this.audio.stopMusic();
    this.audio.play('death');
    this.shake(10);
  }

  completeLevel() {
    if (this.state !== 'play') return;
    this.state = 'clear';
    this.clearTime = 0;
    this.player.rush = 0;
    this.audio.hover(false);
    this.audio.stopMusic();
    this.audio.play('fanfare');
    const t = this.totals;
    const pct = (got, total) => (total ? Math.round((got / total) * 100) : 100);
    const stats = {
      gems: pct(this.levelGems, t.gems),
      enemies: pct(this.enemiesKilled, t.enemies),
      secrets: pct(this.secretsFound, t.secrets),
      coins: pct(this.levelCoins, t.coins),
      seconds: Math.floor(this.levelTime / 71.4),
    };
    const avg = (stats.gems + stats.enemies + stats.secrets) / 3;
    stats.rank = avg >= 95 ? 'S' : avg >= 80 ? 'A' : avg >= 60 ? 'B' : 'C';
    stats.bonus = {
      time: Math.max(0, 10000 - stats.seconds * 40),
      gems: this.levelGems * 100,
      perfect: avg >= 100 ? 25000 : 0,
    };
    this.stats = stats;
    this.score += stats.bonus.time + stats.bonus.gems + stats.bonus.perfect;
    this.unlocked = Math.max(this.unlocked, Math.min(LEVELS.length, this.levelIndex + 2));
  }

  // ---------------------------------------------------------------- tick

  update(input) {
    this.time++;
    if (this.state !== 'play' && this.state !== 'clear') return;
    if (this.state === 'clear') {
      this.clearTime++;
      this.player.update(this, input);
      this.particles.forEach((q) => q.update());
      this.props.forEach((pr) => pr.kind === 'sign' && pr.update(this));
      this.particles = this.particles.filter((q) => q.life > 0);
      this.updateCamera();
      return;
    }

    this.levelTime++;
    if (this.comboTimer > 0 && --this.comboTimer === 0) { this.combo = 0; this.comboMult = 1; }
    if (this.bannerTime > 0) this.bannerTime--;
    if (this.shakeTime > 0) this.shakeTime--;
    if (this.flashTime > 0) this.flashTime--;
    const p = this.player;
    p.update(this, input);
    if (this.party) this.party.tick(this);

    if (!this.party && p.dead && p.deadTimer > 100) {
      this.lives--;
      if (this.lives < 0) {
        this.state = 'gameover';
        this.overTime = 0;
        this.audio.play('gameover');
        return;
      }
      p.spawn(this.respawn.x, this.respawn.y);
      p.health = PLAYER.maxHealth;
      p.invuln = 100;
      this.audio.startMusic(this.level.meta.music);
    }

    for (const e of this.enemies) e.update(this);
    for (const s of this.shots) s.update(this);
    for (const s of this.enemyShots) s.update(this);
    for (const k of this.pickups) k.update(this);
    this.hintText = null;
    for (const prop of this.props) prop.update(this);
    for (const part of this.particles) part.update();
    for (const fx of this.effects) fx.update(this);
    for (const d of this.debris) { d.x += d.vx; d.y += d.vy; d.vy += 0.3; d.life--; d.spin += 0.3; }

    this.interact(input);

    this.enemies = this.enemies.filter((e) => !e.dead && e.y < this.level.pixelH + 200);
    this.shots = this.shots.filter((s) => !s.dead);
    this.enemyShots = this.enemyShots.filter((s) => !s.dead);
    this.pickups = this.pickups.filter((k) => !k.taken);
    this.particles = this.particles.filter((q) => q.life > 0);
    this.effects = this.effects.filter((fx) => !fx.dead);
    this.debris = this.debris.filter((d) => d.life > 0);
    this.popups = this.popups.filter((q) => --q.life > 0);
    this.popups.forEach((q) => { q.y -= 0.6; });

    this.updateCamera();
    this.weather.update(this.cam.x, this.cam.y, this.time);
  }

  interact(input) {
    const p = this.player;
    for (const s of this.shots) {
      for (const e of this.enemies) {
        if (!s.dead && !e.dead && overlap(s, e)) {
          s.dead = true;
          e.damage(this, 1);
          this.spark(s.x + 7, s.y + 4, '#ffffff');
        }
      }
      // Measured: crates only break when attacked (a shot, stomp or special).
      for (const k of this.pickups) {
        if (!s.dead && !k.taken && k.needsHit && overlap(s, k)) { s.dead = true; k.collect(this); }
      }
    }
    for (const s of this.shots) {
      for (const b of this.enemyShots) {
        if (!s.dead && !b.dead && overlap(s, b)) { s.dead = true; b.kind === 'bomb' ? b.explode(this) : b.pop(this); this.addScore(50, b.x, b.y); }
      }
    }
    if (p.dead || p.pole) return;
    for (const b of this.enemyShots) {
      if (b.dead || !overlap(p, b)) continue;
      if (b.kind === 'bomb') b.explode(this);
      else { b.pop(this); p.hurt(this, b.x + 8); }
    }
    for (const e of this.enemies) {
      if (e.dead || !overlap(p, e)) continue;
      const fromAbove = p.vy > 0 && p.prevY + p.h <= e.prevY + 10;
      if (e.type === 'shell') {
        this.touchShell(e, fromAbove, input);
        continue;
      }
      if (p.attacking || fromAbove) {
        if (e.stomped && !p.rush) e.stomped(this);
        else e.kill(this);
        if (fromAbove || p.stomping) {
          p.bounce(input.held('jump'));
          if (fromAbove) p.y = e.y - p.h;
          this.audio.play('stomp');
        }
      } else {
        p.hurt(this, e.x + e.w / 2);
      }
    }
    for (const k of this.pickups) {
      if (k.taken || k.pending || !overlap(p, k)) continue;
      const take = () => (this.party ? this.party.touch(this, k) : k.collect(this));
      if (!k.needsHit) { take(); continue; }
      if (!p.attacking) continue;
      take();
      // Measured crate bounce: vy = -4 - vy / 2.
      if (p.stomping) { p.bounce(false); p.y = k.y - p.h; }
    }
  }

  // Shells: stomp to stop or start one, walk into a still one to kick it. A
  // sliding shell hurts Kip unless he just kicked it.
  touchShell(e, fromAbove, input) {
    const p = this.player;
    const away = Math.sign(e.cx - p.cx) || p.facing;
    if (fromAbove) {
      if (e.moving) e.vx = 0;
      else e.kick(this, away);
      p.bounce(input.held('jump'));
      p.y = e.y - p.h;
    } else if (p.rush > 0) {
      e.kill(this);
    } else if (!e.moving) {
      e.kick(this, away);
    } else if (e.kickLock === 0) {
      p.hurt(this, e.cx);
    }
  }

  // Measured camera: close 1/4 of the gap each tick, with run look-ahead.
  updateCamera() {
    this.prevCam = { ...this.cam };
    const p = this.player;
    // Original lead: 28 px ahead while walking, 120 px while dashing,
    // moving toward its target a couple of pixels per tick.
    const target = Math.abs(p.vx) < 0.5 ? 0 : Math.sign(p.vx) * (p.dash > 0 && Math.abs(p.vx) > PHYS.walkMax ? CAMERA.dashLead : CAMERA.walkLead);
    this.lead = this.lead || 0;
    this.lead += Math.max(-CAMERA.leadStep, Math.min(CAMERA.leadStep, target - this.lead));
    const look = this.lead;
    const lookUp = p.anim === 'look' ? -70 : p.anim === 'crouch' ? 60 : p.stomping ? 60 : 0;
    const tx = p.cx + look - VIEW_W / 2;
    // Look down a shaft while falling fast.
    const lookFall = p.vy > 4 ? Math.min(90, (p.vy - 4) * 14) : 0;
    const ty = p.cy + CAMERA.verticalBias + lookUp + lookFall - VIEW_H / 2;
    this.cam.x += (tx - this.cam.x) * CAMERA.ease;
    this.cam.y += (ty - this.cam.y) * CAMERA.ease * 0.6;
    this.clampCamera();
  }

  clampCamera() {
    this.cam.x = Math.max(0, Math.min(this.level.pixelW - VIEW_W, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.level.pixelH - VIEW_H, this.cam.y));
  }

  nextLevel() {
    if (this.levelIndex + 1 < LEVELS.length) return this.loadLevel(this.levelIndex + 1);
    this.state = 'win';
    this.overTime = 0;
    this.audio.startMusic('title');
    return null;
  }
}
