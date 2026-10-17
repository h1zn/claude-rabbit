// Enemies, pickups, props (springs, checkpoints, sign, secrets, warps, poles,
// hints), shots, sprite effects and particles.

import { ENEMY, PHYS, PLAYER, TILE } from './config.js';
import { hash2 } from './paint.js';
import { frameAt } from './sheets.js';

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
    game.explode(this.cx, this.y + this.h / 2, this.color || '#ffd54a');
    game.addScore(this.score * game.bump(), this.cx, this.y);
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

  anim(art, name, speed) { return frameAt(art.enemy.anims[name], this.t, speed); }
}

// Basic walker, measured: 1 px/tick, 1 hit point, 100 points. Stomping it
// leaves its shell behind, which can be kicked into other enemies.
export class Turtle extends Enemy {
  constructor(x, y) {
    super('turtle', x, y - 28 + TILE, 30, 28, 1, 100);
    this.vx = -1;
    this.color = '#4ade78';
  }

  update(game) { this.begin(); this.walk(game, 1); }
  sprite(art) { return frameAt(art.turtle.anims.turtleWalk, this.t, 8); }

  stomped(game) {
    this.dead = true;
    game.enemiesKilled++;
    game.addScore(this.score * game.bump(), this.cx, this.y);
    game.audio.play('stomp');
    game.effect('poof', this.cx, this.y + this.h / 2);
    game.enemies.push(new Shell(this.x, this.y + this.h));
  }
}

// A turtle's shell: still until touched, then slides at 6 px/tick (the
// measured walker speed cap), knocking out every enemy in its path.
export class Shell extends Enemy {
  constructor(x, feet) {
    super('shell', x, feet - 18, 30, 18, 1, 100);
    this.color = '#c48aff';
    this.kickLock = 0;
    this.counted = true;   // its turtle already counted toward the tally
  }

  update(game) {
    this.begin();
    if (this.kickLock > 0) this.kickLock--;
    const { level } = game;
    this.vy = Math.min(this.vy + ENEMY.gravity, ENEMY.maxFall);
    const hit = level.move(this, this.vx, this.vy, { climb: this.onGround });
    this.onGround = hit.bottom || (this.onGround && level.snapDown(this, this.vx));
    if (this.onGround) this.vy = 0;
    if (hit.left || hit.right) { this.vx = -this.vx; game.audio.play('hit'); }
    if (this.vx) {
      for (const e of game.enemies) {
        if (e !== this && !e.dead && e.type !== 'shell' && overlap(this, e)) e.kill(game);
      }
    }
  }

  kick(game, dir) {
    this.vx = dir * 6;
    this.kickLock = 12;
    game.audio.play('stomp');
  }

  get moving() { return Math.abs(this.vx) > 0.1; }

  kill(game) {
    if (this.dead) return;
    this.dead = true;
    game.audio.play('kill');
    game.explode(this.cx, this.y + this.h / 2, this.color);
    game.addScore(this.score, this.cx, this.y);
  }

  sprite(art) {
    const a = art.turtle.anims.turtleShell;
    return this.moving ? frameAt(a, this.t, 3) : a.frames[0];
  }
}

// Lurching walker, measured: speed pulses (sin + 1) / 2, and it lunges
// (vx 3, vy -4) when Kip comes within 96 px.
export class Lizard extends Enemy {
  constructor(x, y) {
    super('lizard', x, y - 40 + TILE, 26, 40, 2, 200);
    this.vx = -0.5;
    this.cool = 60;
    this.color = '#ffd54a';
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

  sprite(art) { return this.anim(art, 'lizardWalk'); }
}

// Fast walker with a pitchfork: the measured walker routine at double speed.
export class Demon extends Enemy {
  constructor(x, y) {
    super('demon', x, y - 38 + TILE, 30, 38, 3, 300);
    this.vx = -2;
    this.color = '#ff5a3a';
  }

