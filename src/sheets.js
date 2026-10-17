// Sprite sheets packed by tools/build_sprites.py: one atlas image plus JSON
// with each frame's rectangle and anchor (ax = body centre, ay = feet), and
// named animations (frame list, ticks per frame, loop or hold last frame).

// Image loading via onload: decode() can stall while the page is hidden.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function cut(img, f, flip) {
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const ctx = c.getContext('2d');
  if (flip) {
    ctx.translate(f.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  return c;
}

export async function loadSheet(url) {
  const base = new URL(url, location.href);
  const meta = await (await fetch(base)).json();
  const img = await loadImage(new URL(meta.image, base).href);
  const frames = meta.frames.map((f) => ({
    right: cut(img, f, false),
    left: cut(img, f, true),
    w: f.w, h: f.h, ax: f.ax, ay: f.ay,
  }));
  const anims = {};
  for (const [name, a] of Object.entries(meta.anims)) {
    anims[name] = { frames: a.frames.map((i) => frames[i]), speed: a.speed, loop: a.loop };
  }
  return { frames, anims };
}

// Frame of an animation `t` ticks after it started.
export function frameAt(anim, t, speed = anim.speed) {
  const n = anim.frames.length;
  // A missing or negative timer shows the first frame rather than nothing.
  const i = Math.max(0, Math.floor((t || 0) / Math.max(1, speed || 1)));
  return anim.frames[anim.loop ? i % n : Math.min(i, n - 1)];
}

// A 10-wide, 32 px tileset as raw pixels, for sampling into terrain.
export async function loadTileset(url) {
  const img = await loadImage(new URL(url, location.href).href);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data, image: c };
}

// RGBA of pixel (x, y) inside tile `id`, as an index into tileset.data.
export function tilePixel(ts, id, x, y) {
  const tx = (id % 10) * 32 + x;
  const ty = Math.floor(id / 10) * 32 + y;
  return (ty * ts.w + tx) * 4;
}
