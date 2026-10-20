// Bosses (manual, "The Bosses"): the Queen and Schwartzenguard, plus Bilsy,
// the Robot, Uterus, Devan Shell, Bubba, Bolly, the Rocket Turtle and Tweedle
// from the original's levels. Each guards the exit: the
// exit sign stays locked until it is beaten. Behaviour follows Jazz2
// Resurrection's reimplementation (Actors/Enemies/Bosses), converted from its
// 60 fps frames to our 70 Hz ticks.

import { TILE } from './config.js';
import { Enemy, EnemyShot, overlap, Shell } from './entities.js';
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
    // Woken by a JJ2 boss area: beating this boss ends the level.
    this.called = game.bossCall;
    game.activeBoss = this;
    game.bossCall = false;
    game.banner(this.name, 120);
    game.audio.play('rush');
    game.voice('jazzWatchOut');
    this.activate(game);
    return true;
  }

  activate() {}

  // The player died: the fight starts over, as in the original.
  reset() {
    this.x = this.origin.x; this.y = this.origin.y; this.prevX = this.x; this.prevY = this.y;
    this.vx = 0; this.vy = 0; this.frozen = 0;
    this.active = false; this.state = 'wait'; this.st = 0; this.anim = 'idle'; this.hp = this.maxHp; this.hitCool = 0;
  }

  // Play `anim` from its start.
  play(anim) { this.anim = anim; this.at = 0; }

  begin() {
    super.begin();
    this.at++;
    if (this.st > 0) this.st = Math.max(0, this.st - 1);
    if (this.hitCool > 0) this.hitCool--;
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
      // One hit per contact: an uppercut overlapping for several ticks counts once.
      if (!this.hitCool) { this.damage(game, p.stomping || p.special > 0 ? 4 : 2); this.hitCool = 20; }
      if (p.stomping) { p.stompBounce(); p.y = Math.min(p.y, this.y - p.h); game.audio.play('stomp'); } else if (fromAbove) { p.bounce(input.held('jump')); p.y = this.y - p.h; game.audio.play('stomp'); }
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

  reset() { super.reset(); if (this.mace) this.mace.dead = true; this.mace = null; this.facing = -1; }

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
          game.audio.play('mace');
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

  reset() { super.reset(); this.facing = -1; this.hits = 0; }

  wake(game) {
    if (this.active) return true;
    const p = game.player;
    // Only from in front: she backsteps away from the way she faces, towards
    // her ledge, so turning her round would make her unbeatable.
    const ahead = (p.cx - this.cx) * this.facing;
    if (p.dead || ahead < -60 || ahead > 300 || Math.abs(p.cy - this.cy) > 120) return false;
    this.active = true;
    this.called = game.bossCall;
    game.activeBoss = this;
    game.bossCall = false;
    game.banner(this.name, 120);
    game.audio.play('rush');
    game.voice('jazzWatchOut');
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
        if (!p.dead && !p.pole) { game.level.move(p, this.facing * 1.5 * V, 0, { climb: p.onGround }); p.dizzy = 12; }
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
          // From up to 200 px above, but under the ceiling: a brick made
          // inside a low ceiling would break before it fell.
          const bx = p.cx + rand(-50, 50) - 8;
          let by = Math.min(this.y, p.y) - 200;
          for (let y = p.y - 8; y > by; y -= 4) {
            if (game.level.solidAt(bx + 8, y)) { by = y + 6; break; }
          }
          game.enemyShots.push(new Brick(bx, by));
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
        // Landing on a floor close below counts too, so she never stalls.
        if (spring || this.y > this.origin.y + 3 * TILE || (this.onGround && this.at > 20)) {
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

  reset() { super.reset(); this.hidden = true; this.harmless = false; this.freezable = true; }

  activate(game) { this.teleport(game); }

  teleport(game) {
    const L = game.level;
    for (let i = 0; i < 20; i++) {
      const x = this.origin.x + rand(-320, 320); const y = this.origin.y + rand(-240, 240);
      if (x < 0 || y < 0 || x + this.w > L.pixelW || y + this.h > L.pixelH) continue;
      const box = { x, y, w: this.w, h: this.h };
      if (L.groundBelow && (L.groundBelow(box, 0) !== null || L.groundBelow(box, 400) === null)) continue;
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
    game.audio.play('bilsyAppear');
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
          game.audio.play('bilsyFire');
          game.enemyShots.push(new Fireball(this.cx + this.facing * 26 - 9, this.y + 10, this.facing, this.xmas));
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

// The Christmas Chronicles' Bilsy (event 251, Tinsel Town's boss): the same
// fight in a winter coat, from Anims.j2a (assets/jj2_enemies).
export class XmasBilsy extends Bilsy {
  constructor(x, y) { super(x, y); this.xmas = true; }

  frame(art) {
    const a = art.jj2e.anims;
    // Appear, vanish and throw each take as long as Bilsy's own (60, 60, 56 ticks).
    const run = (anim, ticks) => anim.frames[Math.min(anim.frames.length - 1, Math.floor((this.at / ticks) * anim.frames.length))];
    if (this.state === 'appear') return run(a.bilsyXmasAppear, 60);
    if (this.state === 'vanish') return run(a.bilsyXmasVanish, 60);
    if (this.state === 'throw') return run(a.bilsyXmasThrow, 56);
    return frameAt(a.bilsyXmasIdle, this.t, a.bilsyXmasIdle.speed);
  }
}

class Fireball extends BossShot {
  constructor(x, y, dir, xmas = false) {
    super('fireball', x, y, dir * 4 * V, 2 * V, { w: 18, h: 18, life: Math.round(90 * T), solid: true, glowColor: 'rgba(255,140,40,0.6)', xmas });
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

  sprite(art) { return frameAt(this.xmas ? art.jj2e.anims.bilsyXmasFireball : art.bilsy.anims.fireball, this.t, 3); }
}

// ---------------------------------------------------------------- the Robot

// Drops in on a copter, runs at the player and fires spike balls from the
// cannon on its head. (Resurrection: Robot, 100 health.)
export class Robot extends Boss {
  constructor(x, y) {
    super('robot', x, y - 54 + TILE, 30, 54, 100, 2000, 'ROBOT!');
    this.hidden = true;
  }

  reset() { super.reset(); this.hidden = true; }

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
    game.audio.play('robotGun');
    game.enemyShots.push(new SpikeBall(this.cx - 6, this.y - 6, this.facing));
  }

  damage(game, amount) {
    if (!this.active || this.dead) return;
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
      if (this.y > game.level.pixelH) this.fallTime = 0;
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

// ---------------------------------------------------------------- Devan Shell

// Devan himself (JJ2 event 200): runs at you, leaps, and fires his blaster
// along the floor. Beaten down to half, he turns into the demon he is in the
// original: he flies at you and spits fireballs. Sprites: Levels/Devan
// Shell.png (assets/devan) on foot, Anims.j2a (assets/jj2_enemies) as a demon.
export class Devan extends Boss {
  constructor(x, y) {
    super('devan', x, y - 56 + TILE, 26, 56, 120, 10000, 'DEVAN SHELL!');
    this.facing = -1;
    this.demon = false;
  }

  reset() {
    if (this.demon) { this.w = 26; this.h = 56; }
    super.reset();
    this.demon = false; this.shielded = false; this.facing = -1;
  }

  activate(game) { game.audio.play('devanLaugh'); this.think(game); }

  // Pick the next move on foot.
  think(game) {
    this.facePlayer(game);
    const far = Math.abs(game.player.cx - this.cx) > 160;
    const r = Math.random();
    if (this.onGround && r < 0.2) {
      // Leap at the player.
      this.state = 'jump'; this.play('jump');
      this.vy = -5.2; this.vx = this.facing * 2 * V; this.onGround = false;
      game.audio.play('spring');
    } else if (r < 0.32) {
      this.state = 'bomb'; this.play('bomb'); this.vx = 0;
    } else if (far && r < 0.7) {
      this.state = 'run'; this.anim = 'run'; this.st = Math.round(rand(30, 60) * T);
      this.vx = this.facing * 2.2 * V;
    } else {
      this.state = 'aim'; this.play('aim'); this.vx = 0;
      this.shots = 1 + Math.floor(Math.random() * 2);
      game.audio.play('uppercutCharge');
    }
  }

  update(game) {
    this.begin();
    if (!this.wake(game)) { this.fall(game); return; }
    if (this.demon) { this.fly(game); return; }
    const hit = this.fall(game);
    switch (this.state) {
      case 'run':
        if (hit.left || hit.right || this.ledgeAhead(game)) { this.vx = 0; this.st = 0; }
        if (this.st === 0) this.idle(game, 12);
        break;
      case 'jump':
        if (this.onGround && this.at > 4) { this.vx = 0; game.shake(4); game.audio.play('land'); this.idle(game, 16); }
        break;
      case 'aim': if (this.at >= 16) { this.state = 'shoot'; this.play('shoot'); this.fire(game); } break;
      case 'shoot':
        if (this.at >= 14) {
          if (--this.shots > 0) { this.play('shoot'); this.fire(game); } else this.idle(game, 30);
        }
        break;
      case 'bomb':
        if (this.at === 40) {
          // Lobbed to land near the player.
          const dx = game.player.cx - this.cx;
          game.enemyShots.push(new EnemyShot('bomb', this.cx + this.facing * 14, this.y + 16, Math.max(-5, Math.min(5, dx / 40)), -5));
          game.audio.play('throw');
        }
        if (this.at >= 55) this.idle(game, 14);
        break;
      case 'transform':
        // Stretching into the demon (76 ticks), then the wings (42).
        if (this.at === 76) { this.state = 'transformEnd'; this.at = 0; game.audio.play('devanLaugh'); }
        break;
      case 'transformEnd':
        if (this.at >= 42) {
          // The demon is bigger: keep the feet where they were.
          const feet = this.y + this.h; const cx = this.cx;
          Object.assign(this, { demon: true, w: 56, h: 64, shielded: false });
          this.x = cx - this.w / 2; this.y = feet - this.h; this.prevX = this.x; this.prevY = this.y;
          game.banner('DEVAN IS A DEMON!', 90);
          this.state = 'hover'; this.st = Math.round(90 * T);
        }
        break;
      case 'idle': if (this.st === 0) this.think(game); break;
      default: break;
    }
  }

  // The demon: hovers off to one side of the player, above, and spits a
  // fireball now and then.
  fly(game) {
    const p = game.player;
    this.facePlayer(game);
    const side = this.cx < p.cx ? -1 : 1;
    const tx = p.cx + side * 130 - this.w / 2; const ty = p.y - 34 + Math.sin(this.t / 30) * 30;
    const dx = tx - this.x; const dy = ty - this.y; const d = Math.hypot(dx, dy);
    const sp = this.state === 'spew' ? 0.6 * V : 1.8 * V;
    if (d > 4) { this.x += (dx / d) * Math.min(sp, d); this.y += (dy / d) * Math.min(sp, d); }
    if (this.state === 'hover' && this.st === 0) { this.state = 'spew'; this.play('spew'); }
    if (this.state === 'spew') {
      if (this.at === 42) {
        game.audio.play('devanShoot');
        game.enemyShots.push(new DemonFireball(this.cx + this.facing * 30, this.y + 34, p));
      }
      if (this.at >= 77) { this.state = 'hover'; this.st = Math.round(rand(70, 120) * T); }
    }
  }

  idle(game, time) { this.state = 'idle'; this.anim = 'idle'; this.vx = 0; this.st = Math.round(time * T); this.facePlayer(game); }

  fire(game) {
    this.facePlayer(game);
    game.audio.play('devanShoot');
    game.enemyShots.push(new DevanBlast(this.cx + this.facing * 30, this.y + 24, this.facing, 0));
  }

  damage(game, amount) {
    if (!this.active || this.dead) return;
    super.damage(game, amount);
    if (!this.demon && !this.dead && this.hp <= this.maxHp / 2 && !this.state.startsWith('transform')) {
      // Untouchable while he changes.
      this.state = 'transform'; this.at = 0; this.vx = 0; this.shielded = true;
      game.audio.play('scream'); game.flash('#ff5a3a', 6);
    }
  }

  frame(art) {
    const a = art.devan.anims; const j = art.jj2e.anims;
    if (this.state === 'transform') return frameAt(j.devanTransform, this.at, j.devanTransform.speed);
    if (this.state === 'transformEnd') return frameAt(j.devanTransformEnd, this.at, j.devanTransformEnd.speed);
    if (this.demon) return this.state === 'spew' ? frameAt(j.devanSpew, this.at, 7) : frameAt(j.devanDemon, this.t, 5);
    if (this.state === 'jump') return frameAt(a.jump, Math.min(this.at, 200), 3 + (this.vy > 0 ? 1 : 0));
    return super.frame(art);
  }

  draw(r, alpha) {
    if (this.demon && this.t % 20 < 10) r.glow(this.cx, this.cy, 50, 'rgba(255,90,40,0.3)');
    super.draw(r, alpha);
  }
}

// The demon's fireball: flies at the player, steering a little.
class DemonFireball extends BossShot {
  constructor(x, y, target) {
    const dx = target.cx - x; const dy = target.cy - y; const d = Math.hypot(dx, dy) || 1;
    super('demonFire', x - 12, y - 10, (dx / d) * 3.5 * V, (dy / d) * 3.5 * V, { w: 24, h: 20, life: Math.round(200 * T), glowColor: 'rgba(255,120,40,0.6)', target });
  }

  move(game) {
    const p = this.target;
    if (p && !p.dead && this.t < 90) {
      const dx = p.cx - (this.x + 12); const dy = p.cy - (this.y + 10); const d = Math.hypot(dx, dy) || 1;
      const sp = Math.hypot(this.vx, this.vy);
      this.vx += (dx / d) * 0.08; this.vy += (dy / d) * 0.08;
      const n = Math.hypot(this.vx, this.vy) || 1; this.vx *= sp / n; this.vy *= sp / n;
    }
    this.x += this.vx; this.y += this.vy;
    if (this.t % 3 === 0) game.trail(this.x + 12, this.y + 10, '#ff8a2a');
  }

  sprite(art) { return frameAt(art.jj2e.anims.devanFireball, this.t, 4); }
}

class DevanBlast extends BossShot {
  constructor(x, y, dir, vy) { super('blast', x - 14, y - 8, dir * 6 * V, vy * V, { w: 28, h: 16, life: Math.round(140 * T), solid: false, glowColor: 'rgba(120,200,255,0.5)' }); }
  move(game) {
    this.x += this.vx; this.y += this.vy;
    if (game.level.solidAt(this.x + this.w / 2, this.y + this.h / 2)) { this.dead = true; game.effect('hitSpark', this.x + this.w / 2, this.y + this.h / 2); }
  }

  sprite(art) { return frameAt(art.devan.anims.blast, this.t, 3); }
}

// ---------------------------------------------------------------- Bubba

// Bubba (JJ2 event 199): hops after you, spits arcing fireballs, and now and
// then spins into a tornado that tears across the floor. Anims.j2a sprites.
export class Bubba extends Boss {
  constructor(x, y) {
    super('bubba', x, y - 44 + TILE, 30, 44, 90, 6000, 'BUBBA!');
    this.facing = -1;
    this.hops = 0;
  }

  activate(game) { this.rest(game, 30); }

  rest(game, time) { this.state = 'rest'; this.vx = 0; this.st = Math.round(time * T); this.facePlayer(game); }

  update(game) {
    this.begin();
    const hit = this.fall(game);
    if (!this.wake(game)) return;
    switch (this.state) {
      case 'rest': {
        if (this.st > 0) break;
        const r = Math.random();
        if (this.hops >= 2 && r < 0.3) {
          this.state = 'tornado'; this.play('tornado'); this.st = Math.round(110 * T); this.hops = 0;
          this.vx = this.facing * 3.6 * V; game.audio.play('bubbaTornado');
        } else if (r < 0.6) {
          this.state = 'spew'; this.play('spew');
        } else {
          this.state = 'hop'; this.play('hop'); this.hops++;
          this.vy = -5; this.vx = this.facing * 2.4 * V; this.onGround = false; game.audio.play('bubbaHop');
        }
        break;
      }
      case 'hop':
        if (this.onGround && this.at > 4) { this.vx = 0; game.shake(3); this.rest(game, 18); }
        break;
      case 'spew':
        if (this.at === 56) {
          game.audio.play('bubbaSneeze');
          const dx = game.player.cx - this.cx;
          game.enemyShots.push(new BubbaFireball(this.cx + this.facing * 16, this.y + 14, Math.max(-5, Math.min(5, dx / 45)) || this.facing * 2));
        }
        if (this.at >= 110) this.rest(game, 24);
        break;
      case 'tornado':
        if (hit.left || hit.right || this.ledgeAhead(game)) { this.vx = -this.vx; this.facing = Math.sign(this.vx); }
        if (this.t % 4 === 0) game.dust(this.cx, this.y + this.h, 1);
        if (this.st === 0) this.rest(game, 40);
        break;
      default: break;
    }
  }

  frame(art) {
    const a = art.jj2e.anims;
    if (this.state === 'hop') return this.vy < 0 ? frameAt(a.bubbaJump, this.at, 5) : frameAt(a.bubbaFall, this.at, 5);
    if (this.state === 'spew') return frameAt(a.bubbaFire, this.at, 7);
    if (this.state === 'tornado') return frameAt(a.bubbaTornado, this.at, 3);
    return frameAt(a.bubba, this.t, 8);
  }
}

class BubbaFireball extends BossShot {
  constructor(x, y, vx) { super('bubbaFire', x - 14, y - 7, vx, -3.5, { w: 28, h: 14, life: Math.round(160 * T), glowColor: 'rgba(255,140,40,0.55)' }); }
  move(game) {
    this.vy = Math.min(this.vy + 0.14, 6);
    this.x += this.vx; this.y += this.vy;
    if (game.level.solidAt(this.x + 14, this.y + 7)) { this.dead = true; game.effect('explosion', this.x + 14, this.y + 7); }
  }

  sprite(art) { return frameAt(art.jj2e.anims.bubbaFireball, this.t, 4); }
}

// ---------------------------------------------------------------- Bolly

// Bolly (JJ2 event 235): an armoured flying tank that drifts above you while
// its turret fires homing rockets. Anims.j2a sprites.
export class Bolly extends Boss {
  constructor(x, y) {
    super('bolly', x, y - 40, 70, 40, 100, 6000, 'BOLLY!');
    this.freezable = false;
  }

  activate() { this.state = 'fly'; this.last = { x: this.x, y: this.y }; this.st = Math.round(90 * T); }

  update(game) {
    this.begin();
    if (!this.wake(game)) return;
    const p = game.player;
    const dx = p.cx - this.w / 2 - this.last.x; const dy = p.y - 110 - this.last.y; const d = Math.hypot(dx, dy);
    if (d > 30) { this.last.x += (dx / d) * 1.3 * V; this.last.y += (dy / d) * 1.3 * V; }
    this.x = this.last.x + Math.sin(this.t / 40) * 40;
    this.y = this.last.y + Math.sin(this.t / 23) * 10;
    this.facePlayer(game);
    if (this.st === 0) {
      game.audio.play('bollyMissile');
      game.enemyShots.push(new BollyRocket(this.cx, this.y - 6, p));
      this.st = Math.round(rand(90, 140) * T);
    }
  }

  frame(art) { return frameAt(art.jj2e.anims.bolly, this.t, 4); }

  draw(r, alpha) {
    if (!this.active) { super.draw(r, alpha); return; }
    super.draw(r, alpha);
    // The dome and the turret on top.
    const x = this.prevX + (this.x - this.prevX) * alpha + this.w / 2;
    const y = this.prevY + (this.y - this.prevY) * alpha;
    const a = r.art.jj2e.anims;
    r.sprite(frameAt(a.bollyTop, this.t, 5), x, y + 6, this.facing > 0);
    r.centred(frameAt(a.bollyTurret, this.t, 5), x, y - 6, this.facing > 0);
  }
}

class BollyRocket extends BossShot {
  constructor(x, y, target) { super('bollyRocket', x - 15, y - 6, 0, -2.5, { w: 30, h: 13, life: Math.round(260 * T), solid: false, target }); }
  move(game) {
    // Climbs out, then homes in on the player at 3 px/tick.
    const p = this.target;
    if (this.t > 20 && p && !p.dead) {
      const dx = p.cx - (this.x + 15); const dy = p.cy - (this.y + 6); const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * 0.12; this.vy += (dy / d) * 0.12;
      const n = Math.hypot(this.vx, this.vy) || 1; if (n > 3 * V) { this.vx *= (3 * V) / n; this.vy *= (3 * V) / n; }
    }
    this.x += this.vx; this.y += this.vy;
    if (this.t % 3 === 0) game.trail(this.x + 15 - Math.sign(this.vx) * 12, this.y + 6, '#c8c8c8');
    if (game.level.solidAt(this.x + 15, this.y + 6)) { this.dead = true; game.effect('explosion', this.x + 15, this.y + 6); }
  }

  sprite(art) { return frameAt(art.jj2e.anims.bollyRocket, this.t, 3); }
  draw(r, alpha) {
    const x = this.prevX + (this.x - this.prevX) * alpha + 15; const y = this.prevY + (this.y - this.prevY) * alpha + 6;
    r.ctx.save(); r.ctx.translate(Math.round(x), Math.round(y)); r.ctx.rotate(Math.atan2(this.vy, this.vx));
    const f = this.sprite(r.art); r.ctx.drawImage(f.right, -f.w / 2, -f.h / 2); r.ctx.restore();
  }
}

// ---------------------------------------------------------------- the Rocket Turtle

// The turtle on a rocket (JJ2 event 198): dives to your height, swoops past
// level with you (the moment to shoot it), and climbs away, over and over.
// Anims.j2a sprites.
export class RocketTurtle extends Boss {
  constructor(x, y) {
    super('turtleRocket', x, y - 40, 40, 40, 40, 4000, 'ROCKET TURTLE!');
    this.freezable = false;
  }

  activate() { this.state = 'climb'; this.st = Math.round(40 * T); }

  update(game) {
    this.begin();
    if (!this.wake(game)) return;
    const p = game.player; const L = game.level;
    if (this.state === 'climb' && (this.st === 0 || this.cy < p.cy - 170)) {
      // Dive at where the player is now.
      this.state = 'dive'; this.facePlayer(game);
      const dx = p.cx - this.cx; const dy = Math.max(40, p.cy - this.cy); const d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * 4.2 * V; this.vy = (dy / d) * 4.2 * V; this.st = Math.round(90 * T);
      game.audio.play('missile');
    } else if (this.state === 'dive' && (this.cy >= p.cy - 4 || this.st === 0)) {
      // Level with the player: a flat pass.
      this.state = 'swoop'; this.vy = 0; this.vx = this.facing * 3 * V; this.st = Math.round(60 * T);
    } else if (this.state === 'swoop' && this.st === 0) {
      this.state = 'climb'; this.vy = -3 * V; this.st = Math.round(rand(50, 80) * T);
    }
    if (this.state === 'swoop' && (L.solidAt(this.x + (this.vx > 0 ? this.w : 0), this.cy))) { this.vx = -this.vx; this.facing = Math.sign(this.vx); }
    this.x = Math.max(0, Math.min(L.pixelW - this.w, this.x + this.vx));
    this.y = Math.max(0, Math.min(L.pixelH - this.h, this.y + this.vy));
    if (this.state === 'dive' && L.solidAt(this.cx, this.y + this.h)) this.st = 0;
    if (this.t % 2 === 0) game.trail(this.cx - this.facing * 18, this.cy + 10, '#ffb02e');
  }

  frame(art) {
    const a = art.jj2e.anims;
    return frameAt(this.vy > 0 || this.state === 'swoop' ? a.turtleRocket : a.turtleRocketUp, this.t, 4);
  }
}

// ---------------------------------------------------------------- Tweedle

// Tweedle (JJ2 event 241): strolls up, pulls you in with a horseshoe magnet,
// fires your own blaster at you (Jazz's or Spaz's, whichever you are), and
// cartwheels across the floor. Every 25 damage leaves him dizzy for a moment;
// at half health he shoots more and cartwheels faster. Anims.j2a sprites.
export class Tweedle extends Boss {
  constructor(x, y) {
    super('tweedle', x, y - 60 + TILE, 30, 60, 100, 8000, 'TWEEDLE!');
    this.facing = -1;
    this.dizzyAt = 75;
  }

  reset() { super.reset(); this.facing = -1; this.dizzyAt = 75; }

  activate(game) { this.walk(game); }

  get angry() { return this.hp <= this.maxHp / 2; }

  walk(game) { this.state = 'walk'; this.facePlayer(game); this.vx = this.facing * 1.4 * V; this.st = Math.round(rand(50, 90) * T); }

  update(game) {
    this.begin();
    const hit = this.fall(game);
    if (!this.wake(game)) return;
    const p = game.player;
    switch (this.state) {
      case 'walk':
        if (hit.left || hit.right || this.ledgeAhead(game)) { this.vx = -this.vx; this.facing = Math.sign(this.vx); }
        if (this.st === 0) {
          this.vx = 0; this.facePlayer(game);
          const r = Math.random();
          if (r < 0.34) { this.state = 'magnetStart'; this.play('magnetStart'); }
          else if (r < 0.7) { this.state = 'shoot'; this.play('shoot'); this.spazGun = p.character === 'spaz'; }
          else { this.state = 'spin'; this.play('spin'); this.vx = this.facing * (this.angry ? 5 : 4) * V; this.st = Math.round(80 * T); game.audio.play('bubbaTornado'); }
        }
        break;
      case 'magnetStart': if (this.at >= 60) { this.state = 'magnet'; this.st = Math.round(130 * T); game.audio.play('uppercutCharge'); } break;
      case 'magnet':
        // The pull: the player slides toward him whatever they press.
        if (!p.dead && Math.abs(p.cy - this.cy) < 80) {
          const dir = Math.sign(this.cx - p.cx);
          game.level.move(p, dir * 1.3, 0, { climb: p.onGround });
          if (this.t % 6 === 0) game.trail(this.cx + this.facing * 26, this.y + 26, '#ff5a8a');
        }
        if (this.st === 0) { this.state = 'magnetEnd'; this.play('magnetEnd'); }
        break;
      case 'magnetEnd': if (this.at >= 18) this.walk(game); break;
      case 'shoot':
        // The blaster goes off on frame 11 (and again, angry).
        if (this.at === 66 || (this.angry && this.at === 80)) this.fire(game);
        if (this.at >= 90) this.walk(game);
        break;
      case 'spin':
        if (hit.left || hit.right || this.ledgeAhead(game)) { this.vx = -this.vx; this.facing = Math.sign(this.vx); }
        if (this.t % 4 === 0) game.dust(this.cx, this.y + this.h, 1);
        if (this.st === 0) { this.vx = 0; this.walk(game); }
        break;
      case 'dizzy': if (this.st === 0) this.walk(game); break;
      default: break;
    }
  }

  fire(game) {
    this.facePlayer(game);
    game.audio.play(game.player.character === 'spaz' ? 'shootSpaz' : 'shoot');
    const a = Math.atan2(game.player.cy - (this.y + 28), game.player.cx - this.cx);
    const fan = this.angry ? [-0.25, 0, 0.25] : [-0.12, 0.12];
    for (const da of fan) game.enemyShots.push(new TweedleShot(this.cx + this.facing * 26, this.y + 28, a + da));
  }

  damage(game, amount) {
    if (!this.active || this.dead) return;
    super.damage(game, amount);
    if (!this.dead && this.hp <= this.dizzyAt) {
      this.dizzyAt -= 25;
      this.state = 'dizzy'; this.play('hurt'); this.vx = 0; this.st = Math.round(70 * T);
      game.audio.play('scream');
    }
  }

  frame(art) {
    const a = art.jj2e.anims;
    switch (this.state) {
      case 'walk': return frameAt(a.tweedle, this.t, 5);
      case 'magnetStart': return frameAt(a.tweedleMagnetStart, this.at, 6);
      case 'magnet': return frameAt(a.tweedleMagnet, this.t, 4);
      case 'magnetEnd': return frameAt(a.tweedleMagnetEnd, this.at, 6);
      case 'shoot': return frameAt(this.spazGun ? a.tweedleShootSpaz : a.tweedleShootJazz, this.at, 6);
      case 'spin': return frameAt(a.tweedleSpin, this.t, 3);
      case 'dizzy': return frameAt(a.tweedleHurt, this.at, 8);
      default: return frameAt(a.tweedleIdle, this.t, 6);
    }
  }
}

// Tweedle's shots: the blaster's, flying straight.
class TweedleShot extends BossShot {
  constructor(x, y, angle) { super('tweedleShot', x - 8, y - 6, Math.cos(angle) * 6 * V, Math.sin(angle) * 6 * V, { w: 16, h: 12, life: Math.round(120 * T), solid: false, glowColor: 'rgba(255,240,160,0.5)' }); }
  move(game) {
    this.x += this.vx; this.y += this.vy;
    if (game.level.solidAt(this.x + 8, this.y + 6)) { this.dead = true; game.effect('hitSpark', this.x + 8, this.y + 6); }
  }

  sprite(art) { return frameAt(art.fx.anims.blaster, this.t, 3); }
}

// JJ2 boss events -> boss classes (others stay ordinary enemies).
export const JJ2_BOSSES = { 101: Schwartzenguard, 151: Queen, 114: Bilsy, 202: Robot, 195: Uterus, 200: Devan, 201: Robot, 199: Bubba, 235: Bolly, 198: RocketTurtle, 241: Tweedle, 251: XmasBilsy };
// Level characters for our own levels (a, e, j: only made by JJ2 levels).
export const BOSS_CHARS = { Z: Queen, V: Schwartzenguard, B: Bilsy, R: Robot, O: Uterus, D: Devan, a: Bubba, e: Bolly, j: RocketTurtle, l: Tweedle, bilsyXmas: XmasBilsy };
