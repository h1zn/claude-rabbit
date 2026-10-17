// World drawing and the in-game HUD.

import { arcadeText } from './art.js';
import { PHYS, PLAYER, TILE, VIEW_H, VIEW_W } from './config.js';
import { frameAt } from './sheets.js';
import { THEME_TILESET } from './tilesets.js';

function lerp(a, b, t) { return a + (b - a) * t; }

export class Renderer {
  constructor(ctx, art) {
    this.ctx = ctx;
    this.art = art;
    ctx.imageSmoothingEnabled = false;
    this.breakable = this.paintBreakable();
  }

  paintBreakable() {
    const c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    const x = c.getContext('2d');
    x.fillStyle = '#7a4a1e'; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = '#b8803e'; x.fillRect(1, 1, TILE - 2, TILE - 2);
    x.fillStyle = '#e8b878'; x.fillRect(1, 1, TILE - 2, 3); x.fillRect(1, 1, 3, TILE - 2);
    x.fillStyle = '#5a3216'; x.fillRect(1, TILE - 4, TILE - 2, 3); x.fillRect(TILE - 4, 1, 3, TILE - 2);
    x.strokeStyle = '#5a3216'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(6, 8); x.lineTo(14, 16); x.lineTo(10, 25); x.moveTo(14, 16); x.lineTo(25, 12); x.stroke();
    return c;
  }

