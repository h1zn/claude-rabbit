// Tile map, collision (including slopes) and level building.

import { TILE } from './config.js';

// Tile characters
//   #  ground (solid)            =  stone (solid)           x  breakable block (solid until shot)
//   -  one-way platform          ^  spikes (hurt, not solid)
//   /  45° slope rising right    \  45° slope falling right
//   q  gentle rise, lower half   r  gentle rise, upper half
//   y  gentle fall, upper half   z  gentle fall, lower half
// Entity characters (removed from the grid when parsed)
//   P start  C checkpoint  E exit sign  S spring
//   * red gem  g green gem  b blue gem  v purple gem  $ coin  o food
//   +  health carrot  A spread-shot crate  X secret zone
//   w Bugbot  h Blobble  f Buzzwing  k Snowball (rolls)  Z boss
const SOLID = new Set(['#', '=', 'x']);
const ENTITY = new Set(['P', 'C', 'E', 'S', '*', 'g', 'b', 'v', '$', 'o', '+', 'A', 'X', 'w', 'h', 'f', 'k', 'Z']);

// Surface height (pixels from the tile's top) at local x in [0, TILE].
export const SLOPES = {
  '/': (lx) => TILE - lx,
  '\\': (lx) => lx,
  q: (lx) => TILE - lx / 2,
  r: (lx) => TILE / 2 - lx / 2,
  y: (lx) => lx / 2,
  z: (lx) => TILE / 2 + lx / 2,
};

export class Builder {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.grid = Array.from({ length: height }, () => new Array(width).fill('.'));
    this.decor = [];
    this.tops = new Array(width).fill(null);   // surface row per column (may be .5)
  }

  // Row just above the ground at a column (for standing entities).
  above(col, rows = 1) {
    return Math.ceil(this.tops[col]) - rows;
  }

  // Scenery standing on the ground at a column.
  decoAt(kind, col, opts = {}) {
    const top = this.tops[col];
    if (top === null) return this;
    return this.deco(kind, col, top, opts);
  }

  put(x, y, ch) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.grid[y][x] = ch;
    return this;
  }

  fill(x, y, w, h, ch) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, ch);
    return this;
  }

  // Solid ground from row `top` to the bottom of the map, columns [x0, x1).
  ground(x0, x1, top, ch = '#') {
    for (let c = x0; c < x1; c++) if (c >= 0 && c < this.w) this.tops[c] = top;
    return this.fill(x0, top, x1 - x0, this.h - top, ch);
  }

  // Rolling terrain from a polyline of [column, surfaceRow] points. Between
  // points the surface may change by 0, 0.5 or 1 tile per column; the right
  // slope tiles are chosen automatically. Rows may be halves (e.g. 9.5).
  profile(points) {
    for (let i = 0; i + 1 < points.length; i++) {
      const [c0, h0] = points[i];
      const [c1, h1] = points[i + 1];
      const n = c1 - c0;
      const dh = (h1 - h0) / n;
      if (![0, 0.5, -0.5, 1, -1].includes(dh)) throw new Error(`profile ${c0}->${c1}: slope ${dh} per column`);
      for (let k = 0; k < n; k++) this.column(c0 + k, h0 + dh * k, h0 + dh * (k + 1));
    }
    return this;
  }

  column(col, hl, hr) {
    if (col >= 0 && col < this.w) this.tops[col] = Math.min(hl, hr);
    const fillBelow = (row) => this.fill(col, row, 1, this.h - row, '#');
    if (hl === hr) {
      if (!Number.isInteger(hl)) throw new Error(`flat ground at half row ${hl}`);
      return fillBelow(hl);
    }
    const rise = hl - hr;
    if (rise === 1) { this.put(col, hr, '/'); return fillBelow(hr + 1); }
    if (rise === -1) { this.put(col, hl, '\\'); return fillBelow(hl + 1); }
    if (rise === 0.5) {
      if (Number.isInteger(hl)) { this.put(col, hl - 1, 'q'); return fillBelow(hl); }
      const row = Math.floor(hl);
      this.put(col, row, 'r');
      return fillBelow(row + 1);
    }
    // gentle fall
    if (Number.isInteger(hl)) { this.put(col, hl, 'y'); return fillBelow(hl + 1); }
    const row = Math.floor(hl);
    this.put(col, row, 'z');
    return fillBelow(row + 1);
  }

  plat(x, y, w) { return this.fill(x, y, w, 1, '-'); }
  block(x, y, w, h) { return this.fill(x, y, w, h, '='); }
  breakable(x, y, w, h) { return this.fill(x, y, w, h, 'x'); }
  spikes(x, y, w) { return this.fill(x, y, w, 1, '^'); }

  row(x, y, n, ch, step = 1) {
    for (let i = 0; i < n; i++) this.put(x + i * step, y, ch);
    return this;
  }

  arc(x, y, n, ch, height = 2) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.put(x + i, y - Math.round(Math.sin(t * Math.PI) * height), ch);
    }
    return this;
  }

  // Put an item on the ground at the first free column at or after `col`, so it
  // never replaces a spring, checkpoint or other object.
  onGround(col, ch) {
    for (let c = col; c < Math.min(this.w, col + 8); c++) {
      if (this.tops[c] === null || !Number.isInteger(this.tops[c])) continue;
      const r = this.tops[c] - 1;
      if (this.grid[r][c] === '.' && this.grid[r + 1][c] !== '^') return this.put(c, r, ch);
    }
    return this;
  }

  // A food trail hugging the ground surface over columns [x0, x1), skipping
  // occupied cells and spikes.
  trail(x0, x1, step = 1, ch = 'o') {
    for (let c = x0; c < x1; c += step) {
      if (c < 0 || c >= this.w || this.tops[c] === null) continue;
      let r = Math.ceil(this.tops[c]) - 1;
      while (r > 0 && '/\\qryz'.includes(this.grid[r][c])) r--;
      if (this.grid[r + 1] && this.grid[r + 1][c] === '^') continue;
      if (this.grid[r][c] === '.') this.put(c, r, ch);
    }
    return this;
  }

  // Non-colliding scenery: { kind, x, y } in tiles (x centre, y = ground row).
  deco(kind, x, y, opts = {}) {
    this.decor.push({ kind, x, y, ...opts });
    return this;
  }

  build(meta) {
    const level = new Level(this.grid.map((r) => r.join('')), meta);
    level.decor = this.decor;
    return level;
  }
}

