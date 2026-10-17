// Bosses (manual, "The Bosses"): the Queen and Schwartzenguard, plus Bilsy,
// the Robot and Uterus from the original's levels. Each guards the exit: the
// exit sign stays locked until it is beaten. Behaviour follows Jazz2
// Resurrection's reimplementation (Actors/Enemies/Bosses), converted from its
// 60 fps frames to our 70 Hz ticks.

import { TILE } from './config.js';
import { Enemy, overlap, Shell } from './entities.js';
import { frameAt } from './sheets.js';

const T = 70 / 60;            // frames -> ticks
const V = 60 / 70;            // px per frame -> px per tick
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- base

class Boss extends Enemy {
  constructor(type, x, y, w, h, hp, score, name) {
    super(type, x, y, w, h, hp, score);
    Object.assign(this, { boss: true, guard: true, name, maxHp: hp, active: false, state: 'wait', st: 0, at: 0, anim: 'idle' });
    this.origin = { x: this.x, y: this.y };
    this.freezable = true;
  }

  get cy() { return this.y + this.h / 2; }

  // Wake when the player comes into the arena (or steps on a JJ2 boss area).
  wake(game) {
    if (this.active) return true;
    const p = game.player;
    if (p.dead) return false;
    const near = Math.abs(p.cx - this.cx) < 300 && Math.abs(p.cy - this.cy) < 200;
    if (!near && !(game.bossCall && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 800)) return false;
    this.active = true;
    this.hp = this.maxHp;
    game.activeBoss = this;
    game.banner(this.name, 120);
    game.audio.play('rush');
    this.activate(game);
    return true;
  }

  activate() {}

  // The player died: the fight starts over, as in the original.
  reset() {
    this.x = this.origin.x; this.y = this.origin.y; this.prevX = this.x; this.prevY = this.y;
    this.vx = 0; this.vy = 0; this.frozen = 0;
    this.active = false; this.state = 'wait'; this.st = 0; this.anim = 'idle'; this.hp = this.maxHp;
  }

  // Play `anim` from its start.
  play(anim) { this.anim = anim; this.at = 0; }

  begin() {
    super.begin();
    this.at++;
    if (this.st > 0) this.st = Math.max(0, this.st - 1);
  }

  facePlayer(game) { this.facing = game.player.cx < this.cx ? -1 : 1; }

  // Gravity and ground for bosses that walk.
  fall(game, climb = true) {
    this.vy = Math.min(this.vy + 0.125, 6);
    const hit = game.level.move(this, this.vx, this.vy, { climb: climb && this.onGround });
    this.onGround = hit.bottom;
    if (hit.bottom) this.vy = 0;
    return hit;
  }

  // Ground ahead (so walkers turn at an arena's edge).
  ledgeAhead(game) {
    const probe = { x: this.vx > 0 ? this.x + this.w : this.x - 2, y: this.y, w: 2, h: this.h };
    return this.onGround && game.level.groundBelow(probe, TILE) === null;
  }

  // Touching the player: a stomp from above hurts the boss, anything else the player.
  touch(game, p, fromAbove, input) {
    if (!this.active) this.wake(game);
    if (this.frozen > 0) return;
    if (fromAbove || p.attacking) {
      this.damage(game, p.stomping || p.special > 0 ? 4 : 2);
      if (fromAbove || p.stomping) { p.bounce(input.held('jump')); if (fromAbove) p.y = this.y - p.h; game.audio.play('stomp'); }
      else p.vx = -p.vx * 0.5;
      return;
    }
    if (!this.harmless) p.hurt(game, this.cx);
  }

  damage(game, amount) {
    if (!this.active || this.dead) return;
    if (this.shielded) { game.audio.play('bounce'); this.flash = 2; return; }
    super.damage(game, amount);
  }

  kill(game) {
    if (this.dead) return;
    super.kill(game);
    game.bossDefeated(this);
  }

  sheet(art) { return art[this.type]; }

  frame(art) {
    const a = this.sheet(art).anims[this.anim];
    return frameAt(a, this.at, a.speed);
  }

  sprite(art) { return this.frame(art); }

  // Sheets face right unless `facesLeft`.
  draw(r, alpha) {
    let f = this.frame(r.art);
    if (this.frozen > 0) f = r.iced(f);
    const x = this.prevX + (this.x - this.prevX) * alpha + this.w / 2;
    const y = this.prevY + (this.y - this.prevY) * alpha + this.h + 2;
    r.sprite(f, x, y, this.facesLeft ? this.facing < 0 : this.facing > 0);
  }
}

