// Enemies, pickups, props (springs, checkpoints, sign, secrets), shots and particles.

import { ENEMY, PHYS, PLAYER, TILE } from './config.js';
import { hash2 } from './paint.js';

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------- enemies

class Enemy {
  constructor(type, x, y, w, h, hp, score) {
    Object.assign(this, { type, x, y, w, h, hp, score });
    this.prevX = x; this.prevY = y;
    this.vx = 0; this.vy = 0;
    this.facing = -1;
    this.flash = 0;
    this.dead = false;
    this.onGround = false;
    this.t = Math.floor(Math.random() * 60);
  }

  get cx() { return this.x + this.w / 2; }

  damage(game, amount) {
    this.hp -= amount;
    this.flash = 6;
    if (this.hp <= 0) this.kill(game);
    else game.audio.play('hit');
  }

  kill(game) {
    if (this.dead) return;
    this.dead = true;
    game.enemiesKilled++;
    game.audio.play('kill');
    const color = { bugbot: '#a06cf0', blobble: '#4ade78', buzzwing: '#ffcf2e', frostmite: '#cfe6ff' }[this.type];
    game.explode(this.cx, this.y + this.h / 2, color);
    game.addScore(this.score, this.cx, this.y);
  }

  begin() {
    this.prevX = this.x; this.prevY = this.y;
    this.t++;
    if (this.flash > 0) this.flash--;
  }

  // Shared ground walking with slopes. Measured: enemies fall with 0.125
  // gravity capped at 4, and turn around at walls *and* ledges.
  walk(game, speed) {
    const { level } = game;
    this.vy = Math.min(this.vy + ENEMY.gravity, ENEMY.maxFall);
    const grounded = this.onGround;
    const hit = level.move(this, this.vx, this.vy, { climb: grounded });
    this.onGround = hit.bottom || (grounded && this.vy >= 0 && level.snapDown(this, this.vx));
    if (this.onGround) this.vy = 0;
    const probe = { x: this.vx > 0 ? this.x + this.w : this.x - 2, y: this.y, w: 2, h: this.h };
    const ledge = this.onGround && level.groundBelow(probe, TILE) === null;
    if (hit.left || hit.right || ledge) this.vx = -this.vx;
    if (Math.abs(this.vx) < 0.01) this.vx = -speed;
    this.facing = Math.sign(this.vx) || this.facing;
  }

  near(game, range) {
    const p = game.player;
    if (p.dead) return false;
    const dx = p.cx - this.cx; const dy = p.cy - (this.y + this.h / 2);
    return dx * dx + dy * dy < range * range;
  }
}

// Basic walker, measured: 1 px/tick, 1 hit point, 100 points.
export class Bugbot extends Enemy {
  constructor(x, y) { super('bugbot', x, y - 26 + TILE, 30, 26, 1, 100); this.vx = -1; }
  update(game) { this.begin(); this.walk(game, 1); }
  frame(art) { return art.bugbot[Math.floor(this.t / 8) % 2]; }
}

// Lurching walker, measured: speed pulses (sin + 1) / 2, and it lunges
// (vx 3, vy -4) when Kip comes within 96 px.
export class Frostmite extends Enemy {
  constructor(x, y) {
    super('frostmite', x, y - 28 + TILE, 28, 28, 2, 200);
    this.vx = -0.5;
    this.cool = 60;
  }

  update(game) {
    this.begin();
    if (this.cool > 0) this.cool--;
    const dir = Math.sign(this.vx) || this.facing;
    if (this.onGround) {
      if (this.cool === 0 && this.near(game, ENEMY.lungeRange)) {
        const toward = Math.sign(game.player.cx - this.cx) || dir;
        this.vx = toward * ENEMY.lungeVx;
        this.vy = ENEMY.lungeVy;
        this.onGround = false;
        this.cool = ENEMY.lungeCooldown;
        game.audio.play('blob');
      } else {
        this.vx = dir * Math.max(0.05, (Math.sin(this.t / 10) + 1) / 2);
      }
    }
    this.walk(game, 0.5);
  }