  update(game) { this.begin(); this.walk(game, 2); }
  sprite(art) { return this.anim(art, 'demonRun', 4); }
}

// Hopper, measured: within 362 px it hops toward Kip, a small hop (vy -2)
// or a big one (vy -5) when he is close.
export class Frog extends Enemy {
  constructor(x, y) {
    super('frog', x, y - 22 + TILE, 24, 22, 3, 400);
    this.wait = 40 + Math.floor(Math.random() * 40);
    this.hopT = 0;
    this.color = '#4ade78';
  }

  update(game) {
    this.begin();
    const { level, player } = game;
    this.vy = Math.min(this.vy + ENEMY.gravity, ENEMY.maxFall);
    const hit = level.move(this, this.vx, this.vy, { climb: this.onGround });
    if (hit.left || hit.right) this.vx = -this.vx * 0.5;
    const was = this.onGround;
    this.onGround = hit.bottom;
    if (this.onGround) {
      if (!was) this.hopT = 0;
      this.vy = 0;
      this.vx *= 0.7;
      if (--this.wait <= 0 && this.near(game, ENEMY.hopRange)) {
        const dir = Math.sign(player.cx - this.cx) || 1;
        const close = this.near(game, ENEMY.hopCloseRange);
        this.facing = dir;
        this.vx = dir * (close ? 2 : 1);
        this.vy = close ? ENEMY.hopBig : ENEMY.hopSmall;
        this.wait = close ? 70 : 40;
        this.hopT = 0;
        game.audio.play('blob');
      }
    }
    this.hopT = (this.hopT || 0) + 1;
  }

  sprite(art) {
    if (!this.onGround) return frameAt(art.enemy.anims.frogJump, this.hopT, 6);
    return this.anim(art, 'frogIdle', 20);
  }
}

// Chasing flier, measured: within 256 px it steers toward Kip at 0.0625 per
// axis per tick, capped at 3 px/tick. Otherwise it drifts back to its perch
// and hangs there.
export class Bat extends Enemy {
  constructor(x, y) {
    super('bat', x, y, 28, 22, 1, 200);
    this.homeX = x; this.homeY = y;
    this.color = '#c48aff';
    this.awake = false;
  }

  update(game) {
    this.begin();
    const { player } = game;
    if (this.near(game, ENEMY.chaseRange)) {
      this.awake = true;
      this.vx += Math.sign(player.cx - this.cx) * ENEMY.chaseAccel;
      this.vy += Math.sign(player.cy - (this.y + this.h / 2)) * ENEMY.chaseAccel;
    } else {
      const dx = this.homeX - this.x; const dy = this.homeY - this.y;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) { this.awake = false; this.vx = 0; this.vy = 0; }
      else { this.vx += Math.sign(dx) * ENEMY.chaseAccel; this.vy += Math.sign(dy) * ENEMY.chaseAccel; }
    }
    const cap = ENEMY.chaseMax;
    this.vx = Math.max(-cap, Math.min(cap, this.vx));
    this.vy = Math.max(-cap, Math.min(cap, this.vy));
    const hit = game.level.move(this, this.vx, this.vy, {});
    if (hit.left || hit.right) this.vx = -this.vx * 0.5;
    if (hit.top || hit.bottom) this.vy = -this.vy * 0.5;
    this.facing = Math.sign(player.cx - this.cx) || this.facing;
  }

  sprite(art) { return this.awake ? this.anim(art, 'batFly', 4) : art.enemy.anims.batHang.frames[0]; }
}

// Hover-and-dive flier, measured: hangs about 64 px above Kip with a sine bob,
// then dives at difficulty + 4 (5 px/tick on normal).
export class Dragonfly extends Enemy {
  constructor(x, y) {
    super('dragonfly', x, y, 30, 20, 1, 300);
    this.homeX = x; this.homeY = y;
    this.mode = 'idle';
    this.timer = 0;
    this.color = '#ff7ad9';
  }

