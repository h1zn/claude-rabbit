// World drawing and the in-game HUD.

import { arcadeText } from './art.js';
import { PHYS, PLAYER, TILE, VIEW_H, VIEW_W } from './config.js';
import { frameAt } from './sheets.js';
import { BLOCKS } from './level.js';
import { THEME_TILESET } from './tilesets.js';

// Block tile -> index in the shared block sheet (tools/build_blocks.py).
const BLOCK_SPRITE = { x: 0, m: 5, p: 6, Y: 7, u: 8, i: 8 };

function lerp(a, b, t) { return a + (b - a) * t; }

export class Renderer {
  constructor(ctx, art) {
    this.ctx = ctx;
    this.art = art;
    ctx.imageSmoothingEnabled = false;
  }

  // Draw a sheet frame with its anchor (body centre, feet) at (x, footY).
  sprite(f, x, footY, right = true) {
    this.ctx.drawImage(right ? f.right : f.left, Math.round(x - (right ? f.ax : f.w - f.ax)), Math.round(footY - f.ay));
  }

  // Draw a sheet frame centred on (x, y).
  centred(f, x, y, right = true) {
    this.ctx.drawImage(right ? f.right : f.left, Math.round(x - f.w / 2), Math.round(y - f.h / 2));
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
    const p = game.player;
    const view = game.view;
    let indoors = true;
    if (view) {
      // Original JJ2 level: its background layers and the sprite layer.
      view.drawBack(ctx, cam, game.time);
    } else {
      game.sky.draw(ctx, cam.x, cam.y, game.time);
      // No weather inside caves and buildings (cells with a back wall).
      indoors = !!game.level.back[Math.floor(p.cy / TILE)]?.[Math.floor(p.cx / TILE)];
      if (!indoors) game.weather.draw(ctx, false, game.time);
      // Scenery goes after the terrain so cave back walls don't hide it.
      game.terrain.draw(ctx, cam.x, cam.y, VIEW_W, VIEW_H);
    }

    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    if (view) view.drawBridges(ctx, game.time);
    for (const pl of game.platforms || []) pl.draw(ctx);
    this.decor(game, cam, false);
    this.blocks(game, cam);
    this.props(game);
    this.pickups(game);
    this.enemies(game, alpha);
    this.shots(game, alpha);
    this.enemyShots(game, alpha);
    if (game.party) this.rival(game, alpha);
    this.player(game, alpha);
    this.effects(game);
    this.particles(game);
    this.debris(game);
    this.popups(game);
    this.decor(game, cam, true);
    ctx.restore();

    if (view) {
      view.drawFront(ctx, cam, game.time);
      view.drawWater(ctx, cam, game.time);
    }
    if (!indoors) game.weather.draw(ctx, true, game.time);
    if (game.level.meta.dark) this.lighting(game, cam, alpha);
    this.vignette();
    if (game.player.rush > 0) this.rushTint(game);
    if (game.flashTime > 0) {
      ctx.globalAlpha = game.flashTime / 12;
      ctx.fillStyle = game.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  // Dark levels: a darkness layer with soft holes cut around light sources,
  // then the lights' own colours added on top. `meta.dark` may set the
  // darkness colour and strength ({ color: 'r,g,b', amount }).
  lighting(game, cam, alpha) {
    if (!this.dark) {
      this.dark = document.createElement('canvas');
      this.dark.width = VIEW_W; this.dark.height = VIEW_H;
    }
    const d = this.dark.getContext('2d');
    const ctx = this.ctx;
    const p = game.player;
    const def = typeof game.level.meta.dark === 'object' ? game.level.meta.dark : {};
    const amount = (def.amount ?? 0.8) * (p.rush > 0 ? 0.5 : 1);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, VIEW_W, VIEW_H);
    d.fillStyle = `rgba(${def.color || '4,1,14'},${amount})`;
    d.fillRect(0, 0, VIEW_W, VIEW_H);
    d.globalCompositeOperation = 'destination-out';
    const flicker = 1 + Math.sin(game.time / 7) * 0.03;
    const glows = [];
    const light = (x, y, r, strength = 1, color = null) => {
      x -= cam.x; y -= cam.y;
      if (x < -r || y < -r || x > VIEW_W + r || y > VIEW_H + r) return;
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(x - r, y - r, r * 2, r * 2);
      if (color) glows.push([x, y, r * 0.8, color, strength]);
    };
    light(lerp(p.prevX, p.x, alpha) + p.w / 2, lerp(p.prevY, p.y, alpha) + p.h / 2, 150 * flicker);
    for (const s of game.shots) light(s.x + s.w / 2, s.y + s.h / 2, 56, 0.8, '255,220,120');
    for (const b of game.enemyShots) light(b.x + 8, b.y + 8, 40, 0.6, '255,140,60');
    const GEM = { red: '255,60,110', green: '60,255,140', blue: '80,150,255', purple: '200,90,255' };
    for (const k of game.pickups) if (k.kind === 'gem') light(k.x + k.w / 2, k.y + k.h / 2, 34, 0.5, GEM[k.color]);
    for (const prop of game.props) {
      if (prop.kind === 'sign' || prop.kind === 'warp' || (prop.kind === 'checkpoint' && prop.active)) light(prop.x + prop.w / 2, prop.y + 20, 90, 0.8, '255,230,150');
    }
    for (const fx of game.effects) light(fx.x, fx.y, 70, 0.8, fx.anim === 'explosion' ? '255,120,40' : '200,230,255');
    // JJ2 level lights: steady, pulsing and flickering.
    for (const L of game.level.lights || []) {
      const k = L.kind === 149 ? 0.75 + Math.sin(game.time / 12) * 0.25 : L.kind === 150 ? (Math.random() < 0.15 ? 0.5 : 1) : 1;
      light(L.x, L.y, 96 * k, 0.85, '255,236,180');
    }
    const DECOR = { crystals: '120,230,255', mushroom: '200,120,255', glowshroom: '120,255,200', torch: '255,160,60' };
    for (const dec of game.level.decor) {
      const c = DECOR[dec.kind];
      if (c) light(dec.x * TILE + TILE / 2, dec.y * TILE - 12, 80 * flicker, 0.6, c);
    }
    // Lava glows from every other visible lava cell.
    const level = game.level;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 2); const tx1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE) + 2);
    const ty0 = Math.max(0, Math.floor(cam.y / TILE) - 2); const ty1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE) + 2);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx += 2) {
        if (level.tiles[ty][tx] === '~' && level.tiles[ty - 1]?.[tx] !== '~') light(tx * TILE + 16, ty * TILE + 4, 110 * flicker, 0.75, '255,110,30');
      }
    }
    for (const q of game.particles) if (q.glow) light(q.x, q.y, 16, 0.5);
    ctx.drawImage(this.dark, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, color, strength] of glows) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color},${0.28 * strength})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // Soft darkening toward the screen edges.
  vignette() {
    if (!this.vig) {
      this.vig = document.createElement('canvas');
      this.vig.width = VIEW_W; this.vig.height = VIEW_H;
      const v = this.vig.getContext('2d');
      const g = v.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.38)');
      v.fillStyle = g;
      v.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    this.ctx.drawImage(this.vig, 0, 0);
  }

  // Lava: a glowing, rippling surface over a hot body.
  lava(game, tx, ty) {
    const ctx = this.ctx;
    const x = tx * TILE; const y = ty * TILE;
    const top = game.level.tiles[ty - 1]?.[tx] !== '~';
    ctx.fillStyle = '#b8200a';
    ctx.fillRect(x, y + (top ? 6 : 0), TILE, TILE - (top ? 6 : 0));
    for (let k = 0; k < 4; k++) {
      const bx = x + ((k * 9 + game.time * 0.4 + tx * 13) % TILE);
      const by = y + 10 + ((k * 7 + game.time * 0.25) % 20);
      ctx.fillStyle = k % 2 ? '#ff6a1a' : '#ff9a2a';
      ctx.fillRect(Math.floor(bx), Math.floor(by), 3, 2);
    }
    if (!top) return;
    for (let i = 0; i < TILE; i += 2) {
      const h = 3 + Math.sin((tx * TILE + i) * 0.25 + game.time * 0.12) * 2.5;
      ctx.fillStyle = '#ffd04a';
      ctx.fillRect(x + i, y + 6 - h, 2, h + 1);
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(x + i, y + 7, 2, 2);
    }
  }

  decor(game, cam, front) {
    const ctx = this.ctx;
    // Tileset levels draw scenery from tileset pieces, falling back to the
    // procedural decorations (glow mushrooms, torches) for kinds they lack.
    const tsName = THEME_TILESET[game.level.meta.theme];
    const tsProps = tsName ? this.art.tilesets[tsName].props : null;
    for (const d of game.level.decor) {
      if (!!d.front !== front) continue;
      const imgs = (tsProps && tsProps[d.kind]) || this.art.decor[d.kind];
      if (!imgs) continue;
      const img = Array.isArray(imgs) ? imgs[(d.v || 0) % imgs.length] : imgs;
      const x = Math.round(d.x * TILE + TILE / 2 - img.width / 2);
      const y = Math.round(d.y * TILE - img.height + (d.sink || 2));
      if (x > cam.x + VIEW_W || x + img.width < cam.x || y > cam.y + VIEW_H || y + img.height < cam.y) continue;
      ctx.drawImage(img, x, y);
    }
  }

  blocks(game, cam) {
    const level = game.level;
    if (level.jj2) return;      // JJ2 levels draw blocks in their own tiles
    const ctx = this.ctx;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE)); const tx1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE)); const ty1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ch = level.tiles[ty][tx];
        if (ch === '~') { this.lava(game, tx, ty); continue; }
        if (!BLOCKS.has(ch)) continue;
        // Countdown blocks show the hits they have left (1-4).
        const k = ch === 'c' ? Math.min(4, Math.max(1, level.hits.get(`${tx},${ty}`) || 1)) : BLOCK_SPRITE[ch];
        if (ch === 'i') ctx.globalAlpha = 0.3 + Math.sin(game.time / 10) * 0.08;
        ctx.drawImage(this.art.blocks[k], tx * TILE, ty * TILE);
        ctx.globalAlpha = 1;
      }
    }
  }


  props(game) {
    const ctx = this.ctx;
    for (const prop of game.props) {
      if (prop.hidden && !(prop.kind === 'warp' && prop.cost > 0)) continue;
      if (prop.kind === 'spring') {
        const f = prop.sprite(this.art);
        if (!prop.dir) this.sprite(f, prop.x + TILE / 2, prop.y + prop.h, true);
        else {
          // Side springs: the floor spring turned to face along `dir`.
          ctx.save();
          ctx.translate(prop.dir > 0 ? prop.x : prop.x + prop.w, prop.y + TILE / 2);
          ctx.rotate(prop.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          ctx.drawImage(f.right, -f.ax, -f.ay);
          ctx.restore();
        }
      } else if (prop.kind === 'checkpoint') {
        if (prop.active) this.glow(prop.x + prop.w / 2, prop.y + 30, 30, 'rgba(255,214,90,0.3)');
        this.sprite(prop.sprite(this.art), prop.x + prop.w / 2, prop.y + prop.h);
      } else if (prop.kind === 'sign') {
        const f = prop.sprite(this.art);
        const sx = Math.abs(prop.spin) < 0.15 ? 0.15 : Math.abs(prop.spin);
        ctx.save();
        ctx.translate(prop.x + prop.w / 2, prop.y + prop.h);
        ctx.scale(sx, 1);
        ctx.drawImage(prop.spin < 0 ? f.left : f.right, -f.ax, -f.ay);
        ctx.restore();
      } else if (prop.kind === 'warp') this.warp(game, prop);
      else if (prop.kind === 'pole') this.pole(prop);
      else if (prop.kind === 'hint') ctx.drawImage(this.art.decor.sign, prop.tx * TILE + TILE / 2 - this.art.decor.sign.width / 2, prop.ty * TILE + TILE - this.art.decor.sign.height);
    }
  }

  // A warp: a ring of orbiting sparks. Coin warps show their price, and
  // "x N" (the coins still missing) when Kip is too poor to use them.
  warp(game, w) {
    const ctx = this.ctx;
    const cx = w.x + w.w / 2; const cy = w.y + w.h / 2;
    const gold = w.cost > 0;
    if (w.exitOnly) {
      this.glow(cx, cy + 10, 18, 'rgba(160,220,255,0.25)');
      return;
    }
    this.glow(cx, cy, 30, gold ? 'rgba(255,210,80,0.45)' : 'rgba(120,200,255,0.45)');
    for (let i = 0; i < 10; i++) {
      const a = w.t * 0.08 + (i / 10) * Math.PI * 2;
      const r = 14 + Math.sin(w.t * 0.05 + i) * 3;
      ctx.fillStyle = i % 2 ? '#ffffff' : gold ? '#ffd54a' : '#7ad8ff';
      ctx.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r * 1.5) - 1, 3, 3);
    }
    if (gold) {
      const f = this.art.items.anims.coinGold.frames[0];
      const short = w.cost - game.coins;
      const label = w.near > 0 && short > 0 ? `x${short}` : `${w.cost}`;
      this.centred(f, cx - 10, w.y - 10);
      arcadeText(ctx, label, cx + 2, w.y - 18, { size: 12, top: '#ffffff', bottom: short > 0 ? '#ff8a8a' : '#ffe08a' });
    }
  }

  pole(pole) {
    const ctx = this.ctx;
    const { px, py } = pole;
    ctx.fillStyle = '#2a1e3a';
    if (pole.vertical) ctx.fillRect(px - 3, py - 16, 6, 32);
    else ctx.fillRect(px - 16, py - 3, 32, 6);
    ctx.fillStyle = '#c8d0e8';
    if (pole.vertical) ctx.fillRect(px - 2, py - 15, 2, 30);
    else ctx.fillRect(px - 15, py - 2, 30, 2);
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(px - 4, py - 4, 8, 8);
    ctx.fillStyle = '#fff6c0';
    ctx.fillRect(px - 3, py - 3, 3, 3);
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
    for (const k of game.pickups) {
      if (k.pending) continue;
      const f = k.sprite(this.art);
      if (k.needsHit) { this.sprite(f, k.x + k.w / 2, k.y + k.h); continue; }
      const bob = Math.round(Math.sin(k.t / 12) * 2);
      this.centred(f, k.x + k.w / 2, k.y + k.h / 2 + bob);
    }
  }


  // A soft contact shadow under something standing on the ground.
  footShadow(x, y, w) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y) - 1, w / 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  enemies(game, alpha) {
    for (const e of game.enemies) {
      if (e.flash > 0 && e.flash % 2) continue;
      if (e.onGround) this.footShadow(lerp(e.prevX, e.x, alpha) + e.w / 2, e.y + e.h, e.w * 0.9);
      const f = e.sprite(this.art);
      const x = lerp(e.prevX, e.x, alpha) + e.w / 2;
      const y = lerp(e.prevY, e.y, alpha) + e.h + 2;
      // Sheet sprites face right; flying enemies hang from their centre.
      if (e.type === 'bat' && !e.awake) this.sprite(f, x, lerp(e.prevY, e.y, alpha) + f.ay - 4, e.facing > 0);
      else if (e.type === 'bat' || e.type === 'dragonfly') this.centred(f, x, y - e.h / 2, e.facing > 0);
      else this.sprite(f, x, y, e.facing > 0);
    }
  }

  enemyShots(game, alpha) {
    for (const b of game.enemyShots) {
      const f = b.sprite(this.art);
      const x = lerp(b.prevX, b.x, alpha) + 8; const y = lerp(b.prevY, b.y, alpha) + 8;
      if (b.kind === 'banana') {
        const ctx = this.ctx;
        ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(b.t * 0.35);
        ctx.drawImage(f.right, -f.w / 2, -f.h / 2); ctx.restore();
      } else {
        if (b.life < 30 && b.t % 6 < 3) this.glow(x, y, 16, 'rgba(255,80,40,0.6)');
        this.centred(f, x, y);
      }
    }
  }

  effects(game) {
    for (const fx of game.effects) {
      const a = this.art.fx.anims[fx.anim];
      this.centred(frameAt(a, fx.t, fx.speed || a.speed), fx.x, fx.y);
    }
  }


  shots(game, alpha) {
    for (const s of game.shots) {
      const a = this.art.fx.anims[s.spread ? 'blasterPower' : 'blaster'];
      const f = frameAt(a, s.life, a.speed);
      const x = lerp(s.prevX, s.x, alpha) + s.w / 2;
      const y = lerp(s.prevY, s.y, alpha) + s.h / 2;
      this.glow(x, y, 12, s.spread ? 'rgba(255,190,60,0.5)' : 'rgba(255,240,160,0.45)');
      this.centred(f, x, y, s.vx > 0);
    }
  }


  // Which hero animation fits the player's current state.
  heroAnim(p) {
    const speed = Math.abs(p.vx);
    if (p.dead) return 'dead';
    if (p.celebrate) return 'victory';
    if (p.pole || p.hang) return 'spring';
    if (p.knock > 0) return 'hurt';
    if (p.swimming && !p.onGround) return Math.abs(p.vx) > 0.6 ? 'jumpFwd' : 'fall';
    if (p.special > 0) return p.special < p.windup ? 'uppercutWindup' : 'uppercut';
    if (p.stomping) return 'stomp';
    if (p.hovering) return p.shootPose > 0 ? 'hoverShoot' : 'hover';
    if (p.doubleJumped && p.vy < 0 && !p.onGround) return 'doubleJump';
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
    const sheet = this.art.heroes[p.character] || this.art.hero;
    const anim = sheet.anims[name] || sheet.anims.idle;
    const t = game.time - this.heroState.start;
    // Walk and run cycles speed up with the player.
    const speed = name === 'walk' || name === 'run' ? Math.max(2, 7 - Math.abs(p.vx) * 0.6) : anim.speed;
    const f = frameAt(anim, t, speed);
    const right = p.facing > 0;
    const x = Math.round(lerp(p.prevX, p.x, alpha) + p.w / 2 - (right ? f.ax : f.w - f.ax));
    const y = Math.round(lerp(p.prevY, p.y, alpha) + p.h - f.ay + 2);
    if (p.onGround && !p.pole) this.footShadow(lerp(p.prevX, p.x, alpha) + p.w / 2, p.y + p.h, 22);
    if (p.rush > 0) this.glow(x + f.w / 2, y + f.h / 2, 34, `hsla(${(game.time * 12) % 360},100%,60%,0.45)`);
    if (p.special > 0 && p.special >= p.windup) this.glow(x + f.w / 2, y + 12, 22, 'rgba(255,214,90,0.5)');
    if (p.stomping) this.glow(x + f.w / 2, y + f.h, 20, 'rgba(255,255,255,0.4)');
    if (p.shield > 0 && (p.shield > 210 || game.time % 8 < 5)) this.shieldRing(game, x + f.w / 2, y + f.h / 2);
    if (p.pole) {
      // Spinning round the pole, hands on the bar.
      ctx.save();
      ctx.translate(p.pole.px, p.pole.py);
      ctx.rotate(p.poleT * (0.18 + p.poleSpeed * 0.012) * p.poleDir);
      ctx.drawImage(right ? f.right : f.left, -(right ? f.ax : f.w - f.ax), -6);
      ctx.restore();
      return;
    }
    ctx.drawImage(right ? f.right : f.left, x, y);
  }

  // Fire shield: flames circling Kip.
  shieldRing(game, cx, cy) {
    const ctx = this.ctx;
    this.glow(cx, cy, 34, 'rgba(255,120,40,0.35)');
    for (let i = 0; i < 8; i++) {
      const a = game.time * 0.12 + (i / 8) * Math.PI * 2;
      ctx.fillStyle = ['#fff2a0', '#ffb02e', '#ff5a2a'][i % 3];
      ctx.fillRect(Math.round(cx + Math.cos(a) * 22) - 2, Math.round(cy + Math.sin(a) * 26) - 2, 4, 4);
    }
  }

  // The party-mode rival: the hero in red, drawn where it was last reported.
  rival(game, alpha) {
    const r = game.party.rival;
    if (!r.seen) return;
    for (const s of game.party.shots) {
      const a = this.art.fx.anims[s.spread ? 'blasterPower' : 'blaster'];
      const x = lerp(s.prevX, s.x, alpha) + 7; const y = lerp(s.prevY, s.y, alpha) + 4;
      this.glow(x, y, 12, 'rgba(255,80,60,0.6)');
      this.centred(frameAt(a, s.life, a.speed), x, y, s.vx > 0);
    }
    if (r.dead) return;
    const speed = Math.abs(r.vx);
    const sheet = this.art.heroesRed[r.character] || this.art.heroRed;
    const name = { run: speed > 4.2 ? 'run' : 'walk', jump: speed > 2 ? 'jumpFwd' : 'jump', fall: speed > 2 ? 'fallFwd' : 'fall', pole: 'spring' }[r.anim] || (sheet.anims[r.anim] ? r.anim : 'idle');
    const anim = sheet.anims[name];
    const f = frameAt(anim, game.time, anim.speed);
    const right = r.facing > 0;
    const x = Math.round(lerp(r.prevX, r.x, alpha) + r.w / 2 - (right ? f.ax : f.w - f.ax));
    const y = Math.round(lerp(r.prevY, r.y, alpha) + r.h - f.ay + 2);
    this.glow(x + f.w / 2, y + f.h / 2, 30, 'rgba(255,60,60,0.25)');
    this.ctx.drawImage(right ? f.right : f.left, x, y);
    arcadeText(this.ctx, `${r.gems}`, x + f.w / 2, y - 14, { size: 10, align: 'center', shadow: false, top: '#ffffff', bottom: '#ff8a8a' });
  }

  // Party HUD: both gem counts against the goal, and the knock-out timer.
  partyHud(game) {
    const ctx = this.ctx;
    const party = game.party;
    const bar = (x, label, gems, color) => {
      ctx.fillStyle = '#1a0b1e'; ctx.fillRect(x - 2, 10, 124, 12);
      ctx.fillStyle = color; ctx.fillRect(x, 12, Math.round(Math.min(1, gems / 100) * 120), 8);
      arcadeText(ctx, `${label} ${gems}`, x + 60, 24, { size: 11, align: 'center', top: '#ffffff', bottom: color });
    };
    bar(VIEW_W / 2 - 132, 'YOU', game.gems, '#5ae08a');
    bar(VIEW_W / 2 + 12, 'RIVAL', party.rival.gems, '#ff5a5a');
    arcadeText(ctx, '100 GEMS + EXIT', VIEW_W / 2, 40, { size: 9, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' });
    if (party.respawn > 0) {
      this.dim(0.45);
      arcadeText(ctx, 'KNOCKED OUT!', VIEW_W / 2, 130, { size: 26, align: 'center', top: '#ffd0d8', bottom: '#e8244a' });
      arcadeText(ctx, `Back in ${Math.ceil(party.respawn / 70)}`, VIEW_W / 2, 170, { size: 16, align: 'center' });
    }
    if (party.result) {
      this.dim(0.6);
      const text = { win: 'YOU WIN!', lose: 'RIVAL WINS!', left: 'RIVAL LEFT' }[party.result];
      arcadeText(ctx, text, VIEW_W / 2, 120, { size: 36, align: 'center', top: party.result === 'win' ? '#fff6c0' : '#ffd0d8', bottom: party.result === 'win' ? '#ffb02e' : '#e8244a' });
      arcadeText(ctx, 'Press ENTER for the menu', VIEW_W / 2, 190, { size: 13, align: 'center', alpha: Math.floor(game.time / 25) % 2 ? 1 : 0.4 });
    }
  }

  dim(alpha) {
    this.ctx.fillStyle = `rgba(8,4,18,${alpha})`;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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
    if (!game.party) arcadeText(ctx, String(game.score).padStart(8, '0'), 8, 6, { size: 18, top: '#ffffff', bottom: '#ffc04a' });
    // Hearts, top-right.
    if (!game.party) for (let i = 0; i < PLAYER.maxHealth; i++) this.heart(VIEW_W - 26 - (PLAYER.maxHealth - 1 - i) * 20, 8, i < p.health);
    // Gems and coins under the score.
    const items = this.art.items.anims;
    this.centred(items.gemRed.frames[0], 18, 40);
    arcadeText(ctx, `${game.gems}`, 32, 32, { size: 12, top: '#ffffff', bottom: '#ffb0c0' });
    this.centred(items.coinSilver.frames[0], 84, 40);
    arcadeText(ctx, `${game.coins}`, 96, 32, { size: 12, top: '#ffffff', bottom: '#ffe08a' });
    if (p.shield > 0) {
      this.centred(items.shieldMonitor.frames[0], 146, 40);
      arcadeText(ctx, `${Math.ceil(p.shield / 70)}`, 162, 32, { size: 12, top: '#ffffff', bottom: '#ff9a3a' });
    }
    // Food meter toward a sugar rush.
    if (!game.party && (game.food > 0 || p.rush > 0)) {
      const w = 90;
      const fill = p.rush > 0 ? p.rush / PHYS.rushTicks : game.food / PHYS.foodForRush;
      ctx.fillStyle = '#1a0b1e'; ctx.fillRect(VIEW_W / 2 - w / 2 - 2, 8, w + 4, 10);
      const g = ctx.createLinearGradient(VIEW_W / 2 - w / 2, 0, VIEW_W / 2 + w / 2, 0);
      if (p.rush > 0) { for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + game.time * 6) % 360},100%,60%)`); }
      else { g.addColorStop(0, '#ff7ac0'); g.addColorStop(1, '#ffd54a'); }
      ctx.fillStyle = g; ctx.fillRect(VIEW_W / 2 - w / 2, 10, Math.round(w * fill), 6);
      this.centred(this.art.items.anims.food.frames[4], VIEW_W / 2 - w / 2 - 14, 13);
      if (p.rush === 0) arcadeText(ctx, `${game.food}`, VIEW_W / 2 + w / 2 + 6, 7, { size: 10, top: '#ffffff', bottom: '#ffb0d8' });
    }
    // Measured: a sugar rush shows its seconds left, blinking in the last 140 ticks.
    if (p.rush > 0 && (p.rush > 140 || game.time % 8 < 5)) {
      arcadeText(ctx, `${Math.ceil(p.rush / 70)}`, VIEW_W / 2, 24, { size: 22, align: 'center', top: '#ffffff', bottom: `hsl(${(game.time * 6) % 360},100%,65%)` });
    }
    // Lives, bottom-left.
    const face = (this.art.heroes[p.character] || this.art.hero).anims.icon.frames[0].right;
    ctx.drawImage(face, 6, VIEW_H - face.height - 6);
    if (!game.party) arcadeText(ctx, `x${Math.max(0, game.lives)}`, 44, VIEW_H - 30, { size: 16, top: '#ffffff', bottom: '#ffb04a' });
    // Weapon and ammo, bottom-right.
    const spread = p.spreadAmmo > 0;
    this.centred(this.art.fx.anims[spread ? 'blasterPower' : 'blaster'].frames[0], VIEW_W - 84, VIEW_H - 20);
    if (p.shotDelay < PLAYER.shotDelay) {
      // One gun icon per Fastfire collected.
      const n = Math.round((PLAYER.shotDelay - p.shotDelay) / PLAYER.fastfireStep);
      for (let i = 0; i < Math.min(n, 10); i++) ctx.drawImage(this.art.items.anims.fastfire.frames[0].right, VIEW_W - 100 - i * 9, VIEW_H - 50, 12, 12);
    }
    arcadeText(ctx, spread ? `x${p.spreadAmmo}` : 'x∞', VIEW_W - 70, VIEW_H - 30, { size: 16, top: '#ffffff', bottom: spread ? '#ffd54a' : '#7ae8ff' });
    // Combo meter while a combo is running.
    if (game.comboMult > 1 && game.comboTimer > 0) {
      const a = Math.min(1, game.comboTimer / 30);
      arcadeText(ctx, `COMBO x${game.comboMult}`, VIEW_W - 8, 32, { size: 14, align: 'right', alpha: a, top: '#ffffff', bottom: '#ff5ad8' });
      ctx.fillStyle = `rgba(255,90,216,${a})`;
      ctx.fillRect(VIEW_W - 8 - Math.round(game.comboTimer * 0.7), 50, Math.round(game.comboTimer * 0.7), 3);
    }
    // Hint sign text, in a box near the bottom.
    if (game.hintText && game.state === 'play') {
      ctx.font = '12px "Arial Black", Impact, sans-serif';
      const lines = game.hintText.split('\n');
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24;
      const h = lines.length * 16 + 12;
      ctx.fillStyle = 'rgba(10,4,26,0.8)';
      ctx.fillRect(VIEW_W / 2 - w / 2, VIEW_H - 54 - h, w, h);
      ctx.strokeStyle = '#ffd54a';
      ctx.strokeRect(VIEW_W / 2 - w / 2 + 0.5, VIEW_H - 54 - h + 0.5, w - 1, h - 1);
      lines.forEach((l, i) => arcadeText(ctx, l, VIEW_W / 2, VIEW_H - 48 - h + i * 16, { size: 12, align: 'center', shadow: false, top: '#ffffff', bottom: '#cfe6ff' }));
    }
    if (game.party) this.partyHud(game);
    // Level banner.
    if (game.bannerTime > 0 && game.state === 'play') {
      const a = Math.min(1, game.bannerTime / 30);
      const s = 1 + Math.max(0, (game.bannerTime - 140) / 20);
      arcadeText(ctx, game.bannerText, VIEW_W / 2, 70, { size: Math.round(24 * s), align: 'center', alpha: a });
    }
  }
}