  camera(game, alpha) {
    let x = lerp(game.prevCam.x, game.cam.x, alpha);
    let y = lerp(game.prevCam.y, game.cam.y, alpha);
    if (game.shakeTime > 0) {
      x += (Math.random() - 0.5) * game.shakeTime * 1.2;
      y += (Math.random() - 0.5) * game.shakeTime * 1.2;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  world(game, alpha) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const cam = this.camera(game, alpha);
    game.sky.draw(ctx, cam.x, cam.y, game.time);
    game.weather.draw(ctx, false, game.time);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    this.decor(game, cam, false);
    ctx.restore();

    game.terrain.draw(ctx, cam.x, cam.y, VIEW_W, VIEW_H);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    this.breakables(game, cam);
    this.props(game);
    this.pickups(game);
    this.enemies(game, alpha);
    this.shots(game, alpha);
    this.player(game, alpha);
    this.particles(game);
    this.debris(game);
    this.popups(game);
    this.decor(game, cam, true);
    ctx.restore();

    game.weather.draw(ctx, true, game.time);
    if (game.level.meta.theme === 'crystal') this.lighting(game, cam, alpha);
    if (game.player.rush > 0) this.rushTint(game);
    if (game.flashTime > 0) {
      ctx.globalAlpha = game.flashTime / 12;
      ctx.fillStyle = game.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  // Dark caves, lit around Kip and glowing things. The reference game keeps a
  // light grid for this; here it is a darkness layer with soft holes cut out.
  lighting(game, cam, alpha) {
    if (!this.dark) {
      this.dark = document.createElement('canvas');
      this.dark.width = VIEW_W; this.dark.height = VIEW_H;
    }
    const d = this.dark.getContext('2d');
    const p = game.player;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, VIEW_W, VIEW_H);
    d.fillStyle = `rgba(4,1,14,${p.rush > 0 ? 0.4 : 0.8})`;
    d.fillRect(0, 0, VIEW_W, VIEW_H);
    d.globalCompositeOperation = 'destination-out';
    const flicker = 1 + Math.sin(game.time / 7) * 0.03;
    const light = (x, y, r, strength = 1) => {
      x -= cam.x; y -= cam.y;
      if (x < -r || y < -r || x > VIEW_W + r || y > VIEW_H + r) return;
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    light(lerp(p.prevX, p.x, alpha) + p.w / 2, lerp(p.prevY, p.y, alpha) + p.h / 2, 150 * flicker);
    for (const s of game.shots) light(s.x + s.w / 2, s.y + s.h / 2, 48, 0.8);
    for (const k of game.pickups) if (k.kind === 'gem') light(k.x + k.w / 2, k.y + k.h / 2, 30, 0.5);
    for (const prop of game.props) if (prop.kind === 'sign' || (prop.kind === 'checkpoint' && prop.active)) light(prop.x + prop.w / 2, prop.y + 20, 90, 0.8);
    for (const dec of game.level.decor) if (dec.kind === 'crystals') light(dec.x * TILE + TILE / 2, dec.y * TILE - 10, 70 * flicker, 0.55);
    for (const q of game.particles) if (q.glow) light(q.x, q.y, 16, 0.5);
    this.ctx.drawImage(this.dark, 0, 0);
  }

  decor(game, cam, front) {
    const ctx = this.ctx;
    // Tileset levels use tileset pieces for scenery and skip everything else.
    const tsName = THEME_TILESET[game.level.meta.theme];
    const tsProps = tsName ? this.art.tilesets[tsName].props : null;
    for (const d of game.level.decor) {
      if (!!d.front !== front) continue;
      const imgs = tsProps ? tsProps[d.kind] : this.art.decor[d.kind];
      if (!imgs) continue;
      const img = Array.isArray(imgs) ? imgs[(d.v || 0) % imgs.length] : imgs;
      const x = Math.round(d.x * TILE + TILE / 2 - img.width / 2);
      const y = Math.round(d.y * TILE - img.height + (d.sink || 2));
      if (x > cam.x + VIEW_W || x + img.width < cam.x || y > cam.y + VIEW_H || y + img.height < cam.y) continue;
      ctx.drawImage(img, x, y);
    }
  }

  breakables(game, cam) {
    const level = game.level;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE)); const tx1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE)); const ty1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) if (level.tiles[ty][tx] === 'x') this.ctx.drawImage(this.breakable, tx * TILE, ty * TILE);
    }
  }

  props(game) {
    const ctx = this.ctx;
    for (const prop of game.props) {
      if (prop.kind === 'spring') ctx.drawImage(this.art.spring[prop.squash > 0 ? 1 : 0], prop.x, prop.y);
      else if (prop.kind === 'checkpoint') {
        const img = this.art.lantern[prop.active ? 1 : 0];
        if (prop.active) this.glow(prop.x + 12, prop.y + 10, 26, 'rgba(255,214,90,0.35)');
        ctx.drawImage(img, prop.x, prop.y);
      } else if (prop.kind === 'sign') {
        ctx.drawImage(prop.frame(this.art), prop.x, prop.y);
      }
    }
  }

  glow(x, y, r, color) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  pickups(game) {
    const ctx = this.ctx;
    for (const k of game.pickups) {
      const bob = Math.round(Math.sin(k.t / 12) * 2);
      if (k.kind === 'gem') {
        const frames = this.art.gems[k.color];
        ctx.drawImage(frames[Math.floor(k.t / 5) % frames.length], k.x, k.y + bob);
        if (k.t % 40 < 6) { ctx.fillStyle = '#ffffff'; ctx.fillRect(k.x + 5, k.y + 4 + bob, 2, 2); }
      } else if (k.kind === 'coin') {
        ctx.drawImage(this.art.coin[Math.floor(k.t / 4) % this.art.coin.length], k.x, k.y + bob);
      } else if (k.kind === 'food') ctx.drawImage(this.art.food[k.food], k.x, k.y + bob);
      else if (k.kind === 'carrot') ctx.drawImage(this.art.carrot, k.x, k.y + bob);
      else if (k.kind === 'crate') ctx.drawImage(this.art.crate, k.x, k.y);
    }
  }

  enemies(game, alpha) {
    const ctx = this.ctx;
    for (const e of game.enemies) {
      if (e.flash > 0 && e.flash % 2) continue;
      const sprite = e.frame(this.art)[e.facing > 0 ? 'right' : 'left'];
      const x = Math.round(lerp(e.prevX, e.x, alpha) + e.w / 2 - sprite.width / 2);
      const y = Math.round(lerp(e.prevY, e.y, alpha) + e.h - sprite.height + 2);
      if (e.type === 'bugbot') this.glow(x + (e.facing > 0 ? 30 : 6), y + 16, 8, 'rgba(255,60,80,0.35)');
      ctx.drawImage(sprite, x, y);
    }
  }

  shots(game, alpha) {
    for (const s of game.shots) {
      const img = s.spread ? this.art.spreadShot : this.art.shot;
      const x = Math.round(lerp(s.prevX, s.x, alpha));
      const y = Math.round(lerp(s.prevY, s.y, alpha));
      this.glow(x + 9, y + 4, 12, s.spread ? 'rgba(255,190,60,0.5)' : 'rgba(60,220,255,0.5)');
      this.ctx.save();
      if (s.vx < 0) { this.ctx.translate(x + img.width, y); this.ctx.scale(-1, 1); this.ctx.drawImage(img, 0, 0); }
      else this.ctx.drawImage(img, x, y);
      this.ctx.restore();
    }
  }

  // Which hero animation fits the player's current state.
  heroAnim(p) {
    const speed = Math.abs(p.vx);
    if (p.dead) return 'dead';
    if (p.celebrate) return 'victory';
    if (p.knock > 0) return 'hurt';
    if (p.special > 0) return p.special < PHYS.uppercutWindup ? 'uppercutWindup' : 'uppercut';
    if (p.stomping) return 'stomp';
    if (p.hovering) return p.shootPose > 0 ? 'hoverShoot' : 'hover';
    if (!p.onGround) {
      if (p.vy < 0) return p.vy < -11 ? 'spring' : speed > 2 ? 'jumpFwd' : 'jump';
      if (p.shootPose > 0) return 'shootAir';
      return speed > 2 ? 'fallFwd' : 'fall';
    }
    if (p.anim === 'skid') return 'skid';
    if (p.anim === 'run') return speed > 4.2 ? 'run' : 'walk';
    if (p.anim === 'crouch') return p.shootPose > 0 ? 'crouchShoot' : 'crouch';
    if (p.anim === 'look') return 'look';
    if (p.shootPose > 0) return 'shoot';
    return p.idleTime > 420 ? 'bored' : 'idle';
  }

  player(game, alpha) {
    const ctx = this.ctx;
    const p = game.player;
    if (p.invuln > 0 && !p.dead && p.rush === 0 && Math.floor(p.invuln / 4) % 2) return;
    const name = this.heroAnim(p);
    if (!this.heroState || this.heroState.name !== name) this.heroState = { name, start: game.time };
    const anim = this.art.hero.anims[name];
    const t = game.time - this.heroState.start;
    // Walk and run cycles speed up with the player.
    const speed = name === 'walk' || name === 'run' ? Math.max(2, 7 - Math.abs(p.vx) * 0.6) : anim.speed;
    const f = frameAt(anim, t, speed);
    const right = p.facing > 0;
    const x = Math.round(lerp(p.prevX, p.x, alpha) + PLAYER.w / 2 - (right ? f.ax : f.w - f.ax));
    const y = Math.round(lerp(p.prevY, p.y, alpha) + PLAYER.h - f.ay + 2);
    if (p.rush > 0) this.glow(x + f.w / 2, y + f.h / 2, 34, `hsla(${(game.time * 12) % 360},100%,60%,0.45)`);
    if (p.special > 0 && p.special >= PHYS.uppercutWindup) this.glow(x + f.w / 2, y + 12, 22, 'rgba(255,214,90,0.5)');
    if (p.stomping) this.glow(x + f.w / 2, y + f.h, 20, 'rgba(255,255,255,0.4)');
    ctx.drawImage(right ? f.right : f.left, x, y);
  }

  particles(game) {
    const ctx = this.ctx;
    for (const q of game.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.maxLife);
      if (q.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = q.color;
      const s = q.size > 6 ? q.size * (q.life / q.maxLife) : q.size;
      ctx.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), Math.ceil(s), Math.ceil(s));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  debris(game) {
    const ctx = this.ctx;
    for (const d of game.debris) {
      ctx.save();
      ctx.translate(d.x, d.y); ctx.rotate(d.spin);
      ctx.fillStyle = '#b8803e'; ctx.fillRect(-3, -3, 6, 6);
      ctx.fillStyle = '#5a3216'; ctx.fillRect(-3, 2, 6, 1);
      ctx.restore();
    }
  }

  popups(game) {
    for (const q of game.popups) {
      arcadeText(this.ctx, q.text, q.x, q.y, { size: 10, align: 'center', alpha: Math.min(1, q.life / 20), shadow: false, top: '#ffffff', bottom: '#cfe6ff' });
    }
  }

  rushTint(game) {
    const ctx = this.ctx;
    const p = game.player;
    const hue = (game.time * 4) % 360;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = `hsla(${hue},90%,50%,0.18)`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
    if (p.rush < 140 && Math.floor(p.rush / 8) % 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // ---------------------------------------------------------------- HUD

  heart(x, y, full, beat = 0) {
    const ctx = this.ctx;
    const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    const s = 2 + (beat > 0 ? 0.3 : 0);
    rows.forEach((row, j) => [...row].forEach((c, i) => {
      if (c !== 'X') return;
      ctx.fillStyle = '#1a0b1e';
      ctx.fillRect(x + i * s - 1, y + j * s - 1, s + 2, s + 2);
    }));
    rows.forEach((row, j) => [...row].forEach((c, i) => {
      if (c !== 'X') return;
      const shine = (i === 1 || i === 2) && j <= 2;
      ctx.fillStyle = !full ? '#3a2a4a' : shine ? '#ffc0cc' : j > 4 ? '#a8102e' : '#ec2a4c';
      ctx.fillRect(x + i * s, y + j * s, s, s);
    }));
  }

  hud(game) {
    const ctx = this.ctx;
    const p = game.player;
    // Score, top-left.
    arcadeText(ctx, String(game.score).padStart(8, '0'), 8, 6, { size: 18, top: '#ffffff', bottom: '#ffc04a' });
    // Hearts, top-right.
    for (let i = 0; i < PLAYER.maxHealth; i++) this.heart(VIEW_W - 26 - (PLAYER.maxHealth - 1 - i) * 20, 8, i < p.health);
    // Gems and coins under the score.
    ctx.drawImage(this.art.gems.red[0], 8, 30);
    arcadeText(ctx, `${game.levelGems}`, 30, 32, { size: 12, top: '#ffffff', bottom: '#ffb0c0' });
    ctx.drawImage(this.art.coin[0], 70, 31);
    arcadeText(ctx, `${game.coins}`, 91, 32, { size: 12, top: '#ffffff', bottom: '#ffe08a' });
    // Food meter toward a sugar rush.
    if (game.food > 0 || p.rush > 0) {
      const w = 90;
      const fill = p.rush > 0 ? p.rush / PHYS.rushTicks : game.food / PHYS.foodForRush;
      ctx.fillStyle = '#1a0b1e'; ctx.fillRect(VIEW_W / 2 - w / 2 - 2, 8, w + 4, 10);
      const g = ctx.createLinearGradient(VIEW_W / 2 - w / 2, 0, VIEW_W / 2 + w / 2, 0);
      if (p.rush > 0) { for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + game.time * 6) % 360},100%,60%)`); }
      else { g.addColorStop(0, '#ff7ac0'); g.addColorStop(1, '#ffd54a'); }
      ctx.fillStyle = g; ctx.fillRect(VIEW_W / 2 - w / 2, 10, Math.round(w * fill), 6);
      ctx.drawImage(this.art.food.cupcake, VIEW_W / 2 - w / 2 - 26, 3);
      if (p.rush === 0) arcadeText(ctx, `${game.food}`, VIEW_W / 2 + w / 2 + 6, 7, { size: 10, top: '#ffffff', bottom: '#ffb0d8' });
    }
    // Measured: a sugar rush shows its seconds left, blinking in the last 140 ticks.
    if (p.rush > 0 && (p.rush > 140 || game.time % 8 < 5)) {
      arcadeText(ctx, `${Math.ceil(p.rush / 70)}`, VIEW_W / 2, 24, { size: 22, align: 'center', top: '#ffffff', bottom: `hsl(${(game.time * 6) % 360},100%,65%)` });
    }
    // Lives, bottom-left.
    const face = this.art.kip.icon[0].right;
    ctx.drawImage(face, 6, VIEW_H - face.height - 6);
    arcadeText(ctx, `x${Math.max(0, game.lives)}`, 44, VIEW_H - 30, { size: 16, top: '#ffffff', bottom: '#ffb04a' });
    // Weapon and ammo, bottom-right.
    const spread = p.spreadAmmo > 0;
    ctx.drawImage(spread ? this.art.spreadShot : this.art.shot, VIEW_W - 92, VIEW_H - 24);
    arcadeText(ctx, spread ? `x${p.spreadAmmo}` : 'x∞', VIEW_W - 70, VIEW_H - 30, { size: 16, top: '#ffffff', bottom: spread ? '#ffd54a' : '#7ae8ff' });
    // Level banner.
    if (game.bannerTime > 0 && game.state === 'play') {
      const a = Math.min(1, game.bannerTime / 30);
      const s = 1 + Math.max(0, (game.bannerTime - 140) / 20);
      arcadeText(ctx, game.bannerText, VIEW_W / 2, 70, { size: Math.round(24 * s), align: 'center', alpha: a });
    }
  }
}