  update(game) {
    this.begin();
    const { player, level } = game;
    this.timer++;
    let tx; let ty;
    if (this.mode === 'dive') {
      const hit = level.move(this, this.vx, this.vy, {});
      if (hit.left || hit.right || hit.top || hit.bottom || this.timer > 60) { this.mode = 'hover'; this.timer = 0; }
      return;
    }
    if (this.near(game, 260)) {
      this.mode = 'hover';
      tx = player.cx - this.w / 2;
      ty = player.y - 64 + Math.sin(this.t / 9) * 10;
      if (this.timer > 110 && Math.abs(player.cx - this.cx) < 80) {
        const dx = player.cx - this.cx; const dy = player.cy - (this.y + this.h / 2);
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 5; this.vy = (dy / d) * 5;
        this.mode = 'dive';
        this.timer = 0;
        game.audio.play('blob');
        return;
      }
    } else {
      this.mode = 'idle';
      tx = this.homeX + Math.sin(this.t / 50) * 40;
      ty = this.homeY + Math.sin(this.t / 11) * 8;
    }
    this.vx = Math.max(-2, Math.min(2, (tx - this.x) * 0.05));
    this.vy = Math.max(-2, Math.min(2, (ty - this.y) * 0.05));
    level.move(this, this.vx, this.vy, {});
    this.facing = Math.sign(player.cx - this.cx) || this.facing;
  }

  sprite(art) { return this.anim(art, 'dragonfly', 3); }
}

// True when no solid tile lies on the straight line between two points.
function clearShot(level, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 16);
  for (let i = 1; i < n; i++) {
    if (level.solid(Math.floor((x0 + ((x1 - x0) * i) / n) / TILE), Math.floor((y0 + ((y1 - y0) * i) / n) / TILE))) return false;
  }
  return true;
}

// Shooter, measured: its projectile starts at 2 px/tick and speeds up by
// 0.125 px/tick² along its line; 70 ticks between throws. The measured range
// is 128 px; tuned up to 224 here so the monkey matters.
export class Monkey extends Enemy {
  constructor(x, y) {
    super('monkey', x, y - 34 + TILE, 26, 34, 2, 300);
    this.cool = 40 + Math.floor(Math.random() * 40);
    this.throwT = 0;
    this.color = '#ff7a2a';
  }

  update(game) {
    this.begin();
    const { player, level } = game;
    this.vy = Math.min(this.vy + ENEMY.gravity, ENEMY.maxFall);
    const hit = level.move(this, 0, this.vy, {});
    if (hit.bottom) this.vy = 0;
    this.facing = Math.sign(player.cx - this.cx) || this.facing;
    if (this.cool > 0) this.cool--;
    if (this.throwT > 0 && ++this.throwT === 12) {
      const sx = this.cx + this.facing * 10; const sy = this.y + 8;
      const dx = player.cx - sx; const dy = player.cy - sy;
      const d = Math.hypot(dx, dy) || 1;
      game.enemyShots.push(new EnemyShot('banana', sx, sy, (dx / d) * ENEMY.shotSpeed, (dy / d) * ENEMY.shotSpeed));
      game.audio.play('shoot');
    }
    if (this.throwT >= 24) this.throwT = 0;
    if (this.cool === 0 && this.throwT === 0 && this.near(game, ENEMY.shooterRange) && !player.dead
      && clearShot(level, this.cx, this.y + 8, player.cx, player.cy)) {
      this.throwT = 1;
      this.cool = ENEMY.shotCooldown;
    }
  }

  sprite(art) {
    return this.throwT > 0 ? frameAt(art.enemy.anims.monkeyThrow, this.throwT, 5) : this.anim(art, 'monkeyIdle', 8);
  }
}

