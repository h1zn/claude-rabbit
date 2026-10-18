// The nine JJ2 weapons (manual, "Weapons"): what each one fires, its ammo,
// power-ups, and the blasts of missiles and TNT. The blaster never runs out;
// the others use ammo from pickups (+3), ammo crates (+15) and power-up
// monitors (+25, and the powered-up shot). Measured values are in SPEC.md
// ("Weapons"); the rest is tuned to the manual's descriptions.

import { PHYS, PLAYER, TILE } from './config.js';
import { overlap } from './entities.js';

export const AMMO_MAX = 99;
export const TNT = 7;

// shot: projectile animation in the effects sheet (powered: shot + 'P');
// icon: HUD and pickup animation in the items sheet; crate: ammo crate frame.
export const WEAPONS = [
  null,
  { name: 'BLASTER', shot: 'blaster', shotP: 'blasterPower', icon: 'ammoBlasterJazz', iconP: 'ammoBlasterJazzP', mon: 'monBlasterJazz', glow: '255,240,160' },
  { name: 'BOUNCER', shot: 'bouncer', shotP: 'bouncerP', icon: 'ammoBouncer', iconP: 'ammoBouncerP', mon: 'monBouncer', crate: 0, glow: '120,170,255' },
  { name: 'FROSTBITER', shot: 'ice', shotP: 'iceP', icon: 'ammoIce', iconP: 'ammoIceP', mon: 'monIce', crate: 1, glow: '160,230,255' },
  { name: 'MISSILES', shot: 'seeker', shotP: 'seekerP', icon: 'ammoSeeker', iconP: 'ammoSeekerP', mon: 'monSeeker', crate: 2, glow: '255,200,120' },
  { name: 'RF MISSILES', shot: 'rf', shotP: 'rfP', icon: 'ammoRF', iconP: 'ammoRFP', mon: 'monRF', crate: 3, glow: '255,160,90' },
  { name: 'TOASTER', shot: 'toaster', shotP: 'toasterP', icon: 'ammoToaster', iconP: 'ammoToasterP', mon: 'monToaster', crate: 4, glow: '255,140,40' },
  { name: 'TNT', icon: 'ammoTNT', iconP: 'ammoTNT', crate: 5, glow: '255,90,60' },
  { name: 'PEPPER SPRAY', shot: 'pepper', shotP: 'pepperP', icon: 'ammoPepper', iconP: 'ammoPepper', mon: 'monPepper', glow: '255,170,90' },
  { name: 'ELECTRO-BLASTER', shot: 'electro', shotP: 'electroP', icon: 'ammoElectro', iconP: 'ammoElectroP', mon: 'monElectro', glow: '150,200,255' },
];

// Weapons an ammo crate with no weapon of its own (gun crates, our 'A'
// crates) can hold.
export const CRATE_WEAPONS = [2, 3, 4, 5, 6];

const TOAST_PER_AMMO = 10;   // toaster flames per unit of ammo
const FREEZE = 210;          // ticks an enemy stays frozen (powered: 350)

// Hit box, life, damage and how each projectile moves.
const SPEC = {
  1: { w: 14, h: 8, life: PLAYER.shotLife },
  2: { w: 10, h: 10, life: 105 },     // measured
  3: { w: 16, h: 8, life: 32 },
  4: { w: 16, h: 8, life: 140 },     // measured
  5: { w: 16, h: 8, life: 70 },
  6: { w: 12, h: 12, life: 24 },
  7: { w: 14, h: 14, life: 280 },
  8: { w: 12, h: 8, life: 16 },
  9: { w: 18, h: 14, life: 40 },
};

