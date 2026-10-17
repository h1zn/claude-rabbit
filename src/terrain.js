// Terrain pre-renderer: paints the level's solid ground per pixel into 512 px
// chunks (built lazily), so rock, caps, slopes and edges are seamless.

import { TILE } from './config.js';
import { SLOPES } from './level.js';
import { cells, fbm, hash2, hex, makeCanvas, ramp } from './paint.js';
import { tilePixel } from './sheets.js';
import { THEME_TILESET } from './tilesets.js';

const CHUNK = 512;

export const TERRAIN_THEMES = {
  meadow: {
    rock: ramp(['#2a1206', '#5a2e12', '#8a4e22', '#b47a3e', '#d8a868'], 7),
    crack: '#1a0a04',
    cap: ramp(['#0e4a14', '#1e7a24', '#3aa83a', '#6ad04e', '#b8f070'], 6),
    capDepth: 9,
    stone: ramp(['#26304a', '#46587e', '#6a80aa', '#9ab0d8', '#cfdcf4'], 6),
    blades: ['#1e7a24', '#3aa83a', '#6ad04e', '#b8f070'],
    over: 'grass',
  },
  winter: {
    rock: ramp(['#1e0c0a', '#4a2416', '#7a4226', '#a8683e', '#cc9462'], 7),
    crack: '#120604',
    cap: ramp(['#6a7ab8', '#9eb2e4', '#cfdcf8', '#eef4ff', '#ffffff'], 6),
    capDepth: 10,
    stone: ramp(['#1e2a44', '#3a4e78', '#5e78a8', '#94acd6', '#d4e2f8'], 6),
    blades: ['#cfdcf8', '#eef4ff', '#ffffff'],
    over: 'snow',
  },
  crystal: {
    rock: ramp(['#120626', '#2a1250', '#46227a', '#6a3ea4', '#9a6ad0'], 7),
    crack: '#0a0418',
    cap: ramp(['#0a4a6a', '#1a8ab0', '#3ad0f0', '#a8f4ff', '#ffffff'], 6),
    capDepth: 6,
    stone: ramp(['#1a1a34', '#34365e', '#545890', '#8288c0', '#c0c4ec'], 6),
    blades: ['#3ad0f0', '#a8f4ff', '#ff8ae0'],
    over: 'crystal',
  },
};

// Themes drawn from a tileset borrow a palette for stone blocks and ledges.
TERRAIN_THEMES.castle = { ...TERRAIN_THEMES.meadow, stone: TERRAIN_THEMES.winter.stone };
TERRAIN_THEMES.town = TERRAIN_THEMES.meadow;
TERRAIN_THEMES.tube = { ...TERRAIN_THEMES.crystal };
TERRAIN_THEMES.grove = TERRAIN_THEMES.crystal;
TERRAIN_THEMES.candy = TERRAIN_THEMES.winter;
TERRAIN_THEMES.forge = TERRAIN_THEMES.meadow;

const BACK_DIM = 0.5;

export class TerrainRenderer {
  constructor(level, themeName, sprites) {
    this.level = level;
    this.theme = TERRAIN_THEMES[themeName];
    this.themeName = themeName;
    this.sprites = sprites;
    this.chunks = new Map();
    this.jobs = new Map();   // chunks being painted in the background
    // Ground drawn from a tileset when the theme has one.
    const tsName = THEME_TILESET[themeName];
    this.tileset = tsName && sprites.tilesets ? sprites.tilesets[tsName] : null;
    this.cols = Math.ceil(level.pixelW / CHUNK);
    this.rows = Math.ceil(level.pixelH / CHUNK);
    this.platform = this.paintPlatform();
  }

  // Material at a world pixel: 0 air, 1 ground, 2 stone.
  material(px, py) {
    if (px < 0 || py < 0 || px >= this.level.pixelW || py >= this.level.pixelH) return py >= this.level.pixelH ? 0 : 0;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const ch = this.level.tiles[ty][tx];
    if (ch === '#') return 1;
    if (ch === '=') return 2;
    const fn = SLOPES[ch];
    if (fn) return py - ty * TILE >= fn(px - tx * TILE) ? 1 : 0;
    return 0;
  }