// A boss projectile in game.enemyShots. `solid` ones can't be shot down;
// `pierce` ones keep going after hitting the player.
class BossShot {
  constructor(kind, x, y, vx, vy, extra = {}) {
    Object.assign(this, { kind, x, y, vx, vy, w: 16, h: 16, t: 0, life: 9999, dead: false, solid: true }, extra);
    this.prevX = x; this.prevY = y;
  }

  update(game) {
    this.prevX = this.x; this.prevY = this.y;
    this.t++;
    this.move(game);
    if (--this.life <= 0) this.dead = true;
  }

  move() { this.x += this.vx; this.y += this.vy; }
  pop(game) { if (!this.pierce) { this.dead = true; game.effect('hitSpark', this.x + this.w / 2, this.y + this.h / 2); } }
  sprite(art) { return art.items.anims.mace.frames[0]; }

  draw(r, alpha) {
    const x = this.prevX + (this.x - this.prevX) * alpha + this.w / 2;
    const y = this.prevY + (this.y - this.prevY) * alpha + this.h / 2;
    const f = this.sprite(r.art);
    if (this.glowColor) r.glow(x, y, 18, this.glowColor);
    if (this.spin) {
      r.ctx.save(); r.ctx.translate(Math.round(x), Math.round(y)); r.ctx.rotate(this.t * this.spin);
      r.ctx.drawImage(f.right, -f.w / 2, -f.h / 2); r.ctx.restore();
    } else r.centred(f, x, y, this.vx >= 0);
  }
}

// ---------------------------------------------------------------- Schwartzenguard

// Manual: "This flailerang throwing Boss is the roughest and toughest of
// Devan's turtle guards ... having to wait for his flailerang to return to
// him before he can come after you." (Resurrection: TurtleBoss, 100 health.)
export class Schwartzenguard extends Boss {
  constructor(x, y) {
    super('schwarz', x, y - 52 + TILE, 36, 52, 100, 5000, 'SCHWARTZENGUARD!');
    this.facing = -1;
  }

  activate(game) { this.walk(game, 'walk1', rand(120, 160) * T); }

  walk(game, state, time) {
    this.state = state; this.st = time;
    this.facePlayer(game);
    this.vx = this.facing * 1.6 * V;
    this.anim = 'walk';
  }

  update(game) {
    this.begin();
    if (!this.wake(game)) { this.fall(game); return; }
    const hit = this.fall(game);
    switch (this.state) {
      case 'walk1':
        if (this.st === 0) this.walk(game, 'walk2', 16 * T);
        else if (hit.left || hit.right || this.ledgeAhead(game)) { this.vx = -this.vx; this.facing = Math.sign(this.vx); }
        break;
      case 'walk2':
        if (hit.left || hit.right || this.ledgeAhead(game)) this.vx = 0;
        if (this.st === 0) {
          this.vx = 0; this.state = 'windup'; this.st = Math.round(24 * T); this.anim = 'idle';
          game.audio.play('uppercutCharge');
        }
        break;
      case 'windup':
        if (this.st === 0) {
          // The flailerang flies to where the player stands (500 px at most),
          // then swings back to him.
          this.mace = new Flailerang(this, game.player);
          game.enemyShots.push(this.mace);
          game.audio.play('missile');
          this.state = 'wait4mace'; this.st = Math.round(480 * T);
        }
        break;
      case 'wait4mace':
        // His weak moment: standing still until it comes back.
        if (this.st === 0 || (this.mace && this.mace.caught)) {
          if (this.mace) this.mace.dead = true;
          this.mace = null;
          this.state = 'recover'; this.st = Math.round(20 * T);
        }
        break;
      case 'recover':
        if (this.st === 0) this.walk(game, 'walk1', rand(80, 160) * T);
        break;
      default: break;
    }
  }

  frame(art) {
    const a = art.turtle.anims.schwarz;
    if (this.state === 'wait4mace' || this.state === 'windup' || !this.active) return a.frames[this.state === 'windup' ? 8 : 9];
    return frameAt(a, this.at, a.speed);
  }

  kill(game) {
    if (this.dead) return;
    if (this.mace) this.mace.dead = true;
    super.kill(game);
    // Resurrection: his shell flies off when he is beaten.
    const s = new Shell(this.x, this.y + this.h);
    s.vx = this.facing * -3; s.vy = -6;
    game.enemies.push(s);
  }
}

