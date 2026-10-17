// Procedural sprites still in use: spikes and scenery (trees, rocks,
// crystals, glow mushrooms, torches). Characters and items come from the
// sprite sheets (see art.js).

import { Pix, ramp, rng } from './paint.js';

const OUT = '#1a0b1e';

// ---------------------------------------------------------------- props and scenery

function spikes(theme) {
  const p = new Pix(32, 16);
  const metal = theme === 'winter' ? ramp(['#2a4a8a', '#8ac8ff', '#ffffff'], 5) : ramp(['#3a3e4e', '#9aa0b8', '#ffffff'], 5);
  for (let i = 0; i < 4; i++) p.triShade(i * 8, 16, i * 8 + 4, 0, i * 8 + 8, 16, metal);
  return p.outline(OUT).toCanvas();
}

// ---------------------------------------------------------------- scenery

function pine(snowy, size) {
  const h = 70 + size * 30;
  const w = 44 + size * 16;
  const p = new Pix(w, h);
  const bark = ramp(['#2a140a', '#5a3218', '#8a5a30'], 4);
  const leaf = ramp(['#03241a', '#0a4a30', '#14704a', '#2aa064', '#6ad89a'], 6);
  const snow = ramp(['#7a9ac8', '#c8dcff', '#ffffff'], 4);
  p.limb(w / 2, h - 16, w / 2, h - 1, 3, bark);
  const tiers = 4 + size;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y0 = 4 + k * (h - 30);
    const half = 6 + k * (w / 2 - 6);
    p.triShade(w / 2 - half, y0 + 22, w / 2 + half, y0 + 22, w / 2, y0, leaf);
    if (snowy) {
      for (let x = -half + 3; x < half - 3; x += 2) {
        const sy = y0 + 22 - Math.abs(x) * 0.1 - 2 - (Math.sin(x * 0.7 + t) > 0.3 ? 1 : 0);
        p.rect(w / 2 + x, sy, 2, 2, snow[2]);
      }
      p.triShade(w / 2 - half * 0.5, y0 + 9, w / 2 + half * 0.5, y0 + 9, w / 2, y0, snow);
    }
  }
  return p.outline(OUT).toCanvas();
}

function roundTree(size) {
  const h = 76 + size * 20;
  const w = 64 + size * 18;
  const p = new Pix(w, h);
  const bark = ramp(['#2a140a', '#6a3a1a', '#a06a3a'], 4);
  const leaf = ramp(['#0a3a14', '#1a6a28', '#2ea040', '#68d060', '#c0f080'], 6);
  p.limb(w / 2, h - 30, w / 2 - 2, h - 1, 4, bark);
  p.limb(w / 2, h - 34, w / 2 + 10, h - 46, 2, bark);
  const r = rng(77 + size);
  const blobs = [[0.5, 0.42, 0.42], [0.3, 0.5, 0.3], [0.7, 0.5, 0.3], [0.42, 0.28, 0.3], [0.62, 0.3, 0.28], [0.5, 0.6, 0.3]];
  for (const [bx, byy, br] of blobs) p.ball(bx * w + (r() - 0.5) * 4, byy * (h - 20), br * w * 0.75, br * w * 0.62, leaf);
  for (let i = 0; i < 6; i++) p.ball(w * (0.25 + r() * 0.5), (h - 20) * (0.2 + r() * 0.4), 2, 2, ['#e8244a', '#ff6a7a', '#ffd0d8']);
  return p.outline(OUT).toCanvas();
}

function bush(theme) {
  const p = new Pix(48, 26);
  const leaf = theme === 'winter' ? ramp(['#1a3a4a', '#3a6a7a', '#c8e0f0', '#ffffff'], 5) : ramp(['#0a3a14', '#1e7a30', '#4ac050', '#a8f080'], 5);
  p.ball(13, 16, 11, 9, leaf); p.ball(33, 16, 12, 9, leaf); p.ball(23, 11, 12, 10, leaf);
  return p.outline(OUT).toCanvas();
}

function rock() {
  const p = new Pix(36, 24);
  const stone = ramp(['#2a2a3a', '#5a5a72', '#8a8aa6', '#c8c8dc'], 5);
  p.ball(14, 15, 12, 9, stone); p.ball(25, 17, 9, 7, stone);
  return p.outline(OUT).toCanvas();
}