  // A chunk's canvas, painted now if it isn't ready (finishing any
  // background job for it first).
  chunk(cx, cy) {
    const key = cx + cy * 1000;
    let c = this.chunks.get(key);
    if (!c) {
      const job = this.jobs.get(key) || this.startChunk(cx, cy);
      this.stepChunk(job, CHUNK);
      c = this.finishChunk(job);
    }
    return c;
  }

  // Chunks are painted column by column, so background painting can be
  // spread over several frames.
  startChunk(cx, cy) {
    const canvas = makeCanvas(CHUNK, CHUNK);
    const ctx = canvas.getContext('2d');
    const job = { key: cx + cy * 1000, canvas, ctx, img: ctx.createImageData(CHUNK, CHUNK), ox: cx * CHUNK, oy: cy * CHUNK, x: 0, capPx: [], underPx: [] };
    this.jobs.set(job.key, job);
    return job;
  }

  finishChunk(job) {
    job.ctx.putImageData(job.img, 0, 0);
    if (!this.tileset) this.overhangs(job.ctx, job.capPx, job.underPx, job.ox, job.oy);
    this.props(job.ctx, job.ox, job.oy);
    this.jobs.delete(job.key);
    this.chunks.set(job.key, job.canvas);
    return job.canvas;
  }

  // Paint up to `cols` more pixel columns of a chunk.
  stepChunk(job, cols) {
    const d = job.img.data;
    const t = this.theme;
    const { ox, oy, capPx, underPx } = job;
    const end = Math.min(CHUNK, job.x + cols);
    for (let x = job.x; x < end; x++) {
      const wx = ox + x;
      if (wx >= this.level.pixelW) break;
      // Find the run start for the first pixel by scanning up a little.
      let runTop = -1e9;
      let prev = this.material(wx, oy - 1);
      if (prev) {
        let y = oy - 1;
        while (y > oy - 40 && this.material(wx, y - 1) === prev) y--;
        runTop = this.material(wx, y - 1) ? -1e9 : y;
      }
      for (let y = 0; y < CHUNK; y++) {
        const wy = oy + y;
        const m = this.material(wx, wy);
        if (m && !prev) {
          runTop = wy;
          if (y > 0 || this.material(wx, wy - 1) === 0) capPx.push([x, y, m]);
        } else if (!m && prev && y > 0) {
          underPx.push([x, y]);
        }
        prev = m;
        if (!m) {
          const back = this.level.back[Math.floor(wy / TILE)]?.[Math.floor(wx / TILE)];
          if (back) this.backPixel(d, (y * CHUNK + x) * 4, wx, wy, back);
          continue;
        }
        const depth = wy - runTop;
        const i = (y * CHUNK + x) * 4;
        // Rough underside where ground hangs over air (floating masses).
        const ly = wy % TILE;
        let shade = 1;
        if (ly >= TILE - 10 && depth >= 12 && this.overAir(wx, wy)) {
          const jag = 3 + Math.floor(hash2(wx >> 2, Math.floor(wy / TILE), 61) * 7);
          if (ly >= TILE - jag) {
            prev = 0;
            if (this.level.back[Math.floor(wy / TILE)]?.[Math.floor(wx / TILE)] || this.level.back[Math.floor(wy / TILE) + 1]?.[Math.floor(wx / TILE)]) this.backPixel(d, i, wx, wy);
            continue;
          }
          shade = ly >= TILE - jag - 4 ? 0.55 : 0.8;
        }
        if (this.tileset) {
          const k = m === 2 && this.tileset.stone ? this.stonePixel(wx, wy, depth) : this.tilePixel(wx, wy, depth);
          const td = this.tileset.pixels.data;
          if (td[k + 3] === 0) continue;
          // Ground darkens with depth, so big masses read as volume rather
          // than a flat sheet of texture.
          if (depth > 40) shade *= Math.max(0.58, 1 - (depth - 40) / 520);
          // Rim light on left edges, shade on right edges: reads as solid.
          if (depth > 6) {
            if (!this.material(wx + 1, wy)) shade *= 0.6;
            else if (!this.material(wx + 3, wy)) shade *= 0.82;
            else if (!this.material(wx - 1, wy)) shade *= 1.25;
          }
          d[i] = Math.min(255, td[k] * shade); d[i + 1] = Math.min(255, td[k + 1] * shade); d[i + 2] = Math.min(255, td[k + 2] * shade); d[i + 3] = 255;
          continue;
        }
        const color = m === 2 ? this.stoneColor(wx, wy, depth) : this.groundColor(wx, wy, depth);
        let [r, g, b] = hex(color);
        // Darken pixels near exposed side edges for depth.
        const side = (!this.material(wx - 1, wy) || !this.material(wx + 1, wy)) ? 0.62
          : (!this.material(wx - 2, wy) || !this.material(wx + 2, wy)) ? 0.8
            : (!this.material(wx - 3, wy) || !this.material(wx + 3, wy)) ? 0.9 : 1;
        if (side < 1 && depth >= t.capDepth) { r *= side; g *= side; b *= side; }
        r *= shade; g *= shade; b *= shade;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    job.x = end;
    return job.x >= CHUNK;
  }

  // True when the tile below this ground pixel's tile is open air.
  overAir(wx, wy) {
    const tx = Math.floor(wx / TILE); const ty = Math.floor(wy / TILE) + 1;
    if (ty >= this.level.h) return false;
    const ch = this.level.tiles[ty][tx];
    return ch !== '#' && ch !== '=' && !SLOPES[ch];
  }

  // Dimmed back wall behind caves and interiors.
  backPixel(d, i, wx, wy, kind = 1) {
    let r; let g; let b; let k = BACK_DIM;
    // Terrain casts a soft drop shadow down-right onto the back wall.
    const shadow = this.material(wx - 7, wy - 9) ? 0.5 : this.material(wx - 4, wy - 5) ? 0.72 : 1;
    if (kind === 2 && this.tileset?.stone) {
      const j = this.stonePixel(wx, wy, 999);
      const td = this.tileset.pixels.data;
      k = 0.62 * shadow;
      d[i] = td[j] * k; d[i + 1] = td[j + 1] * k; d[i + 2] = td[j + 2] * k; d[i + 3] = 255;
      return;
    }
    if (this.tileset) {
      const ts = this.tileset;
      const tx = Math.floor(wx / 32); const ty = Math.floor(wy / 32);
      let id;
      if (ts.backBlock) {
        const rows = ts.backBlock.length; const cols = ts.backBlock[0].length;
        id = ts.backBlock[ty % rows][tx % cols];
      } else if (ts.backList) {
        id = ts.backList[Math.floor(hash2(tx, ty, 17) * ts.backList.length)];
      } else {
        id = null;
        k = BACK_DIM * 0.7;
      }
      const j = id === null ? this.tilePixel(wx, wy, 999) : tilePixel(ts.pixels, id, wx % 32, wy % 32);
      const td = ts.pixels.data;
      if (td[j + 3] === 0) { r = 20; g = 10; b = 30; } else { r = td[j]; g = td[j + 1]; b = td[j + 2]; }
    } else {
      [r, g, b] = hex(this.groundColor(wx, wy, 200));
      k = BACK_DIM * 0.8;
    }
    k *= shadow;
    d[i] = r * k; d[i + 1] = g * k; d[i + 2] = b * k; d[i + 3] = 255;
  }

  // Tileset pixel for a stone block ('='): its own cap (e.g. roof tiles) over
  // its own fill (e.g. plaster walls).
  stonePixel(wx, wy, depth) {
    const st = this.tileset.stone;
    const lx = ((wx % 32) + 32) % 32; const ly = ((wy % 32) + 32) % 32;
    const tx = Math.floor(wx / 32); const ty = Math.floor(wy / 32);
    if (depth < 32) return tilePixel(this.tileset.pixels, st.cap[tx % st.cap.length], lx, depth);
    return tilePixel(this.tileset.pixels, st.fill[Math.floor(hash2(tx, ty, 23) * st.fill.length)], lx, ly);
  }

  // Tileset pixel for ground at (wx, wy), `depth` px below its surface. The cap
  // run is laid along the surface one pixel column at a time, so it bends
  // with slopes; below it, fill tiles keep their grid alignment.
  tilePixel(wx, wy, depth) {
    const ts = this.tileset;
    const capW = ts.cap.length * 32;
    if (depth < 32) {
      const cx = ((wx % capW) + capW) % capW;
      return tilePixel(ts.pixels, ts.cap[Math.floor(cx / 32)], cx % 32, depth);
    }
    const tx = Math.floor(wx / 32); const ty = Math.floor(wy / 32);
    let id;
    if (ts.fillBlock) {
      const rows = ts.fillBlock.length; const cols = ts.fillBlock[0].length;
      id = ts.fillBlock[((ty % rows) + rows) % rows][((tx % cols) + cols) % cols];
    } else {
      id = ts.fillList[Math.floor(hash2(tx, ty, 13) * ts.fillList.length)];
    }
    return tilePixel(ts.pixels, id, ((wx % 32) + 32) % 32, ((wy % 32) + 32) % 32);
  }

  groundColor(wx, wy, depth) {
    const t = this.theme;
    // Uneven cap thickness along the surface.
    const capH = t.capDepth + Math.round((fbm(wx * 0.08, 0.5, 11) - 0.5) * 6);
    if (depth < capH) {
      const k = 1 - depth / capH;
      const n = (hash2(wx, wy, 5) - 0.5) * 0.25;
      return t.cap[Math.max(0, Math.min(t.cap.length - 1, Math.round((k * 0.85 + 0.12 + n) * (t.cap.length - 1))))];
    }
    if (depth < capH + 3) return t.rock[0];
    // Rounded boulders: Voronoi cells lit from the top-left, dark cracks.
    const c = cells(wx, wy, 15, 3);
    if (c.d2 - c.d1 < 1.6) return t.crack;
    const light = (-c.ox * 0.55 - c.oy * 0.8) / 15;
    const base = 2 + Math.floor(c.id * 3);
    const deep = Math.min(1, (depth - capH) / 120);
    const k = Math.round(base + light * 2.4 - deep * 1.2 + (hash2(wx, wy, 7) - 0.5) * 0.8);
    return t.rock[Math.max(0, Math.min(t.rock.length - 1, k))];
  }

  stoneColor(wx, wy, depth) {
    const t = this.theme;
    const row = Math.floor(wy / 16);
    const off = (row % 2) * 16;
    const lx = (wx + off) % 32;
    const ly = wy % 16;
    if (lx === 0 || ly === 0) return t.stone[0];
    if (lx === 1 || ly === 1) return t.stone[4];
    if (lx === 31 || ly === 15) return t.stone[1];
    const n = fbm(wx * 0.2, wy * 0.2, 21);
    const k = Math.round(2 + (n - 0.5) * 2 + (depth < 4 ? 1 : 0));
    return t.stone[Math.max(1, Math.min(4, k))];
  }

  overhangs(ctx, capPx, underPx, ox, oy) {
    const t = this.theme;
    for (const [x, y, m] of capPx) {
      if (m !== 1) continue;
      const wx = ox + x;
      const r = hash2(wx, 0, 31);
      if (t.over === 'grass') {
        const h = 1 + Math.floor(r * 4);
        for (let k = 1; k <= h; k++) {
          ctx.fillStyle = t.blades[Math.min(t.blades.length - 1, Math.floor((k / h) * t.blades.length))];
          ctx.fillRect(x + ((k > 2 && r > 0.5) ? 1 : 0), y - k, 1, 1);
        }
        if (r > 0.985) {
          ctx.fillStyle = ['#ff5a7a', '#ffd54a', '#ffffff'][Math.floor(r * 1000) % 3];
          ctx.fillRect(x - 1, y - h - 2, 3, 2);
        }
      } else if (t.over === 'snow') {
        const h = Math.round(1 + fbm(wx * 0.15, 3, 41) * 3);
        for (let k = 1; k <= h; k++) {
          ctx.fillStyle = k === h ? '#ffffff' : '#eef4ff';
          ctx.fillRect(x, y - k, 1, 1);
        }
      } else if (r > 0.93) {
        const h = 3 + Math.floor(r * 50) % 7;
        for (let k = 1; k <= h; k++) {
          ctx.fillStyle = t.blades[Math.floor(r * 100) % t.blades.length];
          ctx.fillRect(x, y - k, k > h - 2 ? 1 : 2, 1);
        }
      }
    }
    if (t.over === 'snow') {
      for (const [x, y] of underPx) {
        const wx = ox + x;
        const r = hash2(wx, oy + y, 51);
        if (r < 0.88) continue;
        const len = 3 + Math.floor(r * 80) % 9;
        for (let k = 0; k < len; k++) {
          ctx.fillStyle = k < len / 2 ? '#cfe6ff' : '#9ec4f0';
          ctx.fillRect(x, y + k, k < len * 0.6 ? 2 : 1, 1);
        }
      }
    }
  }

  // Static props baked into the chunk: one-way platforms and spikes.
  props(ctx, ox, oy) {
    const level = this.level;
    const tx0 = Math.floor(ox / TILE); const ty0 = Math.floor(oy / TILE);
    const spikes = this.sprites.spikes[this.themeName] || this.sprites.spikes.meadow;
    for (let ty = ty0; ty < ty0 + CHUNK / TILE && ty < level.h; ty++) {
      for (let tx = tx0; tx < tx0 + CHUNK / TILE && tx < level.w; tx++) {
        const ch = level.tiles[ty][tx];
        const x = tx * TILE - ox; const y = ty * TILE - oy;
        if (ch === '-') {
          const ledge = this.tileset?.ledge;
          if (ledge) {
            const id = ledge[tx % ledge.length];
            ctx.drawImage(this.tileset.pixels.image, (id % 10) * 32, Math.floor(id / 10) * 32, 32, 32, x, y, 32, 32);
          } else ctx.drawImage(this.platform, x, y);
        }
        else if (ch === '^') ctx.drawImage(spikes, x, y + TILE / 2);
      }
    }
  }

  paintPlatform() {
    const c = makeCanvas(TILE, 14);
    const ctx = c.getContext('2d');
    const t = this.theme;
    const wood = this.themeName === 'meadow'
      ? ramp(['#3a1e0a', '#7a4a1e', '#b8803e', '#e8b878'], 5)
      : this.themeName === 'winter' ? ramp(['#3a4e78', '#7a9ac8', '#cfe2ff', '#ffffff'], 5) : t.stone;
    for (let y = 0; y < 9; y++) {
      ctx.fillStyle = wood[y === 0 ? 4 : y === 1 ? 3 : y === 8 ? 0 : 2];
      ctx.fillRect(0, y, TILE, 1);
    }
    ctx.fillStyle = wood[0];
    ctx.fillRect(10, 1, 1, 8); ctx.fillRect(24, 1, 1, 8);
    ctx.fillRect(3, 9, 3, 5); ctx.fillRect(26, 9, 3, 5);
    return c;
  }

  // Draw the visible chunks.
  draw(ctx, camX, camY, viewW, viewH) {
    const c0 = Math.max(0, Math.floor(camX / CHUNK));
    const c1 = Math.min(this.cols - 1, Math.floor((camX + viewW) / CHUNK));
    const r0 = Math.max(0, Math.floor(camY / CHUNK));
    const r1 = Math.min(this.rows - 1, Math.floor((camY + viewH) / CHUNK));
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) ctx.drawImage(this.chunk(cx, cy), cx * CHUNK - camX, cy * CHUNK - camY);
    }
    // Paint the next chunk around the view a slice at a time (a few ms per
    // frame), so chunks are usually ready before they scroll in.
    for (let cy = Math.max(0, r0 - 1); cy <= Math.min(this.rows - 1, r1 + 1); cy++) {
      for (let cx = Math.max(0, c0 - 1); cx <= Math.min(this.cols - 1, c1 + 1); cx++) {
        const key = cx + cy * 1000;
        if (this.chunks.has(key)) continue;
        const job = this.jobs.get(key) || this.startChunk(cx, cy);
        if (this.stepChunk(job, 48)) this.finishChunk(job);
        return;
      }
    }
  }

  // Pre-build the chunks around a point so play starts without a hitch.
  warm(px, py) {
    const cx = Math.floor(px / CHUNK); const cy = Math.floor(py / CHUNK);
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 2; x++) {
      if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) this.chunk(x, y);
    }
  }
}