class Flailerang extends BossShot {
  constructor(owner, target) {
    super('mace', owner.cx - 9, owner.y + 8, 0, 0, { w: 18, h: 18, pierce: true, spin: 0.3, owner });
    const total = 60 * T;
    this.out = total / 2;
    let dx = target.cx - owner.cx; let dy = target.cy - owner.cy;
    const len = Math.hypot(dx, dy);
    if (len > 500) { dx *= 500 / len; dy *= 500 / len; }
    this.vx = dx / this.out; this.vy = dy / this.out;
    this.total = total;
  }

  move() {
    this.x += this.vx; this.y += this.vy;
    const o = this.owner;
    if (this.out > 0) { this.out--; return; }
    // Swing back toward the thrower.
    const tx = (o.cx - 9 - this.x) / (this.total / 2); const ty = (o.y + 8 - this.y) / (this.total / 2);
    this.vx += (tx * 3 - this.vx) * 0.04 * 2; this.vy += (ty * 3 - this.vy) * 0.04 * 2;
    if (this.t > 12 * T + this.total / 2 && overlap(this, o)) this.caught = true;
  }

  draw(r, alpha) {
    // A chain back to the thrower while it flies.
    const o = this.owner; const link = r.art.items.anims.maceLink.frames[0];
    const x = this.prevX + (this.x - this.prevX) * alpha + 9; const y = this.prevY + (this.y - this.prevY) * alpha + 9;
    for (let k = 1; k < 4; k++) r.centred(link, o.cx + (x - o.cx) * (k / 4), o.y + 14 + (y - o.y - 14) * (k / 4));
    super.draw(r, alpha);
  }
}

// ---------------------------------------------------------------- the Queen

// Manual: "To get past her, you have to push her out of the way ... her
// SCREAM can emit enough sonic energy to stop a charging rhino. And watch out
// for falling bricks!" She can't be hurt: hits while she screams make her
// step back; hit her as she teeters at a ledge and she falls. (Resurrection:
// Queen, a solid wall until she goes over.)
export class Queen extends Boss {
  constructor(x, y) {
    super('queen', x, y - 56 + TILE, 36, 56, 1, 4000, 'THE QUEEN!');
    this.facesLeft = true;
    this.facing = -1;
    this.harmless = true;    // touching her doesn't hurt; she just won't let you by
    this.freezable = false;
    this.hits = 0;
    this.step = 0.3 * V;
  }

  wake(game) {
    if (this.active) return true;
    const p = game.player;
    const ahead = (p.cx - this.cx) * this.facing;
    if (p.dead || ahead < -60 || ahead > 300 || Math.abs(p.cy - this.cy) > 120) return false;
    this.active = true;
    game.activeBoss = this;
    game.banner(this.name, 120);
    game.audio.play('rush');
    this.state = 'idle'; this.st = Math.round(260 * T * 0.5);
    return true;
  }

  // She has no health: hits only count while she screams or teeters.
  damage(game, amount) {
    if (!this.active || this.dead) return;
    if (this.state === 'scream' || this.state === 'teeter') { this.hits += amount; this.flash = 4; game.audio.play('hit'); } else game.audio.play('bounce');
  }

  touch(game, p) {
    this.wake(game);
    // A wall up to the ceiling: push the player back out.
    if (this.state === 'gone' || this.state === 'falling') return;
    p.x = this.facing < 0 ? Math.min(p.x, this.x - p.w) : Math.max(p.x, this.x + this.w);
    if (p.vx * this.facing < 0) p.vx = 0;
  }

