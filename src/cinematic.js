// JJ2's cinematics (.j2v: the intro, the ending and the Epic logo), played
// from JJ2-Cinematics.zip in Levels/. The format, after Jazz2 Resurrection's
// Cinematics.cpp: a "CineFeed" header, then the frames as four zlib streams
// cut into chunks ([u32 length][bytes] for stream 0, 1, 2, 3, repeating).
// Stream 0 holds the ops, 1 and 2 the offsets of blocks copied from the
// last frame, 3 the new pixels and the palettes. 8-bit frames, 640x480.

const HEADER = 52;

// The streams, each inflated whole. Most end on a sync flush and were never
// finished, so they get an empty last block for the browser's inflater; one
// that was finished (zlib trailer and all) inflates as it is.
async function inflate(chunks) {
  const all = new Uint8Array(await new Blob(chunks).arrayBuffer());
  const n = all.length;
  const open = n >= 4 && all[n - 4] === 0 && all[n - 3] === 0 && all[n - 2] === 0xff && all[n - 1] === 0xff;
  const parts = open ? [all.subarray(2), new Uint8Array([1, 0, 0, 0xff, 0xff])] : [all];
  const stream = new Blob(parts).stream().pipeThrough(new DecompressionStream(open ? 'deflate-raw' : 'deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function parseJ2V(buffer) {
  const b = new Uint8Array(buffer);
  const v = new DataView(buffer);
  if (String.fromCharCode(...b.subarray(0, 8)) !== 'CineFeed') throw new Error('Not a JJ2 cinematic');
  const width = v.getUint32(16, true);
  const height = v.getUint32(20, true);
  const delay = v.getUint16(26, true) || 42;
  const frames = v.getUint32(28, true);
  const parts = [[], [], [], []];
  for (let p = HEADER; p + 4 <= b.length;) {
    for (let s = 0; s < 4 && p + 4 <= b.length; s++) {
      const n = v.getUint32(p, true);
      parts[s].push(b.subarray(p + 4, p + 4 + n));
      p += 4 + n;
    }
  }
  const streams = await Promise.all(parts.map(inflate));
  return new Film(width, height, delay, frames, streams);
}

export class Film {
  constructor(width, height, delay, frames, streams) {
    Object.assign(this, { width, height, delay, frames, streams });
    this.at = [0, 0, 0, 0];          // read positions
    this.pixels = new Uint8Array(width * height);
    this.last = new Uint8Array(width * height);
    this.palette = new Uint32Array(256);
    this.shown = -1;                 // frames decoded so far - 1
    this.time = 0;                   // ms played
    this.canvas = null;
  }

  get done() { return this.shown >= this.frames - 1 || this.broken; }

  byte(s) { return this.streams[s][this.at[s]++]; }
  u16(s) { const d = this.streams[s]; const p = this.at[s]; this.at[s] += 2; return d[p] | (d[p + 1] << 8); }

  // The next frame: a new palette maybe, then each row as runs of new
  // pixels and blocks copied from anywhere in the last frame.
  decode() {
    const { width: w, height: h, streams } = this;
    if (this.at[0] >= streams[0].length) { this.broken = true; return; }
    if (this.byte(0) === 1) {
      const d = streams[3];
      for (let i = 0; i < 256; i++) {
        const p = this.at[3] + i * 4;
        this.palette[i] = 0xff000000 | (d[p + 2] << 16) | (d[p + 1] << 8) | d[p];
      }
      this.at[3] += 1024;
    }
    [this.pixels, this.last] = [this.last, this.pixels];
    const out = this.pixels;
    const last = this.last;
    const raw = streams[3];
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let x = 0;
      for (let c = this.byte(0); c !== 0x80 && c !== undefined; c = this.byte(0)) {
        if (c < 0x80) {
          const n = c === 0 ? this.u16(0) : c;
          const m = Math.min(n, w - x);
          out.set(raw.subarray(this.at[3], this.at[3] + m), row + x);
          this.at[3] += n;
          x += n;
        } else {
          const n = c === 0x81 ? this.u16(0) : c - 0x6a;
          const from = this.u16(1) + (this.byte(2) + y - 127) * w;
          const m = Math.min(n, w - x);
          out.set(last.subarray(from, from + m), row + x);
          x += n;
        }
      }
      if (x < w) out.set(last.subarray(row + x, row + w), row + x);
    }
    this.shown++;
  }

  // Play on by `ms`; true once the last frame has been shown.
  advance(ms) {
    this.time += ms;
    const want = Math.min(this.frames - 1, Math.floor(this.time / this.delay));
    while (this.shown < want && !this.broken) this.decode();
    if (this.shown >= 0) this.paint();
    return this.done;
  }

  paint() {
    if (this.painted === this.shown) return;
    this.painted = this.shown;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width; this.canvas.height = this.height;
      this.image = this.canvas.getContext('2d').createImageData(this.width, this.height);
      this.rgba = new Uint32Array(this.image.data.buffer);
    }
    const { rgba, pixels, palette } = this;
    for (let i = 0; i < pixels.length; i++) rgba[i] = palette[pixels[i]];
    this.canvas.getContext('2d').putImageData(this.image, 0, 0);
  }

  // Letterboxed into the view (the films are 4:3).
  draw(ctx, W, H) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (!this.canvas || this.shown < 0) return;
    const k = Math.min(W / this.width, H / this.height);
    const w = Math.round(this.width * k); const h = Math.round(this.height * k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
  }
}
