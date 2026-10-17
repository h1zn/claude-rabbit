// Draws an original JJ2 level's eight layers from its tile set: layers 8-4
// behind the sprites, 3-1 in front, each with its own parallax speed, auto
// scrolling and tiling, animated tiles, and the "warp horizon" textured
// background some levels use for layer 8.

import { TICK_MS, VIEW_H, VIEW_W } from '../config.js';
import { tilePixels } from './files.js';

const COLS = 64;            // atlas slots per row

export class JJ2View {
  constructor(level) {
    this.level = level;
    this.file = level.file;
    this.ts = level.ts;
    this.slots = new Map();   // static word key -> atlas slot
    this.keys = [];
    this.entries = [];        // animated cells: { anim, flip, slots: [] }
    this.entryOf = new Map();
    this.cells = this.file.layers.map((layer, i) => (layer.used && layer.tiles ? this.prepare(i === 3 ? level.layer : layer.tiles) : null));
    this.buildAtlas();
    this.frame = new Int32Array(this.entries.length);
    level.onBreak = (tx, ty) => this.rebake(tx, ty);
    const sky = this.file.layers[7];
    if (sky.used && sky.textured && sky.tiles) this.buildTexture(sky);
  }

  // Layer words -> per-cell codes: 0 empty, n > 0 atlas slot n - 1,
  // n < 0 animated entry -n - 1.
  prepare(tiles) {
    const out = new Int32Array(tiles.length);
    for (let i = 0; i < tiles.length; i++) out[i] = this.code(tiles[i]);
    return out;
  }

  code(word) {
    if (!word) return 0;
    const max = this.file.maxTiles;
    const flip = (word & max ? 1 : 0) | (word & 0x2000 ? 2 : 0);
    const id = word & (max - 1);
    const first = max - this.file.anims.length;
    if (id >= first) {
      const key = (id - first) * 4 + flip;
      if (!this.entryOf.has(key)) {
        this.entryOf.set(key, this.entries.length);
        const anim = this.file.anims[id - first];
        this.entries.push({ anim, flip, slots: null });
      }
      return -this.entryOf.get(key) - 1;
    }
    const slot = this.slot(id, flip);
    return slot < 0 ? 0 : slot + 1;
  }

  slot(id, flip) {
    const type = this.file.tileTypes[id] || 0;
    if (!id || id >= this.ts.count || type === 3) return -1;     // empty or invisible
    const key = id * 4 + flip;
    if (!this.slots.has(key)) { this.slots.set(key, this.keys.length); this.keys.push(key); }
    return this.slots.get(key);
  }

  // Frames of an animation as atlas slots (nested animations use their first frame).
  frameSlots(anim, flip, depth = 0) {
    const max = this.file.maxTiles;
    const first = max - this.file.anims.length;
    const seq = anim.frames.map((f) => {
      const ff = flip ^ ((f & max ? 1 : 0) | (f & 0x2000 ? 2 : 0));
      let id = f & (max - 1);
      if (id >= first && depth < 4) {
        const inner = this.file.anims[id - first];
        return inner && inner.frames.length ? this.frameSlots(inner, ff, depth + 1)[0] : -1;
      }
      return this.slot(id, ff);
    });
    if (anim.pingPong && seq.length > 2) seq.push(...seq.slice(1, -1).reverse());
    return seq.length ? seq : [-1];
  }