  frame(art) { return art.frostmite[Math.floor(this.t / 6) % 4]; }
}

// Hopper, measured: within 362 px it hops toward Kip, a small hop (vy -2)
// or a big one (vy -5) when he is close.
export class Blobble extends Enemy {
  constructor(x, y) {
    super('blobble', x, y - 24 + TILE, 26, 24, 3, 400);
    this.wait = 40 + Math.floor(Math.random() * 40);
  }

  update(game) {
    this.begin();
    const { level, player } = game;
    this.vy = Math.min(this.vy + ENEMY.gravity, ENEMY.maxFall);
    const hit = level.move(this, this.vx, this.vy, { climb: this.onGround });
    if (hit.left || hit.right) this.vx = -this.vx * 0.5;
    this.onGround = hit.bottom;
    if (this.onGround) {
      this.vy = 0;
      this.vx *= 0.7;
      if (--this.wait <= 0 && this.near(game, ENEMY.hopRange)) {
        const dir = Math.sign(player.cx - this.cx) || 1;
        const close = this.near(game, ENEMY.hopCloseRange);
        this.facing = dir;
        this.vx = dir * (close ? 2 : 1);
        this.vy = close ? ENEMY.hopBig : ENEMY.hopSmall;
        this.wait = close ? 70 : 40;
        game.audio.play('blob');
      }
    }
  }

  frame(art) { return art.blobble[!this.onGround ? 2 : this.wait < 12 ? 1 : 0]; }
}

// Chasing flier, measured: within 256 px it steers toward Kip at 0.0625 per
// axis per tick, capped at 3 px/tick. Otherwise it drifts around its perch.
export class Buzzwing extends Enemy {
  constructor(x, y) {
    super('buzzwing', x, y, 28, 22, 1, 200);
    this.homeX = x; this.homeY = y;
  }

  update(game) {
    this.begin();
    const { player } = game;
    if (this.near(game, ENEMY.chaseRange)) {
      this.vx += Math.sign(player.cx - this.cx) * ENEMY.chaseAccel;
      this.vy += Math.sign(player.cy - (this.y + this.h / 2)) * ENEMY.chaseAccel;
    } else {
      this.vx += Math.sign(this.homeX + Math.sin(this.t / 40) * 60 - this.x) * ENEMY.chaseAccel;
      this.vy += Math.sign(this.homeY + Math.sin(this.t / 13) * 12 - this.y) * ENEMY.chaseAccel;
    }
    const cap = ENEMY.chaseMax;
    this.vx = Math.max(-cap, Math.min(cap, this.vx));
    this.vy = Math.max(-cap, Math.min(cap, this.vy));
    const hit = game.level.move(this, this.vx, this.vy, {});
    if (hit.left || hit.right) this.vx = -this.vx * 0.5;
    if (hit.top || hit.bottom) this.vy = -this.vy * 0.5;
    this.facing = Math.sign(player.cx - this.cx) || this.facing;
  }

  frame(art) { return art.buzzwing[Math.floor(this.t / 3) % 2]; }
}

export function makeEnemy(ch, px, py) {
  if (ch === 'w') return new Bugbot(px, py);
  if (ch === 'h') return new Blobble(px, py);
  if (ch === 'f') return new Buzzwing(px, py);
  if (ch === 'k') return new Frostmite(px, py);
  return null;
}

// ---------------------------------------------------------------- pickups

const GEMS = {
  '*': { color: 'red', value: 1, score: 100 },
  g: { color: 'green', value: 5, score: 500 },
  b: { color: 'blue', value: 10, score: 1000 },
  v: { color: 'purple', value: 20, score: 2000 },
};
const FOODS = {
  meadow: ['apple', 'cherry', 'cupcake', 'donut'],
  winter: ['candy', 'cupcake', 'icecream', 'donut'],
  crystal: ['icecream', 'cherry', 'cupcake', 'apple'],
};