function flowers(seed) {
  const p = new Pix(24, 18);
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const x = 2 + r() * 20; const top = 4 + r() * 8;
    p.line(x, top, x, 17, '#2a8a3a');
    const color = ['#ff5a7a', '#ffd54a', '#9a6aff', '#ffffff'][Math.floor(r() * 4)];
    p.ball(x, top, 2, 2, [color, color, '#ffffff']);
  }
  return p.toCanvas();
}

function crystalCluster(seed) {
  const p = new Pix(40, 40);
  const r = rng(seed);
  const colors = r() < 0.5 ? ramp(['#0a3a6a', '#2ab8e8', '#a8f4ff', '#ffffff'], 5) : ramp(['#4a0a5a', '#c43ad8', '#ffa8f4', '#ffffff'], 5);
  for (let i = 0; i < 5; i++) {
    const x = 8 + r() * 24; const hgt = 14 + r() * 22; const w = 3 + r() * 3;
    p.triShade(x - w, 40, x + w, 40, x + (r() - 0.5) * 6, 40 - hgt, colors);
  }
  return p.outline(OUT).toCanvas();
}

function signArrow() {
  const p = new Pix(36, 40);
  const wood = ramp(['#3a1e0a', '#8a5a2a', '#d09a5a', '#f0c890'], 5);
  p.limb(14, 14, 14, 39, 2, wood);
  for (let y = 4; y < 16; y++) p.rect(3, y, 24, 1, wood[y < 6 ? 3 : 2]);
  p.tri(27, 2, 34, 10, 27, 18, wood[2]);
  p.tri(9, 8, 20, 8, 15, 12, '#3a1e0a');
  p.tri(15, 7, 21, 10, 15, 13, '#3a1e0a');
  return p.outline(OUT).toCanvas();
}

// Tall glowing mushrooms for the night jungle.
function glowshroom(seed) {
  const p = new Pix(30, 40);
  const r = rng(seed);
  const caps = [ramp(['#0a3a4a', '#1ad8c0', '#a8fff0'], 4), ramp(['#3a0a5a', '#b04af0', '#f0b8ff'], 4)];
  for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
    const x = 6 + r() * 18; const h = 14 + r() * 18; const w = 5 + r() * 4;
    p.limb(x, 40 - h + 3, x, 40, 1.6, ramp(['#8ab8c0', '#e0fff8'], 3));
    p.ball(x, 40 - h, w, w * 0.6, caps[i % 2]);
  }
  return p.outline(OUT).toCanvas();
}

// A wall torch: iron bracket and a flame (lit by the lighting pass).
function torch() {
  const p = new Pix(16, 30);
  p.limb(8, 14, 8, 29, 2, ramp(['#2a2a34', '#6a6a7a'], 3));
  p.ball(8, 13, 4, 2, ramp(['#3a3a44', '#8a8a9a'], 3));
  p.ball(8, 7, 4, 6, ramp(['#c8300a', '#ff8a1a', '#ffe08a'], 4));
  p.ball(8, 8, 2, 3, ['#fff4c0', '#ffffff']);
  return p.outline(OUT).toCanvas();
}

function mushroom() {
  const p = new Pix(24, 24);
  p.limb(12, 14, 12, 23, 3, ramp(['#c8b8a0', '#fff4e0'], 3));
  p.ball(12, 11, 11, 7, ramp(['#6a0a1a', '#e02a3a', '#ff7a8a'], 4));
  for (const [x, y] of [[8, 8], [15, 7], [12, 12]]) p.ball(x, y, 1.6, 1.4, ['#ffffff', '#ffffff']);
  return p.outline(OUT).toCanvas();
}

// ---------------------------------------------------------------- public

export function buildSprites() {
  return {
    gems: {},   // filled with sheet frames by art.js
    spikes: { meadow: spikes('meadow'), winter: spikes('winter'), crystal: spikes('crystal') },
    decor: {
      pine: [0, 1, 2].map((s) => pine(false, s)),
      snowPine: [0, 1, 2].map((s) => pine(true, s)),
      tree: [0, 1, 2].map((s) => roundTree(s)),
      bush: bush('meadow'),
      snowBush: bush('winter'),
      rock: rock(),
      flowers: [1, 2, 3].map((s) => flowers(s)),
      crystals: [1, 2, 3].map((s) => crystalCluster(s)),
      sign: signArrow(),
      mushroom: mushroom(),
      glowshroom: [1, 2, 3].map((k) => glowshroom(k)),
      torch: torch(),
    },
  };
}
