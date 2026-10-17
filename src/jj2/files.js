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
  const [src, sid, remap] = source(ts, id);
  if (!src || sid <= 0 || sid >= src.count) return out;
  const img = src.imageAt[sid];
  const a = src.alphaAt[sid];
  if (img & 0x80000000) return out;                    // 32-bit tiles (JJ2+): unsupported
  const pal = ts.palette;
  for (let j = 0; j < 1024; j++) {
    if (!((src.alpha[a + (j >> 3)] >> (j & 7)) & 1)) continue;
    let ci = src.image[img + j];
    if (remap) ci = remap[ci];
    const c = ci * 4;
    out[j * 4] = pal[c]; out[j * 4 + 1] = pal[c + 1]; out[j * 4 + 2] = pal[c + 2]; out[j * 4 + 3] = 255;
  }
  return out;
}

// Collision mask of one tile: 1024 bytes, 1 = solid.
export function tileMask(ts, id) {
  const out = new Uint8Array(1024);
  if (id <= 0 || id >= ts.count) return out;
  const [src, sid] = source(ts, id);
  if (!src || sid <= 0 || sid >= src.count) return out;
  const m = src.maskAt[sid];
  for (let j = 0; j < 1024; j++) out[j] = (src.mask[m + (j >> 3)] >> (j & 7)) & 1;
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
  const { blocks: [info, events, dict, layout], end } = await streams(bytes, HEADER + 50);
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
    texts, tileEvents, tileTypes, anims, layers, events: eventMap,
    layerOrder: [0, 1, 2, 3, 4, 5, 6, 7], mlle: await parseMlle(bytes, end),
  };
}

// 7-bit encoded length (MLLE strings).
function u7(r) {
  let v = 0; let shift = 0; let c;
  do { c = r.u8(); v |= (c & 0x7f) << shift; shift += 7; } while (c & 0x80);
  return v;
}

// JJ2+ / MLLE data after the four streams: a level palette, extra tile sets
// appended to the base one, and the layer list (more than eight layers live
// in "-MLLE-Data-N.j2l" files). Returns null for plain levels.
async function parseMlle(bytes, at) {
  if (at + 16 > bytes.length || String.fromCharCode(...bytes.subarray(at, at + 4)) !== 'MLLE') return null;
  const h = new Reader(bytes, at + 4);
  const version = h.u32();
  const packed = h.i32();
  const data = await inflate(bytes.subarray(at + 16, at + 16 + packed));
  const r = new Reader(data);
  const out = { version, palette: null, tilesets: [], layers: null };
  try {
    r.skip(4 + 2 + 4 + 4 + 4 + 1 + 4 + 1 + 4 + 4 + 4);   // weather, warps, echo, darkness, water
    if (r.u8()) {
      out.palette = data.slice(r.p, r.p + 768); r.skip(768);
      if (version >= 0x106) r.skip(1);
    }
    if (version >= 0x106) {
      for (let n = r.u8(); n > 0; n--) { r.skip(u7(r)); r.skip(768); }
    }
    for (let i = version >= 0x105 ? 20 : 11; i > 0; i--) if (r.u8()) r.skip(256);
    for (let n = r.u8(); n > 0; n--) {
      const name = r.str(u7(r));
      const offset = r.u16(); const count = r.u16(); const mode = r.u8();
      let remap = null;
      if (mode === 1) { remap = data.slice(r.p, r.p + 256); r.skip(256); }
      else if (mode === 3) r.skip(1);
      out.tilesets.push({ name, offset, count, remap });
    }
    if (version >= 0x102) {
      const count = r.i32();
      out.layers = [];
      for (let i = 0; i < count; i++) {
        let id = r.u8(); if (id > 127) id -= 256;
        r.skip(u7(r));
        const hidden = !!r.u8();
        r.skip(2 + 8);                                   // sprite mode/param, rotation
        if (version >= 0x106) { r.skip(2 + 26); let tex = r.u8(); if (tex > 127) tex -= 256; if (tex < 0) r.skip(65536); }
        out.layers.push({ id, hidden });
      }
    }
  } catch (e) { /* a newer or odd MLLE stream: keep what was read */ }
  return out;
}

// Merge MLLE's extra layers (from the data files, eight each) and its layer
// order into a parsed level.
export function applyMlleLayers(level, dataFiles) {
  const list = level.mlle && level.mlle.layers;
  if (!list) return;
  const layers = [...level.layers];
  for (const f of dataFiles) {
    for (let i = 0; i < 8; i++) layers.push(f ? f.layers[i] : { used: false, tiles: null });
  }
  let next = 8;
  const order = [];
  for (const entry of list) {
    const idx = entry.id >= 0 ? entry.id : next++;
    if (idx >= layers.length) continue;
    layers[idx] = { ...layers[idx], index: idx, hidden: entry.hidden };
    order.push(idx);
  }
  if (order.includes(3)) { level.layers = layers; level.layerOrder = order; }
}

// A tile set made of a base set plus MLLE's extra sets: tile ids past the
// base continue into each extra set's chosen range.
export function composeTileset(base, extras, palette) {
  const parts = [];
  let count = base.count;
  for (const x of extras) {
    parts.push({ start: count, ...x });
    count += x.count;
  }
  const pal = palette ? expandPalette(palette) : base.palette;
  return { ...base, count, palette: pal, parts, base };
}

function expandPalette(rgb) {
  const p = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) { p[i * 4] = rgb[i * 3]; p[i * 4 + 1] = rgb[i * 3 + 1]; p[i * 4 + 2] = rgb[i * 3 + 2]; p[i * 4 + 3] = 255; }
  return p;
}

// Which set and tile a composite id comes from: [tileset, id, remap].
function source(ts, id) {
  if (!ts.parts || id < ts.base.count) return [ts.base || ts, id, null];
  for (let k = ts.parts.length - 1; k >= 0; k--) {
    const p = ts.parts[k];
    if (id >= p.start) return [p.ts, id - p.start + p.offset, p.remap];
  }
  return [null, 0, null];
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
