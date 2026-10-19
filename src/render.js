// World drawing and the in-game HUD.

import { arcadeText } from './art.js';
import { PHYS, PLAYER, TILE, VIEW_H, VIEW_W } from './config.js';
import { frameAt } from './sheets.js';
import { tr } from './lang.js';
import { SECOND, TEAMS } from './party.js';
import { boxSprite, ITEMS } from './partyitems.js';
import { AREA, BLOCKS } from './level.js';
import { THEME_TILESET } from './tilesets.js';
import { TNT, WEAPONS } from './weapons.js';

// Block tile -> index in the shared block sheet (tools/build_blocks.py).
const BLOCK_SPRITE = { x: 0, m: 5, p: 6, Y: 7, u: 8, i: 8, W: 6 };

function lerp(a, b, t) { return a + (b - a) * t; }

// Poses only Jazz and Spaz have (new/sprites other movements.png): what
// Lori shows instead.
const HERO_FALLBACK = { shootUp: 'look', shootDiag: 'run', shootDiagAir: 'shootAir', shootRun: 'run', fidget: 'idle', knockdown: 'dead', dizzy: 'hurt', push: 'walk', wobble: 'idle' };

// A sheet frame washed in ice blue, for frozen enemies (made once per frame).
const icedFrames = new WeakMap();
function iced(f) {
  if (icedFrames.has(f)) return icedFrames.get(f);
  const wash = (src) => {
    const c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(140,215,255,0.62)';
    g.fillRect(0, 0, f.w, f.h);
    return c;
  };
  const out = { ...f, right: wash(f.right), left: wash(f.left) };
  icedFrames.set(f, out);
  return out;
}