  update(game) {
    this.begin();
    const p = game.player;
    if (this.state !== 'gone' && this.state !== 'falling') this.wall(game, p);
    if (!this.wake(game)) { this.fall(game); return; }
    if (this.state !== 'gone') this.fall(game, false);
    const back = -this.facing;
    switch (this.state) {
      case 'idle':
        this.anim = 'idle';
        if (this.st === 0) { this.state = 'scream'; this.play('scream'); this.hits = 0; game.audio.play('scream'); game.shake(6); }
        break;
      case 'scream':
        // The scream pushes the player away.
        if (!p.dead && !p.pole) game.level.move(p, this.facing * 1.5 * V, 0, { climb: p.onGround });
        if (this.at >= 40) {
          this.queued = this.hits >= 2;
          this.state = Math.random() < 0.8 ? 'toStomp' : 'toBack';
          this.st = Math.round(rand(65, 85) * T);
          this.anim = 'idle';
        }
        break;
      case 'toStomp':
        if (this.st === 0) { this.state = 'stomp'; this.play('stomp'); }
        break;
      case 'stomp':
        if (this.at === 30) {
          // A brick drops on the player from high above.
          game.audio.play('stompLand'); game.shake(10);
          game.enemyShots.push(new Brick(p.cx + rand(-50, 50) - 8, this.y - 200));
        }
        if (this.at >= 45) { this.state = 'toBack'; this.st = Math.round(rand(70, 80) * T); this.anim = 'idle'; }
        break;
      case 'toBack':
        if (this.st > 0) break;
        if (!this.queued) { this.state = 'idle'; this.st = Math.round(rand(150, 180) * T); break; }
        this.queued = false;
        this.state = 'backstep'; this.play('backstep');
        break;
      case 'backstep':
        this.vx = back * this.step;
        if (this.at >= 40) {
          this.vx = 0;
          if (this.atLedge(game)) { this.state = 'teeter'; this.play('teeter'); this.hits = 0; } else { this.state = 'idle'; this.st = Math.round(rand(160, 200) * T); }
        }
        break;
      case 'teeter':
        if (this.at >= 55) {
          if (this.hits >= 1) {
            // Over she goes.
            this.state = 'falling'; this.play('fall'); this.vx = back * 2.2 * V; this.onGround = false;
            game.audio.play('hurt');
          } else { this.state = 'recover'; this.play('backstep'); }
        }
        break;
      case 'recover':
        this.vx = -back * this.step * 1.3;
        if (this.at >= 40) { this.vx = 0; this.state = 'idle'; this.st = Math.round(rand(150, 180) * T); }
        break;
      case 'falling': {
        // Beaten once she drops well below where she stood (or lands on a
        // spring, which throws her away as in the original).
        const spring = game.props.find((pr) => pr.kind === 'spring' && overlap(pr, this));
        if (spring || this.y > this.origin.y + 3 * TILE) {
          this.state = 'gone'; this.vy = -14; this.vx = back * 3; this.st = Math.round(50 * T);
          if (spring) spring.launch(game, this.cx, this.y + this.h);
        }
        break;
      }
      case 'gone':
        this.x += this.vx; this.y += this.vy; this.vy += 0.4;
        if (this.st === 0) this.kill(game);
        break;
      default: break;
    }
  }

  // Front foot on the ground, back foot over nothing.
  atLedge(game) {
    const L = game.level; const feet = this.y + this.h + 2;
    const front = this.cx + this.facing * 8; const rear = this.cx - this.facing * 8;
    const solid = (x) => L.solidAt(x, feet) || (L.platform && L.platform(Math.floor(x / TILE), Math.floor(feet / TILE)));
    return solid(front) && !solid(rear);
  }

  wall(game, p) {
    if (p.dead || p.pole) return;
    const span = p.y + p.h > this.y - 12 * TILE && p.y < this.y + this.h;
    if (!span) return;
    if (this.facing < 0 && p.x + p.w > this.x + 4 && p.cx < this.cx) { p.x = this.x + 4 - p.w; if (p.vx > 0) p.vx = 0; }
    if (this.facing > 0 && p.x < this.x + this.w - 4 && p.cx > this.cx) { p.x = this.x + this.w - 4; if (p.vx < 0) p.vx = 0; }
  }

  kill(game) {
    if (this.dead) return;
    this.dead = true;
    game.enemiesKilled++;
    game.addScore(this.score, this.cx, this.y);
    game.bossDefeated(this);
  }
}

class Brick extends BossShot {
  constructor(x, y) { super('brick', x, y, 0, 0, { w: 16, h: 14, life: Math.round(50 * T) + 40, spin: 0.15 }); }
  move(game) {
    this.vy = Math.min(this.vy + 0.3, 8);
    this.y += this.vy;
    if (this.vy > 0 && game.level.solidAt(this.x + 8, this.y + this.h)) { this.dead = true; game.effect('poof', this.x + 8, this.y + 8); game.audio.play('break'); }
  }

  sprite(art) { return art.queen.anims.brick.frames[0]; }
}

// ---------------------------------------------------------------- Bilsy