export class Level {
  constructor(rows, meta) {
    this.meta = meta;
    this.h = rows.length;
    this.w = rows[0].length;
    this.tiles = rows.map((r) => r.split(''));
    this.entities = [];
    this.decor = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.tiles[y][x];
        if (ENTITY.has(ch)) {
          this.entities.push({ ch, tx: x, ty: y });
          this.tiles[y][x] = '.';
        }
      }
    }
    this.pixelW = this.w * TILE;
    this.pixelH = this.h * TILE;
  }

  at(tx, ty) {
    if (ty < 0 || ty >= this.h) return '.';
    if (tx < 0 || tx >= this.w) return '=';  // side walls are solid
    return this.tiles[ty][tx];
  }

  solid(tx, ty) { return SOLID.has(this.at(tx, ty)); }
  slope(tx, ty) { return SLOPES[this.at(tx, ty)] !== undefined; }
  platform(tx, ty) { return this.at(tx, ty) === '-'; }
  spike(tx, ty) { return this.at(tx, ty) === '^'; }
  // Anything you can stand on: used for ledge checks and tile art.
  groundish(tx, ty) { return this.solid(tx, ty) || this.slope(tx, ty); }

  breakTile(tx, ty) {
    if (this.at(tx, ty) !== 'x') return false;
    this.tiles[ty][tx] = '.';
    return true;
  }

  // Surface y (world) of a slope tile under world x, or null.
  slopeSurface(px, ty) {
    const tx = Math.floor(px / TILE);
    const fn = SLOPES[this.at(tx, ty)];
    if (!fn) return null;
    const lx = Math.max(0, Math.min(TILE, px - tx * TILE));
    return ty * TILE + fn(lx);
  }

  // Axis-separated movement with tile collision. `body` has x, y (top-left),
  // w, h. Slopes are walked on via the body's bottom centre. A grounded body
  // (`climb`) may step over lips where slopes meet blocks: on a 45° slope the
  // leading edge is half a body-width plus this step's travel above the feet.
  // The allowance stays below a full tile, so real walls still block.
  move(body, dx, dy, { dropThrough = false, climb = false } = {}) {
    const result = { left: false, right: false, top: false, bottom: false, slope: false };
    const stepUp = climb ? Math.min(TILE - 4, 6 + Math.abs(dx) + body.w / 2) : 0;
    // Horizontal: only full solids block (slopes are walkable).
    body.x += dx;
    const y0 = Math.floor(body.y / TILE);
    const y1 = Math.floor((body.y + body.h - 0.01 - stepUp) / TILE);
    if (dx > 0) {
      const tx = Math.floor((body.x + body.w - 0.01) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (this.solid(tx, ty)) { body.x = tx * TILE - body.w; result.right = true; break; }
      }
    } else if (dx < 0) {
      const tx = Math.floor(body.x / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (this.solid(tx, ty)) { body.x = (tx + 1) * TILE; result.left = true; break; }
      }
    }
    // Vertical
    const prevBottom = body.y + body.h;
    body.y += dy;
    if (dy >= 0) {
      const surface = this.slopeContact(body.x + body.w / 2, prevBottom, body.y + body.h);
      if (surface !== null) {
        body.y = surface - body.h;
        result.bottom = true;
        result.slope = true;
      } else {
        const x0 = Math.floor(body.x / TILE);
        const x1 = Math.floor((body.x + body.w - 0.01) / TILE);
        const ty = Math.floor((body.y + body.h - 0.01) / TILE);
        for (let tx = x0; tx <= x1; tx++) {
          const oneWay = !dropThrough && this.platform(tx, ty) && prevBottom <= ty * TILE + 0.01;
          if (this.solid(tx, ty) || oneWay) { body.y = ty * TILE - body.h; result.bottom = true; break; }
        }
      }
    } else {
      const x0 = Math.floor(body.x / TILE);
      const x1 = Math.floor((body.x + body.w - 0.01) / TILE);
      const ty = Math.floor(body.y / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.groundish(tx, ty)) { body.y = (ty + 1) * TILE; result.top = true; break; }
      }
    }
    return result;
  }

  // Highest slope surface under px that the feet reached this step. A body may
  // rise onto a slope by up to 16 px per step (uphill at top speed).
  slopeContact(px, prevBottom, feet) {
    let best = null;
    const r0 = Math.floor(Math.min(prevBottom, feet) / TILE) - 1;
    const r1 = Math.floor(feet / TILE);
    for (let ty = r0; ty <= r1; ty++) {
      const s = this.slopeSurface(px, ty);
      if (s !== null && feet >= s && prevBottom <= s + 16 && (best === null || s < best)) best = s;
    }
    return best;
  }

  // Ground surface within `maxDist` below the feet (slopes at the centre,
  // solids and platforms under the whole width), or null.
  groundBelow(body, maxDist, { platforms = true } = {}) {
    const feet = body.y + body.h;
    const cx = body.x + body.w / 2;
    let best = null;
    const consider = (s) => { if (s >= feet - 0.5 && s <= feet + maxDist && (best === null || s < best)) best = s; };
    for (let ty = Math.floor(feet / TILE) - 1; ty <= Math.floor((feet + maxDist) / TILE); ty++) {
      const s = this.slopeSurface(cx, ty);
      if (s !== null) consider(s);
      const x0 = Math.floor(body.x / TILE);
      const x1 = Math.floor((body.x + body.w - 0.01) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.solid(tx, ty) || (platforms && this.platform(tx, ty))) consider(ty * TILE);
      }
    }
    return best;
  }

  // Keep a grounded body glued to the ground when walking downhill. On a 45°
  // slope the surface can drop by this step's travel plus half a body-width
  // (when the centre leaves a block edge for the slope).
  snapDown(body, speed, opts) {
    const s = this.groundBelow(body, 6 + Math.abs(speed) + body.w / 2, opts);
    if (s === null) return false;
    body.y = s - body.h;
    return true;
  }

  // True when a body's rectangle overlaps a spike tile.
  touchesSpikes(body) {
    const x0 = Math.floor(body.x / TILE);
    const x1 = Math.floor((body.x + body.w - 0.01) / TILE);
    const y0 = Math.floor(body.y / TILE);
    const y1 = Math.floor((body.y + body.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.spike(tx, ty) && body.y + body.h > ty * TILE + TILE / 2) return true;
      }
    }
    return false;
  }
}
