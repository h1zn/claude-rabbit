// Read files straight out of a .zip in Levels/ (level packs are shared as
// zips): the central directory is read once, and each file is inflated when
// asked for. Stored and deflated entries are supported, which is what JJ2
// level zips use.

const zips = new Map();      // url -> Promise of { names, read(name) }

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function open(buffer) {
  const b = new Uint8Array(buffer);
  const v = new DataView(buffer);
  // The end-of-central-directory record is in the last 64 KB + 22 bytes.
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('Not a zip file');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const entries = new Map();   // lower-case name -> entry
  const names = [];
  const text = new TextDecoder('latin1');
  for (let k = 0; k < count && v.getUint32(p, true) === 0x02014b50; k++) {
    const method = v.getUint16(p + 10, true);
    const packed = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    // Files only, with any folder inside the zip dropped (packs are flat).
    const full = text.decode(b.subarray(p + 46, p + 46 + nameLen));
    const name = full.split('/').pop();
    if (name) { entries.set(name.toLowerCase(), { method, packed, local }); names.push(name); }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names,
    async read(name) {
      const e = entries.get(name.toLowerCase());
      if (!e) throw new Error(`Missing ${name}`);
      const at = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
      const data = b.subarray(at, at + e.packed);
      if (e.method === 0) return data.slice().buffer;
      if (e.method === 8) return (await inflateRaw(data)).buffer;
      throw new Error(`Can't unpack ${name}`);
    },
  };
}

// The zip at `url`, opened (fetched once).
export function openZip(url) {
  if (!zips.has(url)) {
    zips.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Missing ${decodeURIComponent(url.split('/').pop())}`);
      return r.arrayBuffer();
    }).then(open));
    zips.get(url).catch(() => zips.delete(url));
  }
  return zips.get(url);
}