// The fire devil: vanishes in a puff of dust, reappears somewhere near, and
// throws homing fireballs. (Resurrection: Bilsy, 120 health.)
export class Bilsy extends Boss {
  constructor(x, y) {
    super('bilsy', x, y - 60 + TILE, 22, 60, 120, 3000, 'BILSY!');
    this.hidden = true;
  }

  activate(game) { this.teleport(game); }

  teleport(game) {
    const L = game.level;
    for (let i = 0; i < 20; i++) {
      const x = this.origin.x + rand(-320, 320); const y = this.origin.y + rand(-240, 240);
      if (x < 0 || y < 0 || x + this.w > L.pixelW || y + this.h > L.pixelH) continue;
      const box = { x, y, w: this.w, h: this.h };
      if (L.groundBelow && L.groundBelow(box, 0) !== null) continue;
      let clear = true;
      for (let yy = y; yy < y + this.h && clear; yy += 8) for (let xx = x; xx < x + this.w; xx += 6) if (L.solidAt(xx, yy)) { clear = false; break; }
      if (!clear) continue;
      this.x = x; this.y = y; break;
    }
    // Drop to the floor below.
    for (let j = 0; j < 400 && game.level.move(this, 0, 2, {}).bottom === false; j++);
    this.prevX = this.x; this.prevY = this.y;
    this.facePlayer(game);
    this.hidden = false;
    this.state = 'appear'; this.play('dust'); this.harmless = true; this.freezable = false;
    game.audio.play('secret');
  }

  update(game) {
    this.begin();
    if (!this.wake(game)) return;
    switch (this.state) {
      case 'appear':
        // The vanish played backwards.
        if (this.at >= 60) { this.state = 'wait'; this.st = Math.round(30 * T); this.anim = 'idle'; this.harmless = false; this.freezable = true; }
        break;
      case 'wait':
        if (this.st > 0) break;
        if ((game.player.cx < this.cx) === (this.facing < 0)) { this.state = 'throw'; this.play('throw'); } else { this.state = 'wait2'; this.st = Math.round(30 * T); }
        break;
      case 'throw':
        if (this.at === 48) {
          game.audio.play('flame');
          game.enemyShots.push(new Fireball(this.cx + this.facing * 26 - 9, this.y + 10, this.facing));
        }
        if (this.at >= 56) { this.state = 'wait2'; this.st = Math.round(30 * T); this.anim = 'idle'; }
        break;
      case 'wait2':
        if (this.st === 0) { this.state = 'vanish'; this.play('vanish'); this.harmless = true; this.freezable = false; game.audio.play('secret'); }
        break;
      case 'vanish':
        if (this.at >= 60) { this.hidden = true; this.teleport(game); }
        break;
      default: break;
    }
  }

  damage(game, amount) { if (!this.harmless) super.damage(game, amount); }

  frame(art) {
    const a = art.bilsy.anims;
    if (this.state === 'appear') {
      // Dust gathers, then the cape fills in: the vanish run backwards.
      const all = [...a.vanish.frames, ...a.dust.frames];
      return all[Math.max(0, all.length - 1 - Math.floor(this.at / 4))];
    }
    if (this.state === 'vanish') {
      const all = [...a.vanish.frames, ...a.dust.frames];
      return all[Math.min(all.length - 1, Math.floor(this.at / 4))];
    }
    if (this.state === 'throw') {
      const all = [...a.throw.frames, ...a.throw2.frames];
      return all[Math.min(all.length - 1, Math.floor(this.at / 3.5))];
    }
    return frameAt(a.idle, this.t, a.idle.speed);
  }

  draw(r, alpha) { if (this.active && !this.hidden) super.draw(r, alpha); }
}

class Fireball extends BossShot {
  constructor(x, y, dir) {
    super('fireball', x, y, dir * 4 * V, 2 * V, { w: 18, h: 18, life: Math.round(90 * T), solid: true, glowColor: 'rgba(255,140,40,0.6)' });
  }

  move(game) {
    const p = game.player;
    if (!p.dead) {
      // Homing: steer a little toward the player each tick, speed 4.
      const dx = p.cx - (this.x + 9); const dy = p.cy - (this.y + 9); const d = Math.hypot(dx, dy) || 1;
      let vx = this.vx / (4 * V) + (dx / d) * 0.4; let vy = this.vy / (4 * V) + (dy / d) * 0.4;
      const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n;
      this.vx = vx * 4 * V; this.vy = vy * 4 * V;
    }
    this.x += this.vx; this.y += this.vy;
    if (this.t % 2 === 0) game.trail(this.x + 9, this.y + 9, '#ff8a2a');
  }

