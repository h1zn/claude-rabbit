// Companion birds, after Jazz2 Resurrection's Bird and BirdCage: free one
// from its cage (JJ2 event 68; shoot it or break it with a special move or a
// stomp) or break the bird monitor (event 94), and it flies along behind and
// above you. Chuck (red) fires two blaster shots at enemies ahead of you
// (aimed at them here; the original fires level and a little lower);
// Birdy (yellow) dives at them. One bird at a time; a hit sends it flying
// away for good. Sprites: Anims.j2a (assets/jj2_morphs).

import { overlap } from './entities.js';
import { frameAt } from './sheets.js';
import { Bullet } from './weapons.js';

const T = 70 / 60;            // frames -> ticks
const V = 60 / 70;            // px per frame -> px per tick

export class Bird {
  // `type`: 0 Chuck (red), 1 Birdy (yellow).
  constructor(type, x, y) {
    Object.assign(this, { type, x, y, prevX: x, prevY: y, vx: 0, vy: 0, facing: 1, cool: Math.round(60 * T), attack: 0, leaving: 0, t: 0, dead: false });
  }

  update(game) {
    this.t++;
    this.prevX = this.x; this.prevY = this.y;
    const p = game.player;
    if (this.leaving > 0) {
      // Off it goes, growing as it flies at the screen.
      this.x += this.facing * 8 * V; this.y -= V;
      if (--this.leaving === 0) this.dead = true;
      return;
    }
    if (this.attack > 0) {
      // Birdy's dive.
      this.x += this.vx; this.y += this.vy;
      const body = { x: this.x - 10, y: this.y - 10, w: 20, h: 20 };
      const hit = game.enemies.find((e) => !e.dead && overlap(body, e));
      if (hit || --this.attack <= 0) {
        if (hit) { hit.damage(game, 1); game.effect('hitSpark', this.x, this.y); }
        this.attack = 0;
      }
    } else {
      // Behind and above the player, catching up gently.
      if (p.facing !== this.facing) { this.facing = p.facing; this.cool = Math.max(this.cool, Math.round(40 * T)); }
      const tx = p.cx - this.facing * 55; const ty = p.cy - 50;
      const k = 1 - (1 - 0.02) ** V;
      this.x += (tx - this.x) * k * 2.5;
      this.y += (ty - this.y) * k * 2.5;
    }
    if (this.cool > 0) this.cool--;
    else this.fire(game);
  }

  // An enemy within 260 px ahead: Chuck shoots, Birdy dives.
  fire(game) {
    const target = game.enemies.find((e) => !e.dead && e.hp > 0 && Math.hypot(e.cx - this.x, e.y + e.h / 2 - this.y) < 260
      && (this.facing > 0 ? e.cx > this.x : e.cx < this.x));
    if (!target) return;
    if (this.type === 0) {
      if (game.level.solidAt(this.x, this.y)) return;
      // Two blaster shots at the enemy, the second a little lower.
      const a = Math.atan2(target.y + target.h / 2 - this.y, target.cx - this.x);
      for (const da of [0, 0.15 * this.facing]) game.shots.push(new Bullet(1, false, this.x, this.y, Math.cos(a + da) * 8, Math.sin(a + da) * 8));
      game.audio.play('shoot', 0.5);
      this.cool = Math.round(32 * T);
    } else {
      const dx = target.cx - this.x; const dy = target.y + target.h / 2 - this.y; const d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * 6 * V; this.vy = (dy / d) * 6 * V;
      this.attack = Math.round(d * 0.2 * T);
      this.cool = Math.round(140 * T);
      game.audio.play('throw', 0.6);
    }
  }

  flyAway() { if (!this.leaving) { this.leaving = Math.round(120 * T); this.attack = 0; } }

  draw(r, alpha) {
    const a = r.art.morphs.anims;
    const f = frameAt(this.type ? a.birdyFly : a.chuckFly, this.t, 4);
    const x = this.prevX + (this.x - this.prevX) * alpha; const y = this.prevY + (this.y - this.prevY) * alpha;
    const ctx = r.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (this.leaving) { const s = 1 + (120 * T - this.leaving) * 0.012; ctx.scale(s, s); }
    // Diving: the bird points where it's going.
    if (this.attack > 0) ctx.rotate(Math.atan2(this.vy, Math.abs(this.vx)) * Math.sign(this.vx || 1));
    const right = this.attack > 0 ? this.vx >= 0 : this.facing > 0;
    ctx.drawImage(right ? f.right : f.left, -f.w / 2, -f.h / 2);
    ctx.restore();
  }
}

// What's left of a cage once its bird is out.
export class BrokenCage {
  constructor(k) { Object.assign(this, { kind: 'brokencage', x: k.x, y: k.y, w: k.w, h: k.h, yellow: k.yellow }); }
  update() {}
  draw(r) {
    const a = r.art.morphs.anims;
    r.sprite((this.yellow ? a.birdyCageBroken : a.chuckCageBroken).frames[0], this.x + this.w / 2, this.y + this.h);
  }
}
