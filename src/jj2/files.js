// Readers for original Jazz Jackrabbit 2 files: levels (.j2l) and tile sets
// (.j2t), from version 1.20 to TSF and JJ2+ (MLLE levels load their first
// eight layers). Layouts follow the community format notes and Jazz²
// Resurrection's loader. Both files are a 180-byte copyright notice, a small
// header, then four zlib streams.

const HEADER = 180;

export async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Little-endian cursor over a byte array.
class Reader {
  constructor(bytes, pos = 0) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = pos;
  }

  u8() { return this.b[this.p++]; }
  u16() { const x = this.v.getUint16(this.p, true); this.p += 2; return x; }
  i32() { const x = this.v.getInt32(this.p, true); this.p += 4; return x; }
  u32() { const x = this.v.getUint32(this.p, true); this.p += 4; return x; }
  skip(n) { this.p += n; }
  str(n) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = this.b[this.p + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    this.p += n;
    return s;
  }
  many(n, fn) { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = fn(); return out; }
}

// The four streams after the header (packed/unpacked sizes at `sizesAt`).
async function streams(bytes, sizesAt) {
  const r = new Reader(bytes, sizesAt);
  const sizes = r.many(8, () => r.i32());
  const out = [];
  let pos = HEADER + 82;
  for (let i = 0; i < 4; i++) {
    out.push(await inflate(bytes.subarray(pos, pos + sizes[i * 2])));
    pos += sizes[i * 2];
  }
  return { blocks: out, end: pos };
}

// ---------------------------------------------------------------- tile sets

export async function parseTileset(buffer) {
  const bytes = new Uint8Array(buffer);
  const h = new Reader(bytes, HEADER);
  if (h.str(4) !== 'TILE') throw new Error('Not a JJ2 tile set');
  h.skip(4);
  const name = h.str(32);
  const version = h.u16();
  const { blocks: [info, image, alpha, mask] } = await streams(bytes, HEADER + 50);
  const maxTiles = version <= 0x200 ? 1024 : 4096;
  const r = new Reader(info);
  // Palette: RGBA, alpha unused (index 0 is see-through via the alpha masks).
  const palette = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    palette[i * 4] = r.u8(); palette[i * 4 + 1] = r.u8(); palette[i * 4 + 2] = r.u8(); r.u8();
    palette[i * 4 + 3] = 255;
  }
  const count = r.i32();
  r.skip(maxTiles * 2);                                // opaque flags, unknown
  const imageAt = r.many(maxTiles, () => r.u32()); r.skip(maxTiles * 4);
  const alphaAt = r.many(maxTiles, () => r.u32()); r.skip(maxTiles * 4);
  const maskAt = r.many(maxTiles, () => r.u32());
  return { name, version, maxTiles, count, palette, image, alpha, mask, imageAt, alphaAt, maskAt };
}

// RGBA pixels (32x32) of one tile, honouring its transparency mask.
export function tilePixels(ts, id, out = new Uint8ClampedArray(4096)) {
  out.fill(0);
  if (id <= 0 || id >= ts.count) return out;
  const img = ts.imageAt[id];
  const a = ts.alphaAt[id];
  if (img & 0x80000000) return out;                    // 32-bit tiles (JJ2+): unsupported
  for (let j = 0; j < 1024; j++) {
    if (!((ts.alpha[a + (j >> 3)] >> (j & 7)) & 1)) continue;
    const c = ts.image[img + j] * 4;
    out[j * 4] = ts.palette[c]; out[j * 4 + 1] = ts.palette[c + 1]; out[j * 4 + 2] = ts.palette[c + 2]; out[j * 4 + 3] = 255;
  }
  return out;
}

// Collision mask of one tile: 1024 bytes, 1 = solid.
export function tileMask(ts, id) {
  const out = new Uint8Array(1024);
  if (id <= 0 || id >= ts.count) return out;
  const m = ts.maskAt[id];
  for (let j = 0; j < 1024; j++) out[j] = (ts.mask[m + (j >> 3)] >> (j & 7)) & 1;
  return out;
}

// ---------------------------------------------------------------- levels