  sprite(art) { return frameAt(art.bilsy.anims.fireball, this.t, 3); }
}

// ---------------------------------------------------------------- the Robot

// Drops in on a copter, runs at the player and fires spike balls from the
// cannon on its head. (Resurrection: Robot, 100 health.)
export class Robot extends Boss {
  constructor(x, y) {
    super('robot', x, y - 54 + TILE, 30, 54, 100, 2000, 'ROBOT!');
    this.hidden = true;
  }

  activate(game) {
    this.hidden = false;
    // Copters in from up to 300 px above (or from the ceiling).
    const L = game.level; this.y = this.origin.y;
    const free = (y) => [this.x + 2, this.cx, this.x + this.w - 2].every((x) => !L.solidAt(x, y));
    for (let k = 0; k < 75 && free(this.y - 4); k++) this.y -= 4;
    this.prevY = this.y;
    this.state = 'copter'; this.anim = 'copter';
  }

  run(game, state, time) {
    this.state = state; this.st = Math.round(time * T);
    this.facePlayer(game);
    this.vx = this.facing * 3 * V * rand(0.6, 0.9);
    this.anim = 'run';
  }

  update(game) {
    this.begin();
    if (!this.wake(game)) return;
    if (this.state === 'copter') {
      // Copter descent until it touches down.
      this.vy = 1.6;
      const hit = game.level.move(this, 0, this.vy, {});
      this.onGround = hit.bottom;
      if (hit.bottom) { this.state = 'land'; this.play('land'); this.vy = 0; this.onGround = true; }
      return;
    }
    const hit = this.fall(game);
    if (hit.left || hit.right || this.ledgeAhead(game)) { this.vx = 0; }
    switch (this.state) {
      case 'land': if (this.at >= 40) this.run(game, 'run1', rand(20, 40)); break;
      case 'run1': if (this.st === 0) this.run(game, Math.random() < 0.65 ? 'run1' : 'run2', rand(10, 30)); break;
      case 'run2':
        if (this.st === 0) { this.vx = 0; this.state = 'arm'; this.play('arm'); this.shots = 1 + Math.floor(Math.random() * 3); game.audio.play('uppercutCharge'); }
        break;
      case 'arm': if (this.at >= 27) { this.state = 'shoot'; this.play('shoot'); this.fire(game); } break;
      case 'shoot':
        if (this.at >= 18) {
          if (--this.shots > 0) { this.play('shoot'); this.fire(game); } else { this.state = 'ready'; this.st = Math.round(10 * T); this.anim = 'idleRun'; }
        }
        break;
      case 'ready': if (this.st === 0) this.run(game, 'run1', rand(10, 30)); break;
      default: break;
    }
  }

  fire(game) {
    this.facePlayer(game);
    game.audio.play('shoot');
    game.enemyShots.push(new SpikeBall(this.cx - 6, this.y - 6, this.facing));
  }

  damage(game, amount) {
    super.damage(game, amount);
    for (let i = 0; i < 3; i++) game.debris.push({ x: this.cx, y: this.cy, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4, life: 50, spin: Math.random() * 6 });
  }

  frame(art) {
    const a = art.robot.anims;
    if (this.anim === 'idleRun') return a.run.frames[0];
    return super.frame(art);
  }

  draw(r, alpha) { if (this.active && !this.hidden) super.draw(r, alpha); }
}

class SpikeBall extends BossShot {
  constructor(x, y, dir) { super('spikeball', x, y, dir * 8 * V, 0, { w: 12, h: 12, spin: 0.4 }); }
  move(game) {
    this.x += this.vx;
    if (game.level.solidAt(this.x + 6, this.y + 6)) { this.dead = true; game.effect('hitSpark', this.x + 6, this.y + 6); }
  }

  sprite(art) { return art.robot.anims.spikeball.frames[0]; }
}

// ---------------------------------------------------------------- Uterus

// A floating shell that circles above the player behind six orbiting
// shield parts, opening and closing, and spawning crabs while open. It can
// only be hurt open with its shields gone. (Resurrection: Uterus, 50 health.)
export class Uterus extends Boss {
  constructor(x, y) {
    super('uterus', x, y - 30, 40, 60, 50, 3000, 'UTERUS!');
    this.freezable = false;
    this.phase = 0;
    this.hidden = true;
  }

