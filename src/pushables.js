// Pushable boxes and rocks (JJ2 events 231 and 232, Builder.pushable).
// Walk into one to shove it along the floor; it falls off ledges, can be
// stood on (it carries Kip like a moving platform), and lands on enemies
// hard enough to flatten them. They sit in game.platforms, so the player's
// platform code (standing, riding) works on them as on moving platforms.

import { TILE } from './config.js';
import { overlap } from './entities.js';

const SIZE = { box: [32, 30], rock: [44, 36] };
const PUSH_SPEED = { box: 1.6, rock: 1.0 };   // the rock is heavier

let rockArt = null;

// A round boulder, painted once (no rock sprite in the sheets).
function paintRock() {
  const c = document.createElement('canvas');
  c.width = 44; c.height = 36;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 12, 4, 22, 18, 26);
  g.addColorStop(0, '#b8a690'); g.addColorStop(0.55, '#7a6650'); g.addColorStop(1, '#3a2e22');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(4, 30);
  ctx.bezierCurveTo(0, 14, 10, 1, 22, 1);
  ctx.bezierCurveTo(36, 1, 44, 14, 41, 30);
  ctx.quadraticCurveTo(22, 37, 4, 30);
  ctx.fill();
  ctx.strokeStyle = '#21180f'; ctx.lineWidth = 2; ctx.stroke();
  // Cracks and a highlight.
  ctx.strokeStyle = 'rgba(33,24,15,0.7)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(14, 8); ctx.lineTo(19, 16); ctx.lineTo(16, 24); ctx.moveTo(30, 12); ctx.lineTo(27, 22); ctx.stroke();
  ctx.fillStyle = 'rgba(255,250,235,0.35)';
  ctx.beginPath(); ctx.ellipse(15, 9, 6, 3, -0.5, 0, Math.PI * 2); ctx.fill();
  return c;
}

export class Pushable {
  constructor({ tx, ty, kind = 'box' }) {
    const [w, h] = SIZE[kind] || SIZE.box;
    Object.assign(this, { kind, w, h, vx: 0, vy: 0, onGround: false, pushable: true });
    this.x = tx * TILE + (TILE - w) / 2;
    this.y = ty * TILE + TILE - h;
    this.prevX = this.x; this.prevY = this.y;
  }

  get cx() { return this.x + this.w / 2; }

  // Fall (stacking on other pushables) and carry a rider down with it.
  update(game) {
    this.prevX = this.x; this.prevY = this.y;
    this.vy = Math.min(this.vy + 0.25, 8);
    const hit = game.level.move(this, 0, this.vy, {});
    this.onGround = hit.bottom;
    for (const o of game.platforms) {
      if (o === this || !(o instanceof Pushable) || !overlap(this, o)) continue;
      if (this.prevY + this.h <= o.y + 1) { this.y = o.y - this.h; this.onGround = true; }
    }
    if (this.onGround) {
      if (this.vy > 3) game.sound('stompLand', this.cx, this.y + this.h);
      this.vy = 0;
    } else if (this.vy > 2) {
      // Falling on an enemy flattens it.
      for (const e of game.enemies) if (!e.dead && !e.boss && overlap(this, e)) e.kill(game);
    }
    const p = game.player;
    if (p.platform === this && !p.dead) p.y = this.y - p.h;
  }

  // After the player moved: land on top, bump from below, or get pushed.
  catchRider(game) {
    const p = game.player;
    if (p.dead || p.pole || p.hang) return;
    const over = p.x + p.w > this.x + 2 && p.x < this.x + this.w - 2;
    const feet = p.y + p.h;
    if (over && p.vy >= 0 && p.prevY + p.h <= this.prevY + 8 && feet >= this.y - 1 && feet <= this.y + Math.max(12, p.vy + 6)) {
      p.y = this.y - p.h;
      p.vy = 0;
      if (!p.onGround) { p.jumping = false; p.hovering = false; p.stomping = false; p.doubleJumped = false; p.coyote = 6; }
      p.onGround = true;
      p.platform = this;
      return;
    }
    if (p.platform === this && (!over || feet < this.y - 2 || p.vy < 0)) p.platform = null;
    if (p.platform === this || !overlap(p, this)) return;
    // Jumping up into it from below.
    if (p.vy < 0 && p.prevY >= this.prevY + this.h - 6) { p.y = this.y + this.h; p.vy = 0; return; }
    // From the side: shove it the way Kip walks, then stand against it.
    const dir = p.cx < this.cx ? 1 : -1;
    if (p.onGround && p.vx * dir > 0.2) {
      const before = this.x;
      game.level.move(this, dir * Math.min(Math.abs(p.vx), PUSH_SPEED[this.kind]), 0, { climb: true });
      if (game.platforms.some((o) => o !== this && o instanceof Pushable && overlap(this, o))) this.x = before;
      if (this.x !== before) { p.pushing = 3; if (game.levelTime % 16 === 0) game.sound('land', this.cx, this.y + this.h); }
      p.vx = dir * Math.min(Math.abs(p.vx), PUSH_SPEED[this.kind]);
    }
    p.x = dir > 0 ? this.x - p.w : this.x + this.w;
  }

  draw(ctx, art) {
    const x = Math.round(this.x); const y = Math.round(this.y);
    if (this.kind === 'rock') {
      if (!rockArt) rockArt = paintRock();
      ctx.drawImage(rockArt, x, y);
      return;
    }
    const f = art && art.items.anims.plainCrate && art.items.anims.plainCrate.frames[0];
    if (f) ctx.drawImage(f.right, x - 1, y - 1, this.w + 2, this.h + 2);
    else { ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x, y, this.w, this.h); }
  }
}