  buildAtlas() {
    for (const e of this.entries) e.slots = this.frameSlots(e.anim, e.flip);
    // Broken destructible tiles and switched trigger scenery may show frames
    // that appear nowhere else.
    for (const word of this.level.broken.values()) this.code(word);
    for (const list of this.level.triggers.values()) for (const t of list) { this.code(t.on); this.code(t.off); }
    for (const e of this.entries) if (!e.slots) e.slots = this.frameSlots(e.anim, e.flip);
    const n = Math.max(1, this.keys.length);
    const canvas = document.createElement('canvas');
    canvas.width = COLS * 32;
    canvas.height = Math.ceil(n / COLS) * 32;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(32, 32);
    const px = new Uint8ClampedArray(4096);
    this.keys.forEach((key, s) => {
      const id = key >> 2; const flip = key & 3;
      tilePixels(this.ts, id, px);
      const translucent = this.file.tileTypes[id] === 1;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const sx = flip & 1 ? 31 - x : x; const sy = flip & 2 ? 31 - y : y;
          const a = (sy * 32 + sx) * 4; const b = (y * 32 + x) * 4;
          img.data[b] = px[a]; img.data[b + 1] = px[a + 1]; img.data[b + 2] = px[a + 2];
          img.data[b + 3] = translucent ? px[a + 3] >> 1 : px[a + 3];
        }
      }
      ctx.putImageData(img, (s % COLS) * 32, Math.floor(s / COLS) * 32);
    });
    this.atlas = canvas;
  }

  // A sprite-layer tile changed (broken, or switched by a trigger): show the
  // new one, redrawing the atlas if it needed a tile not drawn yet.
  rebake(tx, ty) {
    const i = ty * this.level.w + tx;
    const c = this.cells[3];
    const before = this.keys.length;
    const entries = this.entries.length;
    if (c) c[i] = this.code(this.level.layer[i]);
    if (this.keys.length !== before || this.entries.length !== entries) {
      for (const e of this.entries) if (!e.slots) e.slots = this.frameSlots(e.anim, e.flip);
      this.buildAtlas();
      this.frame = new Int32Array(this.entries.length);
    }
  }

  // Layer 8 as a 256x256 texture for the warp-horizon background.
  buildTexture(layer) {
    const tex = new Uint8ClampedArray(256 * 256 * 4);
    const px = new Uint8ClampedArray(4096);
    for (let ty = 0; ty < 8; ty++) {
      for (let tx = 0; tx < 8; tx++) {
        const word = layer.tiles[(ty % layer.h) * layer.w + (tx % layer.w)];
        const r = this.level.resolve(word);
        tilePixels(this.ts, r.id, px);
        for (let y = 0; y < 32; y++) {
          for (let x = 0; x < 32; x++) {
            const sx = r.flipX ? 31 - x : x; const sy = r.flipY ? 31 - y : y;
            const a = (sy * 32 + sx) * 4; const b = ((ty * 32 + y) * 256 + tx * 32 + x) * 4;
            tex[b] = px[a]; tex[b + 1] = px[a + 1]; tex[b + 2] = px[a + 2]; tex[b + 3] = 255;
          }
        }
      }
    }
    this.texture = tex;
    this.horizon = document.createElement('canvas');
    this.horizon.width = VIEW_W / 2; this.horizon.height = VIEW_H / 2;
    this.horizonImg = this.horizon.getContext('2d').createImageData(VIEW_W / 2, VIEW_H / 2);
    const c = layer.texColor;
    this.fade = c && (c[0] || c[1] || c[2]) ? c : [0, 0, 0];
  }

  // Advance animated tiles (JJ2 speeds are frames per second).
  tick(time) {
    const sec = (time * TICK_MS) / 1000;
    for (let e = 0; e < this.entries.length; e++) {
      const { anim, slots } = this.entries[e];
      if (!anim.speed || slots.length < 2) { this.frame[e] = slots[0]; continue; }
      const hold = Math.floor((anim.delay || 0) * anim.speed / 70);
      const step = Math.floor(sec * anim.speed) % (slots.length + hold);
      this.frame[e] = slots[Math.min(step, slots.length - 1)];
    }
  }

  // Top-left of a layer on screen, in layer pixels (JJ2's parallax formula).
  origin(layer, cam, time) {
    if (layer.index === 3) return [cam.x, cam.y];
    const sx = layer.speedX; const sy = layer.speedY;
    let x = cam.x * sx + (VIEW_W - 320) / 2 * (sx - 1) + layer.offX + layer.autoX * time;
    let y = cam.y * sy + (VIEW_H - 200) / 2 * (sy - 1) + layer.offY + layer.autoY * time;
    if (layer.limit) y -= (VIEW_H - 200) / 2;
    return [x, y];
  }

  drawLayer(ctx, i, cam, time) {
    const layer = this.file.layers[i];
    const cells = this.cells[i];
    if (!cells || layer.hidden) return;
    if (i === 7 && this.texture) { this.drawHorizon(ctx, cam, time); return; }
    if (layer.index === undefined) layer.index = i;
    const [ox, oy] = this.origin(layer, cam, time);
    const w = layer.w; const h = layer.h;
    const tx0 = Math.floor(ox / 32); const ty0 = Math.floor(oy / 32);
    const offX = Math.round(tx0 * 32 - ox); const offY = Math.round(ty0 * 32 - oy);
    const nx = Math.ceil(VIEW_W / 32) + 1; const ny = Math.ceil(VIEW_H / 32) + 1;
    const atlas = this.atlas;
    for (let j = 0; j < ny; j++) {
      let ty = ty0 + j;
      if (layer.tileY) ty = ((ty % h) + h) % h;
      else if (ty < 0 || ty >= h) continue;
      const row = ty * w;
      for (let k = 0; k < nx; k++) {
        let tx = tx0 + k;
        if (layer.tileX) tx = ((tx % w) + w) % w;
        else if (tx < 0 || tx >= w) continue;
        let c = cells[row + tx];
        if (!c) continue;
        const s = c > 0 ? c - 1 : this.frame[-c - 1];
        if (s < 0) continue;
        ctx.drawImage(atlas, (s % COLS) * 32, Math.floor(s / COLS) * 32, 32, 32, offX + k * 32, offY + j * 32, 32, 32);
      }
    }
  }

  // Layers behind the sprites (8 to 4, and the sprite layer) and in front of
  // them (3 to 1). MLLE levels list their layers front to back in any order.
  drawBack(ctx, cam, time) {
    this.tick(time);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const order = this.file.layerOrder;
    const sprite = order.indexOf(3);
    for (let k = order.length - 1; k >= sprite; k--) this.drawLayer(ctx, order[k], cam, time);
  }

  drawFront(ctx, cam, time) {
    const order = this.file.layerOrder;
    for (let k = order.indexOf(3) - 1; k >= 0; k--) this.drawLayer(ctx, order[k], cam, time);
  }

  // Warp horizon: the texture laid on a floor and a ceiling meeting at the
  // middle of the screen, fading into the layer's colour at the horizon.
  drawHorizon(ctx, cam, time) {
    const W = VIEW_W / 2; const H = VIEW_H / 2;
    const data = this.horizonImg.data;
    const tex = this.texture;
    const [fr, fg, fb] = this.fade;
    const layer = this.file.layers[7];
    const scrollX = cam.x * Math.max(0.25, layer.speedX) * 0.5 + layer.autoX * time;
    const scrollY = cam.y * Math.max(0.25, layer.speedY) * 0.5 + time * 0.6 + layer.autoY * time;
    for (let y = 0; y < H; y++) {
      const dy = Math.abs(y - H / 2) + 0.5;
      const z = 2600 / dy;
      const v = (Math.floor(z + (y < H / 2 ? -scrollY : scrollY)) & 255) * 256;
      const fog = Math.min(1, Math.max(0, 1 - dy / (H * 0.45)) ** 1.6);
      const du = z / (W / 2);
      let u = scrollX - (W / 2) * du;
      let o = y * W * 4;
      for (let x = 0; x < W; x++, u += du, o += 4) {
        const t = (v + (Math.floor(u) & 255)) * 4;
        data[o] = tex[t] + (fr - tex[t]) * fog;
        data[o + 1] = tex[t + 1] + (fg - tex[t + 1]) * fog;
        data[o + 2] = tex[t + 2] + (fb - tex[t + 2]) * fog;
        data[o + 3] = 255;
      }
    }
    this.horizon.getContext('2d').putImageData(this.horizonImg, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.horizon, 0, 0, VIEW_W, VIEW_H);
    ctx.imageSmoothingEnabled = false;
  }

  // Bridges (drawn in world space): planks with rope.
  drawBridges(ctx, time) {
    for (const b of this.level.bridges) {
      const y = b.ty * 32 + 10;
      for (let k = 0; k < b.len * 2; k++) {
        const x = b.tx * 32 + k * 16;
        ctx.fillStyle = '#3a2410';
        ctx.fillRect(x, y, 15, 6);
        ctx.fillStyle = k % 2 ? '#a8723a' : '#b8834a';
        ctx.fillRect(x + 1, y, 13, 4);
      }
      ctx.fillStyle = '#d8c090';
      ctx.fillRect(b.tx * 32, y - 1, b.len * 32, 1);
    }
  }

  // Water below the surface line: a tint and a moving shine.
  drawWater(ctx, cam, time) {
    const wy = this.level.water - cam.y;
    if (wy >= VIEW_H) return;
    const top = Math.max(0, wy);
    ctx.fillStyle = 'rgba(20,80,210,0.28)';
    ctx.fillRect(0, top, VIEW_W, VIEW_H - top);
    if (wy >= 0) {
      ctx.fillStyle = 'rgba(190,230,255,0.7)';
      for (let x = 0; x < VIEW_W; x += 4) ctx.fillRect(x, Math.round(wy + Math.sin((x + cam.x) / 18 + time / 9) * 2), 4, 2);
    }
  }
}