export class Pickup {
  constructor(kind, x, y, extra = {}) {
    Object.assign(this, { kind, x, y, w: 16, h: 16, taken: false, t: Math.floor(Math.random() * 100) }, extra);
  }

  static fromChar(ch, tx, ty, theme) {
    const x = tx * TILE + 8;
    const y = ty * TILE + 8;
    if (GEMS[ch]) return new Pickup('gem', x - 2, y - 2, { ...GEMS[ch], w: 20, h: 20 });
    if (ch === '$') return new Pickup('coin', x - 1, y - 1, { w: 18, h: 18 });
    if (ch === 'o') {
      const list = FOODS[theme] || FOODS.meadow;
      return new Pickup('food', x - 3, y - 3, { w: 22, h: 22, food: list[Math.floor(hash2(tx, ty, 4) * list.length)] });
    }
    if (ch === '+') return new Pickup('carrot', x - 3, y - 4, { w: 22, h: 22 });
    if (ch === 'A') return new Pickup('crate', x - 4, ty * TILE + TILE - 22, { w: 24, h: 22 });
    return null;
  }

  update() { this.t++; }

  collect(game) {
    this.taken = true;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    if (this.kind === 'gem') {
      game.gems += this.value;
      game.levelGems += this.value;
      game.addScore(this.score, cx, this.y);
      game.audio.play('gem');
      game.ring(cx, cy, { red: '#ff6a8a', green: '#5ae08a', blue: '#6aa8ff', purple: '#c48aff' }[this.color]);
    } else if (this.kind === 'coin') {
      game.coins++;
      game.addScore(500, cx, this.y);
      game.audio.play('coin');
      game.ring(cx, cy, '#ffd54a');
    } else if (this.kind === 'food') {
      game.addScore(50, cx, this.y);
      game.audio.play('food');
      game.eat();
    } else if (this.kind === 'carrot') {
      // Measured carrot: +1 heart and 70 ticks of invulnerability.
      game.player.health = Math.min(PLAYER.maxHealth, game.player.health + 1);
      game.player.invuln = Math.max(game.player.invuln, PLAYER.carrotInvuln);
      game.addScore(200, cx, this.y);
      game.audio.play('berry');
      game.banner(game.player.health >= PLAYER.maxHealth ? 'FULL HEALTH!' : '+1 HEART', 50);
      game.ring(cx, cy, '#ff5a7a');
    } else if (this.kind === 'crate') {
      game.player.spreadAmmo += 30;
      game.addScore(300, cx, this.y);
      game.audio.play('crate');
      game.explode(cx, cy, '#c08a4e');
    }
  }
}

// ---------------------------------------------------------------- props

export class Spring {
  constructor(tx, ty) {
    this.kind = 'spring';
    this.x = tx * TILE; this.y = ty * TILE + 6; this.w = TILE; this.h = 26;
    this.squash = 0;
  }

  update(game) {
    if (this.squash > 0) this.squash--;
    const p = game.player;
    const feet = p.y + p.h;
    if (!p.dead && p.vy >= 0 && feet >= this.y + 4 && feet <= this.y + 20 && p.x + p.w > this.x + 4 && p.x < this.x + this.w - 4) {
      p.y = this.y + 4 - p.h;
      p.vy = PHYS.springLaunch;
      p.jumping = false; p.onGround = false; p.stomping = false;
      p.hoverLeft = PHYS.hoverTicks;
      this.squash = 10;
      game.audio.play('spring');
      game.dust(p.cx, this.y + 6, 6);
    }
  }
}

export class Checkpoint {
  constructor(tx, ty) {
    this.kind = 'checkpoint';
    this.x = tx * TILE + 4; this.y = ty * TILE + TILE - 56; this.w = 24; this.h = 56;
    this.active = false;
  }