// Bomb lizard: wanders slowly and lobs bombs that bounce once and blow up.
export class Bomber extends Enemy {
  constructor(x, y) {
    super('bomber', x, y - 40 + TILE, 24, 40, 2, 300);
    this.vx = -0.4;
    this.cool = 60;
    this.throwT = 0;
    this.color = '#ffd54a';
  }

  update(game) {
    this.begin();
    const { player, level } = game;
    if (this.cool > 0) this.cool--;
    if (this.throwT > 0) {
      this.throwT++;
      this.vy = Math.min(this.vy + ENEMY.gravity, ENEMY.maxFall);
      if (level.move(this, 0, this.vy, {}).bottom) this.vy = 0;
      this.facing = Math.sign(player.cx - this.cx) || this.facing;
      if (this.throwT === 16) {
        const dx = player.cx - this.cx;
        const b = new EnemyShot('bomb', this.cx + this.facing * 8, this.y + 6, Math.max(-4, Math.min(4, dx / 38)), -4.5);
        game.enemyShots.push(b);
      }
      if (this.throwT > 30) this.throwT = 0;
      return;
    }
    this.walk(game, 0.4);
    if (this.cool === 0 && this.near(game, ENEMY.shooterRange) && !player.dead
      && clearShot(level, this.cx, this.y + 8, player.cx, player.cy)) {
      this.throwT = 1;
      this.cool = ENEMY.shotCooldown + 30;
    }
  }

  sprite(art) {
    return this.throwT > 0 ? frameAt(art.enemy.anims.bomberThrow, this.throwT, 5) : this.anim(art, 'bomber', 7);
  }
}

// A thrown banana (straight, speeding up) or a bomb (lobbed, bounces once,
// then explodes). Kip's shots knock either out of the air.
export class EnemyShot {
  constructor(kind, x, y, vx, vy) {
    Object.assign(this, { kind, x: x - 8, y: y - 8, w: 16, h: 16, vx, vy, life: kind === 'bomb' ? 110 : 140, t: 0, bounced: false });
    this.prevX = this.x; this.prevY = this.y;
  }

  update(game) {
    this.prevX = this.x; this.prevY = this.y;
    this.t++;
    const { level } = game;
    if (this.kind === 'banana') {
      const s = Math.hypot(this.vx, this.vy) || 1;
      this.vx += (this.vx / s) * ENEMY.shotAccel;
      this.vy += (this.vy / s) * ENEMY.shotAccel;
      this.x += this.vx; this.y += this.vy;
      if (level.solidAt(this.x + 8, this.y + 8)) this.pop(game);
    } else {
      this.vy = Math.min(this.vy + ENEMY.gravity, 6);
      const hit = level.move(this, this.vx, this.vy, {});
      if (hit.left || hit.right) this.vx = -this.vx * 0.5;
      if (hit.bottom) {
        if (this.bounced) this.explode(game);
        else { this.bounced = true; this.vy = -2.5; this.vx *= 0.6; }
      }
    }
    if (--this.life <= 0) (this.kind === 'bomb' ? this.explode(game) : (this.dead = true));
  }

  pop(game) {
    this.dead = true;
    game.effect('hitSpark', this.x + 8, this.y + 8);
  }

  explode(game) {
    if (this.dead) return;
    this.dead = true;
    game.effect('explosion', this.x + 8, this.y + 8);
    game.audio.play('kill');
    game.shake(5);
    const p = game.player;
    if (Math.hypot(p.cx - (this.x + 8), p.cy - (this.y + 8)) < 44) p.hurt(game, this.x + 8);
  }

  sprite(art) {
    if (this.kind === 'bomb') return frameAt(art.enemy.anims.bomb, this.t, 3);
    return art.items.anims.food.frames[21];
  }
}

const ENEMIES = { w: Turtle, k: Lizard, n: Demon, h: Frog, f: Bat, d: Dragonfly, J: Monkey, G: Bomber };

export function makeEnemy(ch, px, py) {
  const Kind = ENEMIES[ch];
  return Kind ? new Kind(px, py) : null;
}

