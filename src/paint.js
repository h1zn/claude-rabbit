// Pixel painting toolkit: a palette grid with lit (shaded) shapes, outlines,
// and value/cell noise for textures. Everything is original and procedural.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Deterministic pseudo-random numbers for repeatable decoration.
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  // XOR yields a signed 32-bit int; force unsigned so the result is in [0, 1).
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in [0, 1].
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = x - xi; const yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed); const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed); const d = hash2(xi + 1, yi + 1, seed);
  const u = s(xf); const v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed = 0, octaves = 3) {
  let total = 0; let amp = 0.5; let freq = 1; let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise2(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return total / norm;
}

// Cell (Voronoi) noise: distance to nearest and second-nearest feature points,
// plus the offset to the nearest one (for per-cell shading).
export function cells(x, y, size, seed = 0) {
  const gx = Math.floor(x / size); const gy = Math.floor(y / size);
  let d1 = 1e9; let d2 = 1e9; let ox = 0; let oy = 0; let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i; const cy = gy + j;
      const px = (cx + 0.15 + hash2(cx, cy, seed) * 0.7) * size;
      const py = (cy + 0.15 + hash2(cx, cy, seed + 9) * 0.7) * size;
      const dx = x - px; const dy = y - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; ox = dx; oy = dy; id = hash2(cx, cy, seed + 3); }
      else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, ox, oy, id };
}

export function hex(color) {
  const v = parseInt(color.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mix(a, b, t) {
  const A = hex(a); const B = hex(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Build an n-step colour ramp from dark to light through the given stops.
export function ramp(stops, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    out.push(mix(stops[k], stops[k + 1], t - k));
  }
  return out;
}

const L = (() => { const v = [-0.5, -0.72, 0.48]; const m = Math.hypot(...v); return v.map((x) => x / m); })();
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  set(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h && color) this.px[y * this.w + x] = color;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  rect(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  // Clear an elliptical hole.
  erase(cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx; const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1 && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = null;
      }
    }
  }

  // Lit ellipse: per-pixel sphere normal against the light, mapped into a
  // dark-to-light ramp with ordered dithering for a smooth rendered look.
  ball(cx, cy, rx, ry, colors, { flat = 0, rim = true } = {}) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx; const ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        let i = nx * L[0] + ny * L[1] + nz * L[2];
        i = i * (1 - flat) + 0.6 * flat;
        if (rim && d > 0.82 && ny > 0) i -= 0.18;
        const dither = BAYER[(y & 3) * 4 + (x & 3)] * 0.12;
        const k = Math.max(0, Math.min(colors.length - 1, Math.round((i * 0.5 + 0.5 + dither) * (colors.length - 1) - 0.4)));
        this.set(x, y, colors[k]);
      }
    }
  }

  // Lit vertical capsule/limb from (x0,y0) to (x1,y1) with radius r.
  limb(x0, y0, x1, y1, r, colors) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.ball(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, colors, { rim: false });
    }
  }

  tri(ax, ay, bx, by, cx, cy, color) {
    const minX = Math.floor(Math.min(ax, bx, cx)); const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy)); const maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        const w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
        const w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
        const inside = area >= 0 ? (w0 >= 0 && w1 >= 0 && w2 >= 0) : (w0 <= 0 && w1 <= 0 && w2 <= 0);
        if (inside) this.set(x, y, color);
      }
    }
  }

  // Triangle shaded top-to-bottom through a ramp (for ears, spikes, leaves).
  triShade(ax, ay, bx, by, cx, cy, colors) {
    const minY = Math.min(ay, by, cy); const maxY = Math.max(ay, by, cy);
    const tmp = new Pix(this.w, this.h);
    tmp.tri(ax, ay, bx, by, cx, cy, '#000000');
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!tmp.px[y * this.w + x]) continue;
        const t = 1 - (y - minY) / Math.max(1, maxY - minY);
        const k = Math.round((t * 0.8 + 0.1 + BAYER[(y & 3) * 4 + (x & 3)] * 0.2) * (colors.length - 1));
        this.set(x, y, colors[Math.max(0, Math.min(colors.length - 1, k))]);
      }
    }
  }

  line(x0, y0, x1, y1, color, width = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps; const y = y0 + (y1 - y0) * i / steps;
      for (let k = 0; k < width; k++) this.set(x, y + k, color);
    }
  }

  outline(color) {
    const copy = this.px.slice();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (copy[y * this.w + x] !== null) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && copy[ny * this.w + nx] !== null) {
            this.px[y * this.w + x] = color;
            break;
          }
        }
      }
    }
    return this;
  }

  toCanvas(flip = false) {
    const c = makeCanvas(this.w, this.h);
    const ctx = c.getContext('2d');
    const image = ctx.createImageData(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const color = this.px[y * this.w + (flip ? this.w - 1 - x : x)];
        if (!color) continue;
        const [r, g, b] = hex(color);
        const i = (y * this.w + x) * 4;
        image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return c;
  }

  both() {
    return { right: this.toCanvas(false), left: this.toCanvas(true) };
  }
}