export async function parseLevel(buffer) {
  const bytes = new Uint8Array(buffer);
  const h = new Reader(bytes, HEADER);
  if (h.str(4) !== 'LEVL') throw new Error('Not a JJ2 level');
  h.skip(3);
  const hidden = !!h.u8();
  const title = h.str(32);
  const version = h.u16();
  const { blocks: [info, events, dict, layout] } = await streams(bytes, HEADER + 50);
  const maxTiles = version <= 0x202 ? 1024 : 4096;

  const r = new Reader(info);
  r.skip(9);
  const minLight = r.u8();
  const startLight = r.u8();
  const animCount = Math.min(r.u16(), maxTiles);
  r.skip(2);                                           // split screen, multiplayer flags
  r.skip(4);
  r.str(32);
  const tileset = r.str(32);
  const bonus = r.str(32);
  const next = r.str(32);
  const secret = r.str(32);
  const music = r.str(32);
  const texts = r.many(16, () => r.str(512));

  const L = (fn) => r.many(8, fn);
  const flags = L(() => r.u32());
  r.skip(8);                                           // layer "type" (unused)
  const used = L(() => !!r.u8());
  const width = L(() => r.i32());
  const stride = L(() => r.i32());
  const height = L(() => r.i32());
  r.skip(32 + 8);                                      // depth, detail level
  const fixed = () => r.i32() / 65536;
  const offX = L(fixed); const offY = L(fixed);
  const speedX = L(fixed); const speedY = L(fixed);
  const autoX = L(fixed); const autoY = L(fixed);
  const texType = L(() => r.u8());
  const texParams = L(() => [r.u8(), r.u8(), r.u8()]);
  r.skip(2);                                           // static tile count
  const tileEvents = r.many(maxTiles, () => r.u32());
  r.skip(maxTiles);                                    // flipped flags
  const tileTypes = r.many(maxTiles, () => r.u8());
  r.skip(maxTiles);                                    // unused XMask
  const anims = r.many(animCount, () => {
    const delay = r.u16(); const jitter = r.u16(); const reverseDelay = r.u16();
    const pingPong = !!r.u8(); const speed = r.u8(); const frameCount = Math.min(r.u8(), 64);
    const frames = r.many(64, () => r.u16()).slice(0, frameCount);
    return { delay, jitter, reverseDelay, pingPong, speed, frames };
  });

  // Layers: rows of 4-tile dictionary words.
  const dv = new Reader(dict);
  const words = new Uint16Array(dict.length >> 1);
  for (let i = 0; i < words.length; i++) words[i] = dv.u16();
  const lr = new Reader(layout);
  const layers = [];
  for (let i = 0; i < 8; i++) {
    const w = width[i]; const hgt = height[i];
    const layer = {
      index: i, used: used[i] && w > 0 && hgt > 0, w, h: hgt,
      tileX: !!(flags[i] & 1), tileY: !!(flags[i] & 2), limit: !!(flags[i] & 4), textured: !!(flags[i] & 8), stars: !!(flags[i] & 16),
      speedX: speedX[i], speedY: speedY[i], autoX: autoX[i], autoY: autoY[i], offX: offX[i], offY: offY[i],
      texType: texType[i], texColor: texParams[i], tiles: null,
    };
    if (used[i] && stride[i] > 0 && hgt > 0) {
      const tiles = new Uint16Array(Math.max(1, w) * hgt);
      for (let y = 0; y < hgt; y++) {
        for (let x = 0; x < stride[i]; x += 4) {
          const word = lr.u16();
          for (let j = 0; j < 4; j++) {
            if (x + j < w && word * 4 + j < words.length) tiles[y * w + x + j] = words[word * 4 + j];
          }
        }
      }
      layer.tiles = tiles;
    }
    layers.push(layer);
  }

  const sprite = layers[3];
  const ev = new Reader(events);
  const eventMap = new Uint32Array(sprite.w * sprite.h);
  for (let i = 0; i < eventMap.length && ev.p + 4 <= events.length; i++) eventMap[i] = ev.u32();

  return {
    title, hidden, version, maxTiles, minLight, startLight, tileset, bonus, next, secret, music,
    texts, tileEvents, tileTypes, anims, layers, events: eventMap, hasMlle: bytes.length > 0 && readMagic(bytes) === 'MLLE',
  };
}

function readMagic(bytes) {
  const r = new Reader(bytes, HEADER + 50);
  const sizes = r.many(8, () => r.i32());
  let end = HEADER + 82;
  for (let i = 0; i < 4; i++) end += sizes[i * 2];
  return end + 4 <= bytes.length ? String.fromCharCode(...bytes.subarray(end, end + 4)) : '';
}

// Event word → { id, difficulty, params } (layer events; params are the top 20 bits).
export function decodeEvent(word) {
  return { id: word & 0xff, difficulty: (word >> 8) & 3, illuminate: !!(word & 0x400), params: word >>> 12 };
}

// Read packed bit fields from an event's params: fields = [bits, ...]; a
// negative count reads a signed field.
export function eventFields(params, fields) {
  const out = [];
  for (const f of fields) {
    const n = Math.abs(f);
    let v = params & ((1 << n) - 1);
    params >>>= n;
    if (f < 0 && v >= 1 << (n - 1)) v -= 1 << n;
    out.push(v);
  }
  return out;
}

// JJ2 text: '@' is a line break, '#' starts colour cycling, '§n' sizes, '|'
// colours. Return plain lines.
export function cleanText(s) {
  return s.replace(/§./g, '').replace(/[#|~]/g, '').split('@').map((l) => l.trim()).filter(Boolean).join('\n');
}