// ---------------------------------------------------------------- pickups

const GEMS = {
  '*': { color: 'red', value: 1, score: 100 },
  g: { color: 'green', value: 5, score: 500 },
  b: { color: 'blue', value: 10, score: 1000 },
  v: { color: 'purple', value: 20, score: 2000 },
};
const GEM_ANIM = { red: 'gemRed', green: 'gemGreen', blue: 'gemBlue', purple: 'gemPurple' };
const RING = { red: '#ff6a8a', green: '#5ae08a', blue: '#6aa8ff', purple: '#c48aff' };

export class Pickup {
  constructor(kind, x, y, extra = {}) {
    Object.assign(this, { kind, x, y, w: 16, h: 16, taken: false, t: Math.floor(Math.random() * 100) }, extra);
  }

  static fromChar(ch, tx, ty) {
    const x = tx * TILE + 8;
    const y = ty * TILE + 8;
    if (GEMS[ch]) return new Pickup('gem', x - 2, y - 2, { ...GEMS[ch], w: 20, h: 20 });
    // Measured: silver coin 1 coin / 500 pts, gold coin 5 coins / 1000 pts.
    if (ch === '$') return new Pickup('coin', x - 1, y - 1, { w: 18, h: 18, coins: 1, score: 500 });
    if (ch === '@') return new Pickup('coin', x - 1, y - 1, { w: 18, h: 18, coins: 5, score: 1000, gold: true });
    if (ch === 'o') return new Pickup('food', x - 3, y - 3, { w: 22, h: 22, food: hash2(tx, ty, 4) });
    if (ch === '+') return new Pickup('carrot', x - 3, y - 4, { w: 22, h: 22 });
    if (ch === '%') return new Pickup('carrot', x - 3, y - 4, { w: 22, h: 22, full: true });
    if (ch === '1') return new Pickup('life', x - 4, y - 4, { w: 24, h: 22 });
    if (ch === 'A') return new Pickup('crate', x - 4, ty * TILE + TILE - 22, { w: 24, h: 22, needsHit: true });
    if (ch === 'Q') return new Pickup('shield', x - 4, ty * TILE + TILE - 30, { w: 28, h: 30, needsHit: true });
    if (ch === 'F') return new Pickup('fastfire', x - 4, y - 4, { w: 24, h: 22 });
    return null;
  }

  update(game) {
    this.t++;
    // Gems dropped in party mode fly out and fall until they land.
    if (this.falling) {
      this.vy = Math.min(this.vy + 0.2, 6);
      const hit = game.level.move(this, this.vx, this.vy, {});
      if (hit.left || hit.right) this.vx = -this.vx * 0.5;
      if (hit.bottom) { this.vy = 0; this.vx *= 0.6; if (Math.abs(this.vx) < 0.1) this.falling = false; }
    }
  }

  sprite(art) {
    const a = art.items.anims;
    if (this.kind === 'gem') return frameAt(a[GEM_ANIM[this.color]], this.t, 5);
    if (this.kind === 'coin') return frameAt(this.gold ? a.coinGold : a.coinSilver, this.t, 3);
    if (this.kind === 'food') return a.food.frames[Math.floor(this.food * a.food.frames.length)];
    if (this.kind === 'carrot') return this.full ? frameAt(a.carrotFull, this.t, 5) : a.carrot.frames[0];
    if (this.kind === 'life') return frameAt(a.oneUp, this.t, 5);
    if (this.kind === 'fastfire') return frameAt(a.fastfire, this.t, 4);
    if (this.kind === 'shield') return frameAt(a.shieldMonitor, this.t, 6);
    return a.ammoCrate.frames[0];
  }