  activate(game) {
    this.hidden = false;
    this.last = { x: this.origin.x, y: this.origin.y };
    this.state = 'open'; this.anim = 'open'; this.st = Math.round(240 * T);
    this.crabIn = Math.round(500 * T);
    this.shields = Array.from({ length: 6 }, (_, i) => new ShieldPart(this, (Math.PI * 2 * i) / 6));
    for (const s of this.shields) game.enemies.push(s);
  }

  reset() {
    super.reset();
    this.hidden = true;
    for (const s of this.shields || []) s.dead = true;
    this.shields = [];
  }

  get shielded() { return this.state !== 'open' || (this.shields || []).some((s) => !s.dead); }

  update(game) {
    this.begin();
    if (!this.wake(game)) return;
    switch (this.state) {
      case 'open':
        if (this.st === 0) { this.state = 'closing'; this.play('closing'); }
        if (--this.crabIn <= 0) {
          const c = new Crab(this.cx - 16, this.y + this.h);
          c.vx = rand(-2, 2) || 1;
          game.enemies.push(c);
          this.crabIn = Math.round((this.shields.some((s) => !s.dead) ? rand(160, 220) : rand(120, 200)) * T);
        }
        break;
      case 'closing': if (this.at >= 32) { this.state = 'closed'; this.anim = 'closed'; this.st = Math.round(280 * T); } break;
      case 'closed': if (this.st === 0) { this.state = 'opening'; this.play('opening'); } break;
      case 'opening': if (this.at >= 32) { this.state = 'open'; this.anim = 'open'; this.st = Math.round(280 * T); } break;
      default: break;
    }
    // Drift toward a point above the player, circling around it.
    const p = game.player;
    const tx = p.cx - this.w / 2; const ty = p.cy - 80 - this.h / 2;
    const dx = tx - this.last.x; const dy = ty - this.last.y; const d = Math.hypot(dx, dy);
    if (d > 40) {
      const mult = (this.shields.some((s) => !s.dead) ? 0.8 : 2) * V;
      this.last.x += (dx / d) * mult; this.last.y += (dy / d) * mult;
    }
    this.phase += 0.02 * V;
    this.x = this.last.x + Math.cos(this.phase) * 50;
    this.y = this.last.y + Math.sin(this.phase) * 50;
  }

  kill(game) {
    if (this.dead) return;
    for (const s of this.shields) if (!s.dead) s.kill(game);
    super.kill(game);
    game.effect('explosion', this.cx, this.cy, 4);
  }

  draw(r, alpha) { if (this.active && !this.hidden) super.draw(r, alpha); }
}

class ShieldPart extends Enemy {
  constructor(owner, phase) {
    super('shield', owner.x, owner.y, 14, 14, 3, 200);
    Object.assign(this, { owner, phase, fallTime: 0, freezable: false, counted: true });
  }

  update(game) {
    this.begin();
    if (this.owner.dead) { this.kill(game); return; }
    if (this.fallTime > 0) {
      // Knocked loose: it drops, then flies back into orbit.
      this.fallTime--;
      this.vy = Math.min(this.vy + 0.15, 4);
      game.level.move(this, 0, this.vy, {});
      return;
    }
    const a = this.owner.phase + this.phase;
    this.x = this.owner.cx + Math.cos(a) * 50 - this.w / 2;
    this.y = this.owner.cy + Math.sin(a) * 50 - this.h / 2;
  }

  damage(game, amount) {
    this.fallTime = Math.round(400 * T); this.vy = 0;
    super.damage(game, amount);
  }

  sprite(art) { return frameAt(art.uterus.anims.shield, this.t, 4); }
}

// Uterus's crabs: walkers.
class Crab extends Enemy {
  constructor(x, feet) {
    super('crab', x, feet - 22, 30, 22, 1, 100);
    this.color = '#ff6a8a';
    this.counted = true;
  }

  update(game) { this.begin(); this.walk(game, 1); }
  sprite(art) { return frameAt(art.uterus.anims.crab, this.t, 5); }
}

// JJ2 boss events -> boss classes (others stay ordinary enemies).
export const JJ2_BOSSES = { 101: Schwartzenguard, 151: Queen, 114: Bilsy, 202: Robot, 195: Uterus };
// Level characters for our own levels.
export const BOSS_CHARS = { Z: Queen, V: Schwartzenguard, B: Bilsy, R: Robot, O: Uterus };