export class Bullet {
  // `remote`: a party rival's shot, which only moves and hurts us.
  constructor(weapon, powered, x, y, vx, vy, { remote = false } = {}) {
    const s = SPEC[weapon];
    Object.assign(this, { weapon, powered, x, y, vx, vy, remote, w: s.w, h: s.h, life: s.life, dead: false, t: 0 });
    // Shots fired upward stand on end.
    if (Math.abs(vy) > Math.abs(vx) * 2 && weapon !== TNT) { this.w = s.h; this.h = s.w; }
    this.prevX = x; this.prevY = y;
    this.angle = Math.atan2(vy, vx);
    this.hit = new Set();          // enemies an electro shot already went through
    if (weapon === 1 && powered) this.life = 30;   // measured
    if (weapon === 2 && powered) this.life += 35;  // manual: bounces longer
    if (weapon === 6) this.life += powered ? 6 : 0;
    if (weapon === TNT) { this.fuse = 0; this.armed = 35; }
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // Damage to an enemy (the frostbiter freezes instead).
  get damage() {
    if (this.weapon === 3) return 0;
    if (this.weapon === 4 || this.weapon === 5) return this.powered ? 3 : 2;
    return this.powered ? 2 : 1;
  }

  get explosive() { return this.weapon === 4 || this.weapon === 5; }

  update(game) {
    this.prevX = this.x; this.prevY = this.y;
    this.t++;
    if (this.weapon === TNT) { this.tnt(game); return; }
    if (--this.life <= 0) { this.dead = true; if (this.explosive) this.burst(game); return; }
    switch (this.weapon) {
      case 2: this.bounce(game); break;
      case 4: this.seek(game); this.fly(game); break;
      case 5: {
        const sp = Math.min(8, Math.hypot(this.vx, this.vy) + 0.25);
        this.angle = Math.atan2(this.vy, this.vx);
        this.vx = Math.cos(this.angle) * sp; this.vy = Math.sin(this.angle) * sp;
        this.fly(game);
        break;
      }
      case 6:
        // Flames slow down and drift up; powered ones stick to walls.
        this.vx *= 0.96; this.vy -= 0.03;
        this.fly(game, this.powered);
        break;
      case 1: {
        // Speeds up along its own direction (aimed shots too).
        const a = this.powered ? 0.1875 : PLAYER.shotAccel; const sp = Math.hypot(this.vx, this.vy) || 1;
        this.vx += (this.vx / sp) * a; this.vy += (this.vy / sp) * a;
        this.fly(game);
        break;
      }
      default: this.fly(game);
    }
    if (game.levelTime % 2 === 0 && this.weapon !== 6 && this.weapon !== 9) game.trail(this.cx - Math.sign(this.vx) * 6, this.cy, `rgb(${WEAPONS[this.weapon].glow})`);
  }

  // Straight flight; walls stop the shot (after it tries to break the tile).
  fly(game, stick = false) {
    this.x += this.vx; this.y += this.vy;
    if (this.stuck) { this.x = this.prevX; this.y = this.prevY; return; }
    if (this.wall(game)) {
      if (stick) { this.stuck = true; this.x = this.prevX; this.y = this.prevY; return; }
      this.dead = true;
      if (this.explosive) this.burst(game);
      else if (this.weapon !== 6) game.effect(this.weapon === 2 ? 'ping' : 'hitSpark', this.cx, this.cy);
    }
  }

  // True when the shot's centre is in something solid; tries to break it.
  wall(game) {
    const tx = Math.floor(this.cx / TILE); const ty = Math.floor(this.cy / TILE);
    if (!this.remote && game.hitTile(tx, ty, { weapon: this.weapon, blast: this.explosive })) return true;
    return game.level.shotHits(this.cx, this.cy);
  }

  // Bouncer: falls, bounces off floors and walls.
  bounce(game) {
    this.vy = Math.min(this.vy + 0.25, 7);
    this.x += this.vx;
    if (this.wall(game)) { this.x = this.prevX; this.vx = -this.vx; game.audio.play('bounce'); }
    this.y += this.vy;
    if (this.wall(game)) {
      this.y = this.prevY;
      this.vy = this.vy > 0 ? -(this.powered ? 6 : 4.5) : 1;
      game.audio.play('bounce');
    }
  }

  // Seeker: speeds up and turns toward the nearest target in front.
  seek(game) {
    let target = null; let best = 320 * 320;
    const consider = (o) => {
      const dx = o.x + o.w / 2 - this.cx; const dy = o.y + o.h / 2 - this.cy;
      const d = dx * dx + dy * dy;
      if (d < best && dx * Math.cos(this.angle) + dy * Math.sin(this.angle) > -40) { best = d; target = o; }
    };
    if (this.remote) { if (!game.player.dead) consider(game.player); } else {
      for (const e of game.enemies) if (!e.dead) consider(e);
      if (game.party && game.party.rival.seen && !game.party.rival.dead) consider(game.party.rival);
    }
    const sp = Math.min(6, Math.hypot(this.vx, this.vy) + 0.15);
    if (target) {
      const want = Math.atan2(target.y + target.h / 2 - this.cy, target.x + target.w / 2 - this.cx);
      let d = want - this.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.angle += Math.max(-0.09, Math.min(0.09, d));
    }
    this.vx = Math.cos(this.angle) * sp; this.vy = Math.sin(this.angle) * sp;
  }

  // TNT: falls to the ground, arms, and goes off when an enemy comes close,
  // when shot, or when its fuse runs out.
  tnt(game) {
    this.vy = Math.min(this.vy + 0.25, 6);
    this.vx *= 0.9;
    const hit = game.level.move(this, this.vx, this.vy, {});
    if (hit.bottom) { this.vy = 0; this.vx = 0; }
    if (this.armed > 0) this.armed--;
    if (this.fuse > 0) { if (--this.fuse === 0) this.burst(game); return; }
    if (!this.placed && --this.life <= 0) { this.burst(game); return; }
    if (this.armed > 0) return;
    const near = (o) => Math.abs(o.x + o.w / 2 - this.cx) < 40 && Math.abs(o.y + o.h / 2 - this.cy) < 40;
    if (this.remote ? !game.player.dead && near(game.player) : game.enemies.some((e) => !e.dead && near(e))) this.burst(game);
  }

  // Set off by another blast: a short delay makes chain reactions visible.
  detonate() { if (this.weapon === TNT && !this.dead && !this.fuse) this.fuse = 6; }

  burst(game) {
    this.dead = true;
    const r = this.weapon === TNT ? 72 : 30;
    game.blast(this.cx, this.cy, r, { weapon: this.weapon, damage: this.weapon === TNT ? 5 : this.damage, remote: this.remote, big: this.weapon === TNT });
  }

  // A shot touching an enemy: damage, freeze, or (electro) pass through.
  strike(game, e) {
    if (this.weapon === TNT || this.hit.has(e)) return;
    if (this.weapon === 3) {
      if (e.freezable === false) { e.damage(game, 1); this.dead = true; return; }
      e.frozen = this.powered ? 350 : FREEZE;
      e.flash = 0;
      game.audio.play('freeze');
      game.effect('sparkle', e.cx, e.y + e.h / 2);
    } else if (this.explosive) {
      e.damage(game, this.damage);
      this.burst(game);
      return;
    } else {
      // A frozen enemy shatters at the first real hit.
      e.damage(game, e.frozen > 0 && !e.boss ? 99 : this.damage);
      game.spark(this.cx, this.cy, '#ffffff');
    }
    if (this.weapon === 9) { this.hit.add(e); return; }
    this.dead = true;
  }
}

// Aim angles above the facing direction: straight ahead, diagonal, up.
const AIM = { null: 0, diag: Math.PI / 4, up: Math.PI / 2 };

// Fire the player's weapon (aimed by p.aim: null, 'diag' or 'up'). Returns
// false when there was nothing to fire.
export function fire(game, p) {
  const n = p.weapon;
  if (n !== 1 && p.ammo[n] <= 0) return false;
  const powered = p.powered[n];
  const dir = p.facing;
  // Shots are laid out along the aim (`along`) and across it (`side`, down
  // when aiming ahead), then turned to the aim angle.
  const phi = AIM[p.aim] || 0;
  const F = [dir * Math.cos(phi), -Math.sin(phi)];
  const N = [dir * Math.sin(phi), Math.cos(phi)];
  const ox = p.aim === 'up' ? p.cx - 7 + dir * 2 : p.aim === 'diag' ? p.cx - 7 + dir * 12 : (dir > 0 ? p.x + p.w + 4 : p.x - 18);
  const oy = p.aim === 'up' ? p.y - 14 : p.aim === 'diag' ? p.y - 2 : p.y + p.h - 18;
  const boost = Math.max(0, Math.min(PHYS.moveCap, p.vx * dir)) * Math.cos(phi);
  const made = [];
  const bullet = (along, side, offset = 0) => new Bullet(n, powered, ox + N[0] * offset, oy + N[1] * offset, F[0] * along + N[0] * side, F[1] * along + N[1] * side);
  const shot = (along, side, offset) => made.push(bullet(along, side, offset));
  switch (n) {
    case 1:
      // Measured: 6 px/tick (powered 7) plus the player's own speed.
      shot(PLAYER.shotSpeed + boost + (powered ? 1 : 0), 0);
      break;
    case 2: shot(5 + boost / 2 + (powered ? 1 : 0), -1); break;   // measured 5 px/tick
    case 3: shot(7 + boost, 0); break;
    case 4: shot(2, 0); break;                                      // measured 2 px/tick
    case 5:
      // V shape; powered RF fires three at once.
      shot(3, -0.5, -2); shot(3, 0.5, 2);
      if (powered) shot(3.4, 0);
      break;
    case 6: {
      const flame = bullet(3.5 + Math.random() * 1.5 + p.vx * dir * 0.5 * Math.cos(phi), (Math.random() - 0.5) * 0.8, -2);
      // Manual: the more Fastfire collected, the longer the stream.
      flame.life += Math.round((PLAYER.shotDelay - p.shotDelay) / PLAYER.fastfireStep) * 2;
      made.push(flame);
      break;
    }
    case TNT:
      // TNT is dropped at the feet whatever the aim.
      made.push(new Bullet(TNT, false, p.cx - 7, p.y + p.h - 16, p.vx * 0.3, 0));
      break;
    case 8:
      for (let k = 0; k < (powered ? 3 : 2); k++) {
        const b = bullet(5 + Math.random() * 2.5 + boost / 2, (Math.random() - 0.5) * 3);
        b.life += Math.floor(Math.random() * 6);
        made.push(b);
      }
      break;
    case 9: shot(6 + boost / 2, 0, -3); break;
    default: break;
  }
  if (n === 6) {
    // The toaster burns ammo slowly: a unit lasts several flames.
    if (++p.toast >= TOAST_PER_AMMO) { p.toast = 0; p.ammo[6]--; }
  } else if (n !== 1) p.ammo[n]--;
  game.shots.push(...made);
  game.audio.play(['', 'shoot', 'bounce', 'freeze', 'missile', 'missile', 'flame', 'tnt', 'pepper', 'electro'][n]);
  if (game.party) for (const s of made) game.party.fire(s);
  if (n <= 3 || n === 8 || n === 9) game.particles.push(game.muzzle(ox + 7 + F[0] * 4, oy + 4 + F[1] * 4, WEAPONS[n].glow));
  if (n !== 1 && p.ammo[n] <= 0) p.nextWeapon(-1);
  return true;
}

// Ticks before the next shot while fire is held.
export function fireDelay(p) {
  switch (p.weapon) {
    case 6: return 4;
    case TNT: return 30;
    case 4: return Math.round(p.shotDelay * 1.3);
    case 8: return Math.max(PLAYER.minShotDelay, Math.round(p.shotDelay * 0.6));
    default: return p.shotDelay;
  }
}

// Does a bullet touch a pickup or enemy shot? (TNT only sets things off by blasting.)
export function touches(s, o) { return s.weapon !== TNT && overlap(s, o); }