  collect(game) {
    this.taken = true;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const p = game.player;
    if (this.kind === 'gem') {
      // Manual: gems earn extra lives as well as the end-of-level bonus.
      if (Math.floor((game.gems + this.value) / 100) > Math.floor(game.gems / 100)) {
        game.lives++;
        game.banner('100 GEMS - 1UP!', 80);
      }
      game.gems += this.value;
      game.levelGems += this.value;
      game.addScore(this.score * game.bump(), cx, this.y);
      game.audio.play('gem');
      game.ring(cx, cy, RING[this.color]);
    } else if (this.kind === 'coin') {
      game.coins += this.coins;
      game.levelCoins += this.coins;
      game.addScore(this.score, cx, this.y);
      game.audio.play('coin');
      game.effect('sparkle', cx, cy);
    } else if (this.kind === 'food') {
      game.addScore(50, cx, this.y);
      game.audio.play('food');
      game.eat();
    } else if (this.kind === 'carrot') {
      // Measured carrot: +1 heart and 70 ticks of invulnerability; the full
      // carrot restores every heart and gives 350 ticks.
      p.health = this.full ? PLAYER.maxHealth : Math.min(PLAYER.maxHealth, p.health + 1);
      p.invuln = Math.max(p.invuln, this.full ? 350 : PLAYER.carrotInvuln);
      game.addScore(200, cx, this.y);
      game.audio.play('berry');
      game.banner(p.health >= PLAYER.maxHealth ? 'FULL HEALTH!' : '+1 HEART', 50);
      game.ring(cx, cy, '#ff8a3a');
    } else if (this.kind === 'life') {
      game.lives++;
      game.addScore(1000, cx, this.y);
      game.audio.play('secret');
      game.banner('1UP!', 60);
      game.ring(cx, cy, '#5ae08a');
    } else if (this.kind === 'fastfire') {
      // Measured: each Fastfire cuts the fire delay by 3 ticks, down to 6.
      p.shotDelay = Math.max(PLAYER.minShotDelay, p.shotDelay - PLAYER.fastfireStep);
      game.addScore(100, cx, this.y);
      game.audio.play('crate');
      game.banner('FASTFIRE!', 50);
    } else if (this.kind === 'shield') {
      p.shield = PLAYER.shieldTicks;
      game.addScore(500, cx, this.y);
      game.audio.play('rush');
      game.banner('FIRE SHIELD!', 80);
      game.explode(cx, cy, '#ff9a3a');
    } else if (this.kind === 'crate') {
      p.spreadAmmo += 30;
      game.addScore(300, cx, this.y);
      game.audio.play('crate');
      game.explode(cx, cy, '#c08a4e');
    }
  }
}

// ---------------------------------------------------------------- props

const SPRINGS = {
  S: { color: 'red', dir: 0 },
  T: { color: 'green', dir: 0 },
  U: { color: 'blue', dir: 0 },
  '>': { color: 'red', dir: 1 },
  '<': { color: 'red', dir: -1 },
};
export const SPRING_CHARS = Object.keys(SPRINGS);

// Floor springs launch Kip up (measured red -16; green and blue scaled, see
// config). Side springs, standing against a wall, throw him sideways at 16.
export class Spring {
  constructor(tx, ty, ch = 'S') {
    this.kind = 'spring';
    Object.assign(this, SPRINGS[ch]);
    if (this.dir) {
      this.x = tx * TILE + (this.dir > 0 ? 0 : 10); this.y = ty * TILE; this.w = 22; this.h = TILE;
    } else {
      this.x = tx * TILE; this.y = ty * TILE + 12; this.w = TILE; this.h = 20;
    }
    this.squash = 0;
  }

