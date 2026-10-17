// JJ2 moving platforms: a platform on a chain that circles its anchor (or
// swings below it like a pendulum). Motion follows Jazz² Resurrection: the
// phase moves by speed x 0.0072 rad per frame, the chain is `length` links of
// 12 px. Kip stands on top (one-way) and is carried along; spike platforms
// hurt from below.

const LINK = 12;
const W = 56;    // platform width
const H = 12;

const LOOK = {
  1: ['#c8823a', '#7a4418'],   // fruit (Carrotus)
  2: ['#9aa6b8', '#4a5468'],   // boll
  3: ['#6ac84a', '#2a6a1a'],   // grass
  4: ['#e88ac8', '#8a3a6a'],   // pink
  5: ['#c8c8d8', '#5a5a7a'],   // sonic
  6: ['#b8b8c8', '#4a4a5a'],   // spike
};

export class Platform {
  constructor({ x, y, type, sync, speed, length, swing }) {
    Object.assign(this, { ox: x, oy: y, type, swing, links: Math.max(1, length) });
    this.speed = speed * 0.0072;
    this.phase = sync * (Math.PI / 2);
    this.place();
    this.prevX = this.x; this.prevY = this.y;
  }

  angle() {
    return this.swing ? Math.PI / 2 + Math.sin(this.phase) * (Math.PI / 2) : this.phase;
  }

  place() {
    const a = this.angle();
    this.cx = Math.round(this.ox + Math.cos(a) * this.links * LINK);
    this.cy = Math.round(this.oy + Math.sin(a) * this.links * LINK);
    this.x = this.cx - W / 2; this.y = this.cy - H / 2; this.w = W; this.h = H;
  }

  // Move one tick; carry a rider standing on top.
  update(game) {
    this.prevX = this.x; this.prevY = this.y;
    this.phase -= this.speed;
    if (this.phase < -Math.PI * 2) this.phase += Math.PI * 2;
    if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;
    this.place();
    const p = game.player;
    if (p.platform === this && !p.dead) {
      const dx = this.x - this.prevX;
      game.level.move(p, dx, 0, { climb: true });
      p.y = this.y - p.h;
    }
  }

  // After the player moved: land on top when falling onto it from above.
  catchRider(game) {
    const p = game.player;
    if (p.dead || p.pole || p.hang) return;
    const over = p.x + p.w > this.x + 2 && p.x < this.x + this.w - 2;
    const feet = p.y + p.h;
    const prevFeet = p.prevY + p.h;
    if (over && p.vy >= 0 && prevFeet <= this.prevY + 6 && feet >= this.y - 1 && feet <= this.y + Math.max(10, p.vy + 6)) {
      p.y = this.y - p.h;
      p.vy = 0;
      if (!p.onGround) { p.jumping = false; p.hovering = false; p.stomping = false; p.doubleJumped = false; p.coyote = 6; }
      p.onGround = true;
      p.platform = this;
    } else if (p.platform === this && (!over || feet < this.y - 2 || p.vy < 0)) {
      p.platform = null;
    }
    // Spike platforms hurt from below and the sides.
    if (this.type === 6 && p.platform !== this && over && p.y < this.y + this.h && feet > this.y + 3) p.hurt(game, this.cx);
  }

  draw(ctx) {
    const a = this.angle();
    ctx.fillStyle = '#d8c8a0';
    for (let i = 0; i < this.links; i++) {
      const x = this.ox + Math.cos(a) * i * LINK; const y = this.oy + Math.sin(a) * i * LINK;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
    const [top, side] = LOOK[this.type] || LOOK[1];
    const x = Math.round(this.x); const y = Math.round(this.y);
    ctx.fillStyle = side;
    ctx.fillRect(x, y + 3, W, H - 3);
    ctx.fillStyle = top;
    ctx.fillRect(x + 1, y, W - 2, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x + 3, y + 1, W - 6, 2);
    if (this.type === 6) {
      ctx.fillStyle = '#e8e8f0';
      for (let k = 0; k < W; k += 8) { ctx.beginPath(); ctx.moveTo(x + k, y + H); ctx.lineTo(x + k + 4, y + H + 7); ctx.lineTo(x + k + 8, y + H); ctx.fill(); }
    }
  }
}