export class Renderer {
  constructor(ctx, art) {
    this.ctx = ctx;
    this.art = art;
    this.iced = iced;
    this.w = VIEW_W;          // the view's width: half the screen in split screen
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
    for (const pl of game.platforms || []) pl.draw(ctx, this.art);
    this.decor(game, cam, false);
    this.blocks(game, cam);
    this.props(game);
    this.pickups(game);
    this.enemies(game, alpha);
    this.shots(game, alpha);
    this.enemyShots(game, alpha);
    if (game.party) this.rivals(game, alpha);
    this.player(game, alpha);
    this.effects(game);
    this.particles(game);
    this.debris(game);
    this.popups(game);
    this.decor(game, cam, true);
    this.pools(game, cam);
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
    for (const s of game.shots) light(s.x + s.w / 2, s.y + s.h / 2, s.weapon === 6 ? 40 : 56, 0.8, s.glow || WEAPONS[s.weapon].glow);
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
    if (!this.vig || this.vig.width !== this.w) {
      this.vig = document.createElement('canvas');
      this.vig.width = this.w; this.vig.height = VIEW_H;
      const v = this.vig.getContext('2d');
      const g = v.createRadialGradient(this.w / 2, VIEW_H / 2, VIEW_H * 0.45, this.w / 2, VIEW_H / 2, this.w * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.38)');
      v.fillStyle = g;
      v.fillRect(0, 0, this.w, VIEW_H);
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
        const area = level.areas[ty * level.w + tx];
        if (area === AREA.VINE || area === AREA.HOOK) this.vine(game, tx, ty, area === AREA.HOOK);
        const ch = level.tiles[ty][tx];
        if (ch === '~') { this.lava(game, tx, ty); continue; }
        if (!BLOCKS.has(ch)) continue;
        // Countdown blocks show the hits they have left (1-4).
        const k = ch === 'c' ? Math.min(4, Math.max(1, level.hits.get(`${tx},${ty}`) || 1)) : BLOCK_SPRITE[ch];
        if (ch === 'i') ctx.globalAlpha = 0.3 + Math.sin(game.time / 10) * 0.08;
        ctx.drawImage(this.art.blocks[k], tx * TILE, ty * TILE);
        ctx.globalAlpha = 1;
        if (ch === 'W') {
          // Manual: the weapon that breaks it is pictured on its face.
          const n = level.weapons.get(`${tx},${ty}`) || 1;
          const f = this.art.items.anims[WEAPONS[n].icon].frames[0];
          const s = Math.min(1, 24 / Math.max(f.w, f.h));
          ctx.drawImage(f.right, Math.round(tx * TILE + 16 - (f.w * s) / 2), Math.round(ty * TILE + 16 - (f.h * s) / 2), Math.round(f.w * s), Math.round(f.h * s));
        }
      }
    }
  }


  // A vine strung across a tile (leaves sway), or a hook hanging from above.
  vine(game, tx, ty, hook) {
    const ctx = this.ctx;
    const x = tx * TILE; const y = ty * TILE + 8;
    if (hook) {
      ctx.fillStyle = '#7a7f8a'; ctx.fillRect(x + 15, ty * TILE, 2, 8);
      ctx.fillStyle = '#c8ccd8'; ctx.fillRect(x + 12, y, 8, 2); ctx.fillRect(x + 12, y - 3, 2, 3);
      return;
    }
    ctx.fillStyle = '#3c6a1e'; ctx.fillRect(x, y, TILE, 3);
    ctx.fillStyle = '#6ab83a'; ctx.fillRect(x, y, TILE, 1);
    for (let k = 0; k < 3; k++) {
      const lx = x + 4 + k * 11; const sway = Math.round(Math.sin(game.time / 20 + tx * 1.7 + k) * 1.5);
      ctx.fillStyle = k % 2 ? '#4f9a2c' : '#78c848';
      ctx.fillRect(lx + sway, y + 3, 4, 3); ctx.fillRect(lx + 1 + sway, y + 6, 2, 3);
    }
  }

  // Water pools in our levels: a tint over everything in them, and a moving
  // shine along the top.
  pools(game, cam) {
    const level = game.level;
    if (level.jj2) return;
    const ctx = this.ctx;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE)); const tx1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE)); const ty1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (level.areas[ty * level.w + tx] !== AREA.WATER) continue;
        const x = tx * TILE; const y = ty * TILE;
        const top = ty === 0 || level.areas[(ty - 1) * level.w + tx] !== AREA.WATER;
        ctx.fillStyle = 'rgba(30,110,230,0.34)';
        ctx.fillRect(x, y + (top ? 4 : 0), TILE, TILE - (top ? 4 : 0));
        if (top) {
          ctx.fillStyle = 'rgba(200,236,255,0.75)';
          for (let k = 0; k < TILE; k += 4) ctx.fillRect(x + k, Math.round(y + 4 + Math.sin((x + k) / 18 + game.time / 9) * 2), 4, 2);
        }
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
      const f = k.kind === 'itembox' ? boxSprite() : k.sprite(this.art);
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
      if (e.draw) { e.draw(this, alpha); continue; }
      if (e.onGround) this.footShadow(lerp(e.prevX, e.x, alpha) + e.w / 2, e.y + e.h, e.w * 0.9);
      let f = e.sprite(this.art);
      // Frozen: ice blue, blinking as it is about to thaw.
      if (e.frozen > 0 && (e.frozen > 50 || e.frozen % 8 < 5)) f = iced(f);
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
      if (b.draw) { b.draw(this, alpha); continue; }
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
    for (const s of game.shots) this.shot(game, s, alpha);
  }

  // One projectile (ours, or with `rival` a party rival's in red).
  shot(game, s, alpha, rival = false) {
    const ctx = this.ctx;
    const x = lerp(s.prevX, s.x, alpha) + s.w / 2;
    const y = lerp(s.prevY, s.y, alpha) + s.h / 2;
    const w = WEAPONS[s.weapon];
    if (s.weapon === TNT) {
      // TNT blinks faster as its fuse burns down.
      const f = frameAt(this.art.items.anims.ammoTNT, s.t, 4);
      const soon = s.fuse > 0 || (!s.placed && s.life < 70);
      if (soon ? s.t % 4 < 2 : s.t % 30 < 4) this.glow(x, y, 18, 'rgba(255,90,40,0.7)');
      this.sprite(f, x, lerp(s.prevY, s.y, alpha) + s.h + 1);
      return;
    }
    if (s.whammo) { this.whammoShot(s, x, y, rival); return; }
    const a = this.art.fx.anims[s.powered ? w.shotP : w.shot];
    // A flame grows and dies over its life; other shots loop.
    const f = s.weapon === 6 ? a.frames[Math.min(a.frames.length - 1, Math.floor((s.t / (s.t + s.life)) * a.frames.length))] : frameAt(a, s.life, a.speed);
    this.glow(x, y, s.weapon === 6 ? 16 : 12, rival ? 'rgba(255,80,60,0.6)' : `rgba(${w.glow},${s.weapon === 6 ? 0.35 : 0.5})`);
    const aimed = s.weapon !== 2 && s.weapon !== 6 && Math.abs(s.vy) > Math.abs(s.vx) * 0.5;
    if (s.weapon === 4 || s.weapon === 5 || aimed) {
      // Missiles (and shots fired upward) point where they fly.
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(s.weapon === 4 || s.weapon === 5 ? s.angle : Math.atan2(s.vy, s.vx));
      ctx.drawImage(f.right, -f.w / 2, -f.h / 2);
      ctx.restore();
      return;
    }
    this.centred(f, x, y, s.vx >= 0);
  }

  // Whammo Ammo: a wobbling bubble, a flaming missile or a plasma bolt.
  whammoShot(s, x, y, rival) {
    const ctx = this.ctx;
    if (s.whammo === 'bubble') {
      this.glow(x, y, 12, rival ? 'rgba(255,80,60,0.5)' : 'rgba(110,190,255,0.5)');
      const r = 5.5 + Math.sin(s.t * 0.4) * 0.8;
      ctx.save();
      ctx.fillStyle = rival ? 'rgba(255,120,110,0.35)' : 'rgba(140,210,255,0.35)';
      ctx.strokeStyle = rival ? '#ffc0b8' : '#dff4ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x - r * 0.5), Math.round(y - r * 0.6), 2, 2);
      ctx.restore();
      return;
    }
    const a = this.art.fx.anims[s.whammo === 'fire' ? 'rfP' : 'electroP'];
    const f = frameAt(a, s.life, a.speed);
    this.glow(x, y, s.whammo === 'fire' ? 16 : 18, rival ? 'rgba(255,80,60,0.6)' : `rgba(${s.glow},0.6)`);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(Math.atan2(s.vy, s.vx));
    ctx.drawImage(f.right, -f.w / 2, -f.h / 2);
    ctx.restore();
  }

  // Which hero animation fits the player's current state.
  heroAnim(p) {
    const speed = Math.abs(p.vx);
    if (p.dead) return 'knockdown';
    if (p.celebrate) return 'victory';
    if (p.pole || p.hang) return 'spring';
    if (p.knock > 0) return 'hurt';
    if (p.dizzy > 0) return 'dizzy';
    // Aiming up: straight up standing (or in the air), diagonally while moving.
    if (p.shootPose > 0 && p.aim && !p.hovering && !p.stomping && p.special === 0 && !p.swimming) {
      if (!p.onGround) return p.aim === 'up' ? 'shootUp' : 'shootDiagAir';
      return p.aim === 'up' ? 'shootUp' : 'shootDiag';
    }
    if (p.swimming && !p.onGround) return Math.abs(p.vx) > 0.6 ? 'jumpFwd' : 'fall';
    if (p.special > 0) return p.special <= p.windup ? 'uppercutWindup' : 'uppercut';
    if (p.stomping) return 'stomp';
    if (p.hovering) return p.shootPose > 0 ? 'hoverShoot' : 'hover';
    if (p.doubleJumped && p.vy < 0 && !p.onGround) return 'doubleJump';
    if (!p.onGround) {
      if (p.vy < 0) return p.vy < -11 ? 'spring' : speed > 2 ? 'jumpFwd' : 'jump';
      if (p.shootPose > 0) return 'shootAir';
      return speed > 2 ? 'fallFwd' : 'fall';
    }
    if (p.pushing > 0) return 'push';
    if (p.anim === 'skid') return 'skid';
    if (p.anim === 'run') return p.shootPose > 0 ? 'shootRun' : speed > 4.2 ? 'run' : 'walk';
    if (p.anim === 'crouch') return p.shootPose > 0 ? 'crouchShoot' : 'crouch';
    if (p.anim === 'look') return 'look';
    if (p.shootPose > 0) return 'shoot';
    if (p.teeter) return 'wobble';
    // Standing around: a fidget after about 2.5 s, then the bored animation.
    if (p.idleTime >= 180 && p.idleTime < 272) return 'fidget';
    return p.idleTime > 420 ? 'bored' : 'idle';
  }

  player(game, alpha) {
    const ctx = this.ctx;
    const p = game.player;
    if (p.invuln > 0 && !p.dead && p.rush === 0 && Math.floor(p.invuln / 4) % 2) return;
    const sheet = this.art.tinted(p.character, game.party && game.party.tint);
    let name = this.heroAnim(p);
    if (!sheet.anims[name]) name = HERO_FALLBACK[name] || 'idle';
    if (!this.heroState || this.heroState.name !== name) this.heroState = { name, start: game.time };
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
    if (p.special > 0 && p.special > p.windup) this.glow(x + f.w / 2, y + 12, 22, 'rgba(255,214,90,0.5)');
    if (p.stomping) this.glow(x + f.w / 2, y + f.h, 20, 'rgba(255,255,255,0.4)');
    if (p.shield > 0 && (p.shield > 210 || game.time % 8 < 5)) this.shieldRing(game, x + f.w / 2, y + f.h / 2, p.shieldType);
    if (p.pole) {
      // Spinning round the pole, hands on the bar.
      ctx.save();
      ctx.translate(p.pole.px, p.pole.py);
      ctx.rotate(p.poleT * (0.18 + p.poleSpeed * 0.012) * p.poleDir);
      ctx.drawImage(right ? f.right : f.left, -(right ? f.ax : f.w - f.ax), -6);
      ctx.restore();
      return;
    }
    const items = game.party && game.party.items;
    if (items && items.magnet > 0) this.glow(x + f.w / 2, y + f.h / 2, 40 + Math.sin(game.time / 4) * 6, 'rgba(255,90,140,0.35)');
    this.drawHero(right ? f.right : f.left, x, y, f, items && items.shrink > 0, items && items.bubble > 0);
  }

  // A hero frame, maybe shrunk (shrink ray) or in a bubble (bubble trap).
  drawHero(img, x, y, f, small, bubble) {
    const ctx = this.ctx;
    if (small) {
      const k = 0.55;
      ctx.drawImage(img, Math.round(x + (f.w * (1 - k)) / 2), Math.round(y + f.h * (1 - k)), Math.round(f.w * k), Math.round(f.h * k));
    } else ctx.drawImage(img, x, y);
    if (bubble) {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,240,255,0.9)'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(120,200,255,0.25)';
      ctx.beginPath(); ctx.arc(x + f.w / 2, y + f.h / 2, Math.max(f.w, f.h) * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // Party traps (banana peels, spring mines) and item shots in flight.
  partyItems(game) {
    const ctx = this.ctx;
    const items = game.party.items;
    for (const t of items.traps) {
      if (t.kind === 'peel') {
        ctx.fillStyle = '#ffe05a'; ctx.strokeStyle = '#7a5a0a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(t.x + 10, t.y + 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillRect(t.x + 2, t.y + 4, 4, 4); ctx.fillRect(t.x + 14, t.y + 4, 4, 4);
      } else {
        ctx.fillStyle = '#4a4a5a'; ctx.fillRect(t.x, t.y + 6, 20, 6);
        ctx.fillStyle = game.time % 30 < 15 ? '#ff4a4a' : '#7a1a1a'; ctx.fillRect(t.x + 8, t.y + 2, 4, 4);
        ctx.strokeStyle = '#c8c8d8'; ctx.beginPath();
        for (let i = 0; i < 4; i++) { ctx.moveTo(t.x + 2 + i * 5, t.y + 6); ctx.lineTo(t.x + 4 + i * 5, t.y + 2); }
        ctx.stroke();
      }
    }
    for (const s of items.shots) {
      const cx = s.cx; const cy = s.cy;
      const col = (ITEMS[s.kind] || {}).color || '#ffffff';
      this.glow(cx, cy, 14, 'rgba(255,255,255,0.25)');
      ctx.save();
      ctx.translate(cx, cy);
      if (s.kind === 'boomerang') {
        ctx.rotate(s.t * 0.5);
        ctx.fillStyle = '#ff8a2a'; ctx.fillRect(-10, -3, 20, 6);
        ctx.fillStyle = '#4ac84a'; ctx.fillRect(-12, -2, 4, 4);
      } else if (s.kind === 'pie') {
        ctx.fillStyle = '#c87a3a'; ctx.beginPath(); ctx.ellipse(0, 2, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -1, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6 + Math.sin(s.t / 3) * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // The shield around Kip: circling flames (fire), a wobbling gel sphere
  // (bubble) or a crackling energy field (plasma).
  shieldRing(game, cx, cy, type = 'fire') {
    const ctx = this.ctx;
    const t = game.time;
    if (type === 'bubble') {
      this.glow(cx, cy, 34, 'rgba(90,180,255,0.25)');
      ctx.save();
      ctx.strokeStyle = 'rgba(170,225,255,0.85)'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(90,170,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 24 + Math.sin(t * 0.15) * 1.5, 28 + Math.cos(t * 0.13) * 1.5, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(cx - 9, cy - 14, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (type === 'plasma') {
      this.glow(cx, cy, 36, 'rgba(255,240,120,0.3)');
      ctx.save();
      ctx.strokeStyle = t % 4 < 2 ? '#fff8c0' : '#ffe040'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        // Jagged arcs round the body, redrawn every few ticks.
        const seed = Math.floor(t / 3) * 7 + k * 13;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI * 2 + k * 2.1;
          const r = 24 + ((seed * (i + 3)) % 7) - 3;
          const px = cx + Math.cos(a) * r; const py = cy + Math.sin(a) * (r + 4);
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    this.glow(cx, cy, 34, 'rgba(255,120,40,0.35)');
    for (let i = 0; i < 8; i++) {
      const a = t * 0.12 + (i / 8) * Math.PI * 2;
      ctx.fillStyle = ['#fff2a0', '#ffb02e', '#ff5a2a'][i % 3];
      ctx.fillRect(Math.round(cx + Math.cos(a) * 22) - 2, Math.round(cy + Math.sin(a) * 26) - 2, 4, 4);
    }
  }

  // The other players in a party game, each in their own colours with a
  // name tag, drawn where they were last reported; CTF flags at the bases.
  rivals(game, alpha) {
    const party = game.party;
    const ctx = this.ctx;
    for (const s of party.shots) this.shot(game, s, alpha, true);
    this.partyItems(game);
    // The leader wears a crown.
    const top = party.mode === 'ctf' ? null : party.standings(game)[0];
    const leader = top && top.value > 0 ? top.id : null;
    if (leader === party.id && !game.player.dead) {
      const p = game.player;
      this.crown(lerp(p.prevX, p.x, alpha) + p.w / 2, lerp(p.prevY, p.y, alpha) - 24, game.time);
    }
    if (party.mode === 'ctf') {
      const carried = (team) => party.carry === team || [...party.rivals.values()].some((r) => r.carry === team && !r.dead);
      for (const b of party.bases) if (b && !carried(b.team)) this.flag(b.x, b.y, b.team, game.time);
    }
    for (const r of party.rivals.values()) {
      if (!r.seen || r.dead) continue;
      const speed = Math.abs(r.vx);
      const sheet = this.art.tinted(r.character, r.tint);
      const name = { run: speed > 4.2 ? 'run' : 'walk', jump: speed > 2 ? 'jumpFwd' : 'jump', fall: speed > 2 ? 'fallFwd' : 'fall', pole: 'spring' }[r.anim] || (sheet.anims[r.anim] ? r.anim : 'idle');
      const anim = sheet.anims[name] || sheet.anims[HERO_FALLBACK[name]] || sheet.anims.idle;
      const f = frameAt(anim, game.time, anim.speed);
      const right = r.facing > 0;
      const x = Math.round(lerp(r.prevX, r.x, alpha) + r.w / 2 - (right ? f.ax : f.w - f.ax));
      const y = Math.round(lerp(r.prevY, r.y, alpha) + r.h - f.ay + 2);
      this.drawHero(right ? f.right : f.left, x, y, f, r.shrink, r.bubble);
      if (leader === r.id) this.crown(x + f.w / 2, y - 26, game.time);
      if (r.carry >= 0) this.flag(x + f.w / 2 + 4, y + 8, r.carry, game.time, 0.6);
      arcadeText(ctx, r.name, x + f.w / 2, y - 16, { size: 9, align: 'center', shadow: false, top: '#ffffff', bottom: r.color });
    }
    if (party.carry >= 0 && !game.player.dead) {
      const p = game.player;
      this.flag(lerp(p.prevX, p.x, alpha) + p.w / 2 + 6, lerp(p.prevY, p.y, alpha) + 4, party.carry, game.time, 0.6);
    }
  }

  // A little gold crown centred at (x, y).
  crown(x, y, t) {
    const ctx = this.ctx;
    const yy = Math.round(y + Math.sin(t / 10) * 1.5);
    ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 8, yy + 6); ctx.lineTo(x - 8, yy - 2); ctx.lineTo(x - 4, yy + 2); ctx.lineTo(x, yy - 4);
    ctx.lineTo(x + 4, yy + 2); ctx.lineTo(x + 8, yy - 2); ctx.lineTo(x + 8, yy + 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff4a6a'; ctx.fillRect(Math.round(x) - 1, yy + 1, 2, 2);
  }

  // A team flag on its pole, its foot at (x, y).
  flag(x, y, team, t, scale = 1) {
    const ctx = this.ctx;
    const h = 40 * scale;
    ctx.fillStyle = '#d8d0c0';
    ctx.fillRect(Math.round(x - 1), Math.round(y - h), 2, Math.round(h));
    ctx.fillStyle = team ? '#ff4a4a' : '#4a9aff';
    ctx.beginPath();
    const w = 22 * scale; const top = y - h;
    ctx.moveTo(x + 1, top);
    for (let i = 0; i <= 4; i++) ctx.lineTo(x + 1 + (w * i) / 4, top + Math.sin(t * 0.15 + i) * 2 * scale);
    for (let i = 4; i >= 0; i--) ctx.lineTo(x + 1 + (w * i) / 4, top + 12 * scale + Math.sin(t * 0.15 + i) * 2 * scale);
    ctx.closePath();
    ctx.fill();
  }

  // Party HUD: your goal (gems, roasts, laps or flags), the clock or the
  // truce countdown, everyone's standing, the kill feed, and the knock-out
  // and result screens.
  partyHud(game) {
    const ctx = this.ctx;
    const party = game.party;
    const w = this.w;
    const unit = { treasure: 'GEMS', battle: 'ROASTS', race: 'LAPS', ctf: 'FLAGS' }[party.mode];
    // Your progress, top left.
    const mine = party.mode === 'treasure' ? game.gems : party.mode === 'battle' ? party.roasts : party.mode === 'race' ? party.laps : party.captures[party.team];
    if (party.mode === 'treasure') this.centred(this.art.items.anims.gemRed.frames[0], 18, 18);
    arcadeText(ctx, `${mine} / ${party.goal}`, party.mode === 'treasure' ? 38 : 8, 8, { size: 18, top: '#ffffff', bottom: party.mode === 'treasure' && mine >= party.goal ? '#7aff9a' : party.color });
    arcadeText(ctx, party.mode === 'ctf' ? tr('{0} TEAM', tr(TEAMS[party.team].name)) : tr(unit), 8, 30, { size: 9, shadow: false, top: '#e8d8ff', bottom: party.mode === 'ctf' ? TEAMS[party.team].color : '#c8b8f0' });
    if (party.mode === 'treasure' && mine >= party.goal) arcadeText(ctx, tr('FIND THE EXIT!'), 8, 42, { size: 10, shadow: false, top: '#ffffff', bottom: '#7aff9a' });
    if (party.mode === 'ctf') {
      arcadeText(ctx, `${tr('BLUE')} ${party.captures[0]} - ${party.captures[1]} ${tr('RED')}`, w / 2, 26, { size: 11, align: 'center', top: '#ffffff', bottom: '#ffd54a' });
    }
    // The clock, or the countdown to the fight.
    const secs = Math.floor((party.truce || party.clock) / SECOND);
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (party.truce > 0) {
      arcadeText(ctx, tr('FIGHT IN {0}', clock), w / 2, 6, { size: 14, align: 'center', top: '#ffffff', bottom: '#ffb04a' });
      arcadeText(ctx, tr('NO FIGHTING YET'), w / 2, 22, { size: 9, align: 'center', shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' });
      // The last three seconds, big.
      const left = Math.ceil(party.truce / SECOND);
      if (left <= 3) {
        const k = (party.truce % SECOND) / SECOND;
        arcadeText(ctx, String(left), w / 2, 110 - k * 10, { size: Math.round(40 + k * 30), align: 'center', alpha: 0.4 + k * 0.6, top: '#ffffff', bottom: '#ff5a5a' });
      }
    } else arcadeText(ctx, clock, w / 2, 6, { size: 14, align: 'center', top: '#ffffff', bottom: '#cfe6ff' });
    // Standings, top right under the hearts.
    party.standings(game).forEach((row, i) => {
      const y = 30 + i * 12;
      ctx.fillStyle = row.color; ctx.fillRect(w - 112, y + 3, 6, 6);
      arcadeText(ctx, row.name, w - 102, y, { size: 9, shadow: false, top: row.me ? '#ffffff' : '#e0d8f0', bottom: row.dead ? '#8a7ab0' : row.color });
      arcadeText(ctx, String(row.value), w - 8, y, { size: 9, align: 'right', shadow: false, top: '#ffffff', bottom: '#ffd54a' });
    });
    // The item held (FIRE uses it).
    if (party.items.held) {
      const it = ITEMS[party.items.held];
      this.centred(boxSprite(), w / 2 - 70, VIEW_H - 22);
      arcadeText(ctx, tr(it.name), w / 2 - 52, VIEW_H - 30, { size: 11, top: '#ffffff', bottom: it.color });
      arcadeText(ctx, tr('FIRE TO USE'), w / 2 - 52, VIEW_H - 16, { size: 8, shadow: false, top: '#e8d8ff', bottom: '#c8b8f0' });
    }
    // Hit by a pie: cream all over the screen, slowly sliding off.
    if (party.items.pie > 0) {
      const a = Math.min(1, party.items.pie / 40);
      const slide = (210 - party.items.pie) * 0.3;
      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = '#fff6e8';
      for (let i = 0; i < 9; i++) {
        const cx = ((i * 97) % w) + 20; const cy = ((i * 61) % 260) + 40 + slide;
        ctx.beginPath(); ctx.ellipse(cx, cy, 46 + (i % 3) * 14, 30 + (i % 2) * 12, i, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Kill feed.
    party.feed.forEach((f, i) => {
      arcadeText(ctx, f.text, w - 8, 98 + i * 12, { size: 9, align: 'right', shadow: false, alpha: Math.min(1, (360 - f.t) / 60), top: '#ffffff', bottom: '#ffb0c0' });
    });
    if (party.respawn > 0) {
      this.dim(0.45);
      arcadeText(ctx, tr('KNOCKED OUT!'), w / 2, 130, { size: 26, align: 'center', top: '#ffd0d8', bottom: '#e8244a' });
      arcadeText(ctx, tr('Back in {0}', Math.ceil(party.respawn / 70)), w / 2, 170, { size: 16, align: 'center' });
    }
    if (party.result) {
      this.dim(0.7);
      const res = party.result;
      const text = res.left ? tr('GAME OVER') : res.team !== undefined ? tr('{0} TEAM WINS!', tr(TEAMS[res.team].name))
        : res.winner === party.id ? tr('YOU WIN!') : tr('{0} WINS!', party.nameOf(res.winner));
      const good = res.winner === party.id || (res.team !== undefined && res.team === party.team);
      // Confetti for everyone.
      for (let i = 0; i < 60; i++) {
        const cx = (i * 53 + game.time * (1 + (i % 3))) % w;
        const cy = ((i * 37 + game.time * (1.5 + (i % 4) * 0.5)) % (VIEW_H + 20)) - 10;
        ctx.fillStyle = ['#ff5a5a', '#ffd54a', '#5ae08a', '#6ab8ff', '#c48aff'][i % 5];
        ctx.fillRect(Math.round(cx), Math.round(cy), 4, 3 + (i % 3));
      }
      arcadeText(ctx, text, w / 2, 70, { size: 30, align: 'center', top: good ? '#fff6c0' : '#ffd0d8', bottom: good ? '#ffb02e' : '#e8244a' });
      party.standings(game).forEach((row, i) => {
        const y = 118 + i * 18;
        arcadeText(ctx, `${i + 1}. ${row.name}`, w / 2 - 90, y, { size: 13, top: '#ffffff', bottom: row.color });
        arcadeText(ctx, `${row.value} ${tr(unit)}`, w / 2 + 110, y, { size: 13, align: 'right', top: '#ffffff', bottom: '#ffd54a' });
      });
      arcadeText(ctx, tr('Press ENTER for the menu'), w / 2, 230, { size: 13, align: 'center', alpha: Math.floor(game.time / 25) % 2 ? 1 : 0.4 });
    }
  }

  dim(alpha) {
    this.ctx.fillStyle = `rgba(8,4,18,${alpha})`;
    this.ctx.fillRect(0, 0, this.w, VIEW_H);
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
    // Score, top-left (party games show their goal there instead).
    if (!game.party) arcadeText(ctx, String(game.score).padStart(8, '0'), 8, 6, { size: 18, top: '#ffffff', bottom: '#ffc04a' });
    // Hearts, top-right.
    for (let i = 0; i < PLAYER.maxHealth; i++) this.heart(this.w - 26 - (PLAYER.maxHealth - 1 - i) * 20, 8, i < p.health);
    // Gems and coins under the score (in party games the gem bars show them).
    const items = this.art.items.anims;
    if (!game.party) {
      this.centred(items.gemRed.frames[0], 18, 40);
      arcadeText(ctx, `${game.gems}`, 32, 32, { size: 12, top: '#ffffff', bottom: '#ffb0c0' });
      this.centred(items.coinSilver.frames[0], 84, 40);
      arcadeText(ctx, `${game.coins}`, 96, 32, { size: 12, top: '#ffffff', bottom: '#ffe08a' });
    }
    if (p.fastFeet > 0) {
      this.centred(this.art.beta.anims.speedShoes.frames[0], 210, 40);
      arcadeText(ctx, `${Math.ceil(p.fastFeet / 70)}`, 226, 32, { size: 12, top: '#ffffff', bottom: '#7ae8ff' });
    }
    if (p.shield > 0) {
      this.centred(items[{ fire: 'shieldMonitor', bubble: 'monShieldWater', plasma: 'monShieldPlasma' }[p.shieldType] || 'shieldMonitor'].frames[0], 146, 40);
      arcadeText(ctx, `${Math.ceil(p.shield / 70)}`, 162, 32, { size: 12, top: '#ffffff', bottom: '#ff9a3a' });
    }
    // Food meter toward a sugar rush.
    if (!game.party && (game.food > 0 || p.rush > 0)) {
      const w = 90;
      const fill = p.rush > 0 ? p.rush / PHYS.rushTicks : game.food / PHYS.foodForRush;
      ctx.fillStyle = '#1a0b1e'; ctx.fillRect(this.w / 2 - w / 2 - 2, 8, w + 4, 10);
      const g = ctx.createLinearGradient(this.w / 2 - w / 2, 0, this.w / 2 + w / 2, 0);
      if (p.rush > 0) { for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + game.time * 6) % 360},100%,60%)`); }
      else { g.addColorStop(0, '#ff7ac0'); g.addColorStop(1, '#ffd54a'); }
      ctx.fillStyle = g; ctx.fillRect(this.w / 2 - w / 2, 10, Math.round(w * fill), 6);
      this.centred(this.art.items.anims.food.frames[4], this.w / 2 - w / 2 - 14, 13);
      if (p.rush === 0) arcadeText(ctx, `${game.food}`, this.w / 2 + w / 2 + 6, 7, { size: 10, top: '#ffffff', bottom: '#ffb0d8' });
    }
    // Measured: a sugar rush shows its seconds left, blinking in the last 140 ticks.
    if (p.rush > 0 && (p.rush > 140 || game.time % 8 < 5)) {
      arcadeText(ctx, `${Math.ceil(p.rush / 70)}`, this.w / 2, 24, { size: 22, align: 'center', top: '#ffffff', bottom: `hsl(${(game.time * 6) % 360},100%,65%)` });
    }
    // Lives, bottom-left.
    const face = this.art.tinted(p.character, game.party && game.party.tint).anims.icon.frames[0].right;
    ctx.drawImage(face, 6, VIEW_H - face.height - 6);
    if (!game.party) arcadeText(ctx, `x${Math.max(0, game.lives)}`, 44, VIEW_H - 30, { size: 16, top: '#ffffff', bottom: '#ffb04a' });
    // Weapon and ammo, bottom-right (the name shows for a moment after a switch).
    const wpn = WEAPONS[p.weapon];
    const iconName = p.weapon === 1 && p.character === 'spaz' ? (p.powered[1] ? 'ammoBlasterSpazP' : 'ammoBlasterSpaz') : p.powered[p.weapon] ? wpn.iconP : wpn.icon;
    this.centred(frameAt(this.art.items.anims[iconName], game.time, 6), this.w - 86, VIEW_H - 22);
    if (p.shotDelay < PLAYER.shotDelay) {
      // One gun icon per Fastfire collected.
      const n = Math.round((PLAYER.shotDelay - p.shotDelay) / PLAYER.fastfireStep);
      for (let i = 0; i < Math.min(n, 10); i++) ctx.drawImage(this.art.items.anims.fastfire.frames[0].right, this.w - 100 - i * 9, VIEW_H - 50, 12, 12);
    }
    const ammo = p.weapon === 1 ? 'x∞' : `x${p.ammo[p.weapon]}`;
    arcadeText(ctx, ammo, this.w - 70, VIEW_H - 30, { size: 16, top: '#ffffff', bottom: p.powered[p.weapon] ? '#ffd54a' : '#7ae8ff' });
    if (p.weaponShown > 0) {
      arcadeText(ctx, wpn.name, this.w - 8, VIEW_H - 66, { size: 12, align: 'right', alpha: Math.min(1, p.weaponShown / 20), top: '#ffffff', bottom: '#ffd54a' });
    }
    // Combo meter while a combo is running.
    if (game.comboMult > 1 && game.comboTimer > 0) {
      const a = Math.min(1, game.comboTimer / 30);
      arcadeText(ctx, tr('COMBO x{0}', game.comboMult), this.w - 8, 32, { size: 14, align: 'right', alpha: a, top: '#ffffff', bottom: '#ff5ad8' });
      ctx.fillStyle = `rgba(255,90,216,${a})`;
      ctx.fillRect(this.w - 8 - Math.round(game.comboTimer * 0.7), 50, Math.round(game.comboTimer * 0.7), 3);
    }
    // Hint sign text, in a box near the bottom.
    if (game.hintText && game.state === 'play') {
      ctx.font = '12px "Arial Black", Impact, sans-serif';
      const lines = game.hintText.split('\n');
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24;
      const h = lines.length * 16 + 12;
      ctx.fillStyle = 'rgba(10,4,26,0.8)';
      ctx.fillRect(this.w / 2 - w / 2, VIEW_H - 54 - h, w, h);
      ctx.strokeStyle = '#ffd54a';
      ctx.strokeRect(this.w / 2 - w / 2 + 0.5, VIEW_H - 54 - h + 0.5, w - 1, h - 1);
      lines.forEach((l, i) => arcadeText(ctx, l, this.w / 2, VIEW_H - 48 - h + i * 16, { size: 12, align: 'center', shadow: false, top: '#ffffff', bottom: '#cfe6ff' }));
    }
    if (game.party) this.partyHud(game);
    // Boss health, top centre, while a boss fight is on.
    const boss = game.activeBoss;
    if (boss && !boss.dead && boss.maxHp > 1) {
      const w = 200; const x = this.w / 2 - w / 2; const y = 26;
      ctx.fillStyle = 'rgba(10,4,26,0.8)'; ctx.fillRect(x - 3, y - 3, w + 6, 12);
      const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#ff3a5a'); g.addColorStop(1, '#ffb02e');
      ctx.fillStyle = g; ctx.fillRect(x, y, Math.round((w * Math.max(0, boss.hp)) / boss.maxHp), 6);
      arcadeText(ctx, boss.name.replace('!', ''), this.w / 2, y + 10, { size: 10, align: 'center', top: '#ffffff', bottom: '#ffb0c0' });
    }
    // Level banner.
    if (game.bannerTime > 0 && game.state === 'play') {
      const a = Math.min(1, game.bannerTime / 30);
      const s = 1 + Math.max(0, (game.bannerTime - 140) / 20);
      arcadeText(ctx, tr(game.bannerText), this.w / 2, 70, { size: Math.round(24 * s), align: 'center', alpha: a });
    }
  }
}