  update(game) {
    if (this.squash > 0) this.squash--;
    const p = game.player;
    if (p.dead || p.pole) return;
    if (this.dir) {
      if (!overlap(this, p)) return;
      p.vx = this.dir * PHYS.springSide;
      p.vy = Math.min(p.vy, -2);
      p.facing = this.dir;
      p.x = this.dir > 0 ? this.x + this.w : this.x - p.w;
      p.springLock = 30;
      this.launch(game, p.cx, p.cy);
      return;
    }
    const feet = p.y + p.h;
    if (p.vy >= 0 && feet >= this.y && feet <= this.y + 18 && p.x + p.w > this.x + 4 && p.x < this.x + this.w - 4) {
      p.y = this.y - p.h;
      p.vy = PHYS.springs[this.color];
      p.jumping = false; p.jumpCut = false; p.onGround = false; p.stomping = false;
      p.hoverLeft = PHYS.hoverTicks;
      p.springLock = 0;
      this.launch(game, p.cx, this.y + 6);
    }
  }

  launch(game, x, y) {
    this.squash = 12;
    game.audio.play('spring');
    game.dust(x, y, 6);
  }

  sprite(art) {
    const a = art.items.anims[{ red: 'springRed', green: 'springGreen', blue: 'springBlue' }[this.color]];
    return this.squash > 0 ? a.frames[Math.min(a.frames.length - 1, (12 - this.squash) >> 1)] : a.frames[0];
  }
}

export class Checkpoint {
  constructor(tx, ty) {
    this.kind = 'checkpoint';
    this.x = tx * TILE + 2; this.y = ty * TILE + TILE - 56; this.w = 28; this.h = 56;
    this.active = false;
    this.t = 0;
  }

  update(game) {
    if (this.active) this.t++;
    if (!this.active && overlap(this, game.player)) {
      this.active = true;
      game.respawn = { x: this.x, y: this.y + this.h - game.player.h };
      game.audio.play('checkpoint');
      game.banner('CHECKPOINT!', 90);
      for (let i = 0; i < 16; i++) game.spark(this.x + 14, this.y + 20, '#ffd54a');
    }
  }

  sprite(art) {
    const a = art.items.anims;
    return this.active ? frameAt(a.checkpointOpen, this.t, 5) : a.checkpoint.frames[0];
  }
}

// The goal sign: touch it and it spins, then the level is clear.
export class Sign {
  // `hidden`: an invisible end-of-level area (one tile), as JJ2 levels use.
  constructor(tx, ty, hidden = false) {
    this.kind = 'sign';
    this.hidden = hidden;
    this.x = tx * TILE - 4; this.y = ty * TILE + TILE - 52; this.w = 40; this.h = 52;
    if (hidden) { this.x = tx * TILE; this.y = ty * TILE; this.w = TILE; this.h = TILE; }
    this.angle = 0; this.speed = 0.04; this.hit = 0;
  }

  update(game) {
    this.angle += this.speed;
    if (this.hit > 0) {
      this.hit++;
      this.speed = Math.max(0.04, this.speed * 0.985);
      if (this.hit % 4 === 0) game.spark(this.x + 20 + (Math.random() - 0.5) * 30, this.y + 10, ['#ffd54a', '#5ee8ff', '#ff7ad9'][this.hit % 3]);
      if (this.hit === 70 && !game.party) game.completeLevel();
    } else if (game.party && game.state === 'play' && !game.player.dead && overlap(this, game.player)) {
      // Party: the sign only counts with enough gems.
      if (game.gems >= 100 && !game.party.result) {
        this.hit = 1;
        this.speed = 0.6 + Math.abs(game.player.vx) * 0.18;
        game.party.win(game);
      } else if (game.levelTime % 60 === 0) game.banner('NEED 100 GEMS!', 50);
    } else if (!game.party && game.state === 'play' && !game.player.dead && overlap(this, game.player)) {
      // Measured: the sign spins faster the faster Kip runs into it; 1000 points.
      this.hit = 1;
      this.speed = 0.6 + Math.abs(game.player.vx) * 0.18;
      game.addScore(1000, this.x + this.w / 2, this.y);
      game.audio.play('sign');
      game.player.celebrate = true;
    }
  }