  update(game) {
    if (!this.active && overlap(this, game.player)) {
      this.active = true;
      game.respawn = { x: this.x, y: this.y + this.h - game.player.h };
      game.audio.play('checkpoint');
      game.banner('CHECKPOINT!', 90);
      for (let i = 0; i < 16; i++) game.spark(this.x + 12, this.y + 10, '#ffd54a');
    }
  }
}

// The goal sign: touch it and it spins, then the level is clear.
export class Sign {
  constructor(tx, ty) {
    this.kind = 'sign';
    this.x = tx * TILE - 6; this.y = ty * TILE + TILE - 60; this.w = 44; this.h = 60;
    this.angle = 0; this.speed = 0.15; this.hit = 0;
  }

  update(game) {
    this.angle += this.speed;
    if (this.hit > 0) {
      this.hit++;
      this.speed = Math.max(0.15, this.speed * 0.985);
      if (this.hit % 4 === 0) game.spark(this.x + 22 + (Math.random() - 0.5) * 30, this.y + 10, ['#ffd54a', '#5ee8ff', '#ff7ad9'][this.hit % 3]);
      if (this.hit === 70) game.completeLevel();
    } else if (game.state === 'play' && !game.player.dead && overlap(this, game.player)) {
      // Measured: the sign spins faster the faster Kip runs into it; 1000 points.
      this.hit = 1;
      this.speed = 0.6 + Math.abs(game.player.vx) * 0.18;
      game.addScore(1000, this.x + this.w / 2, this.y);
      game.audio.play('sign');
      game.player.celebrate = true;
    }
  }

  frame(art) {
    const n = art.sign.length;
    return art.sign[Math.floor(((this.angle / (Math.PI * 2)) % 1 + 1) % 1 * n) % n];
  }
}

// Invisible 3x3-tile trigger; counts a secret the first time Kip enters.
export class SecretZone {
  constructor(tx, ty) {
    this.kind = 'secret';
    this.x = (tx - 1) * TILE; this.y = (ty - 1) * TILE; this.w = TILE * 3; this.h = TILE * 3;
    this.found = false;
  }

  update(game) {
    if (!this.found && overlap(this, game.player)) {
      this.found = true;
      game.secretsFound++;
      game.addScore(5000, this.x + this.w / 2, this.y);
      game.banner('SECRET FOUND!', 110);
      game.audio.play('secret');
      for (let i = 0; i < 24; i++) game.spark(this.x + this.w / 2, this.y + this.h / 2, i % 2 ? '#ffd54a' : '#ffffff');
    }
  }
}

// ---------------------------------------------------------------- shots and particles

export class Shot {
  constructor(x, y, vx, vy, spread) {
    Object.assign(this, { x, y, vx, vy, spread, w: 14, h: 8, life: PLAYER.shotLife, dead: false });
    this.prevX = x; this.prevY = y;
  }

  update(game) {
    this.prevX = this.x; this.prevY = this.y;
    this.vx += Math.sign(this.vx) * PLAYER.shotAccel;
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.level.breakTile(tx, ty)) {
      this.dead = true;
      game.breakBlock(tx, ty);
    } else if (game.level.groundish(tx, ty)) {
      this.dead = true;
      game.spark(this.x + this.w / 2, this.y + this.h / 2, this.spread ? '#ffd54a' : '#5ee8ff');
    }
    if (game.levelTime % 2 === 0) game.trail(this.x + 4, this.y + 4, this.spread ? '#ffb02e' : '#2ad8ff');
  }
}

export class Particle {
  constructor(x, y, vx, vy, color, life, size = 2, gravity = 0.15, glow = false) {
    Object.assign(this, { x, y, vx, vy, color, life, maxLife: life, size, gravity, glow });
  }

  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.97;
    this.life--;
  }
}