  sprite(art) { return art.items.anims.exitSign.frames[0]; }
  // Horizontal squash that fakes the sign spinning on its post.
  get spin() { return Math.cos(this.angle); }
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

// In-level warp. Measured behaviour: a warp may cost coins, and when Kip has
// too few it shows "x N" (the coins still needed) instead of moving him. A
// coin warp is the same thing leading to a bonus room. Warps marked `exitOnly`
// are arrival points that do nothing when touched.
export class Warp {
  constructor(o) {
    this.kind = 'warp';
    Object.assign(this, o);
    this.x = o.tx * TILE; this.y = o.ty * TILE - TILE; this.w = TILE; this.h = TILE * 2;
    this.t = Math.floor(Math.random() * 100);
    this.near = 0;
  }

  update(game) {
    this.t++;
    const p = game.player;
    if (this.near > 0) this.near--;
    if (this.exitOnly || p.dead || game.state !== 'play') return;
    if (!overlap(this, p)) {
      if (p.warpLock === this) p.warpLock = null;
      return;
    }
    if (p.warpLock === this) return;
    const short = (this.cost || 0) - game.coins;
    if (short > 0) {
      if (this.near === 0) game.audio.play('hit');
      this.near = 60;
      return;
    }
    const target = game.warps.find((w) => w.id === this.to);
    if (!target) return;
    if (this.cost) {
      game.coins -= this.cost;
      game.banner(this.label || 'COIN WARP!', 90);
      this.cost = 0;
    }
    game.warpTo(target);
  }

  get bottom() { return this.y + this.h; }
}

// Swinging pole. Measured: Kip is held for up to 70 ticks while he spins,
// then flung out at up to 20 px/tick. Horizontal poles throw him sideways,
// vertical poles throw him up. Jump lets go early.
export class Pole {
  // `hidden`: the level's own tiles already show the pole.
  constructor(tx, ty, vertical, hidden = false) {
    this.kind = 'pole';
    this.vertical = vertical;
    this.hidden = hidden;
    this.px = tx * TILE + TILE / 2; this.py = ty * TILE + TILE / 2;
    this.x = this.px - 14; this.y = this.py - 14; this.w = 28; this.h = 28;
  }

  update(game) {
    const p = game.player;
    if (p.dead || p.pole || p.poleCool > 0 || p.stomping || p.special > 0) return;
    if (!overlap(this, { x: p.cx - 4, y: p.y + 2, w: 8, h: 18 })) return;
    p.grabPole(this, game);
  }
}

// A hint sign: shows its text while Kip stands in front of it.
export class Hint {
  constructor(o) {
    this.kind = 'hint';
    Object.assign(this, o);
    this.x = o.tx * TILE - TILE; this.y = o.ty * TILE - TILE; this.w = TILE * 3; this.h = TILE * 2;
    // Hidden hints are JJ2 text areas: just their tile.
    if (o.hidden) { this.x = o.tx * TILE; this.y = o.ty * TILE; this.w = TILE; this.h = TILE; }
  }

  update(game) {
    if (overlap(this, game.player)) game.hintText = this.text;
  }
}

// ---------------------------------------------------------------- shots, effects and particles

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
    if (game.hitTile(tx, ty)) {
      this.dead = true;
    } else if (game.level.shotHits(this.x + this.w / 2, this.y + this.h / 2)) {
      this.dead = true;
      game.effect('hitSpark', this.x + this.w / 2, this.y + this.h / 2);
    }
    if (game.levelTime % 2 === 0) game.trail(this.x + 4, this.y + 4, this.spread ? '#ffb02e' : '#2ad8ff');
  }
}

// A one-shot sprite animation from the effects sheet, centred on (x, y).
export class Effect {
  constructor(anim, x, y, speed) {
    Object.assign(this, { anim, x, y, speed, t: 0 });
  }

  update(game) {
    this.t++;
    const a = game.art.fx.anims[this.anim];
    this.dead = this.t >= a.frames.length * (this.speed || a.speed);
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
