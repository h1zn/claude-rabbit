// Layered parallax skies (with an animated aurora) and screen-space weather.

import { VIEW_H, VIEW_W } from './config.js';
import { makeCanvas, rng } from './paint.js';

const LAYER_W = 1280;
const TAU = Math.PI * 2;

// Seamless ridge: sum of sines with whole cycles across the layer width.
function ridge(x, base, parts) {
  let y = base;
  for (const [cycles, amp, phase] of parts) y += Math.sin((x / LAYER_W) * TAU * cycles + phase) * amp;
  return y;
}

function silhouette(height, fill, base, parts, { snow = null, snowDepth = 18, trees = null, seed = 1 } = {}) {
  const c = makeCanvas(LAYER_W, height);
  const ctx = c.getContext('2d');
  const tops = [];
  for (let x = 0; x < LAYER_W; x++) tops.push(Math.round(ridge(x, base, parts)));
  const grad = ctx.createLinearGradient(0, Math.min(...tops), 0, height);
  grad.addColorStop(0, fill[0]);
  grad.addColorStop(1, fill[1]);
  ctx.fillStyle = grad;
  for (let x = 0; x < LAYER_W; x++) ctx.fillRect(x, tops[x], 1, height - tops[x]);
  if (snow) {
    const peak = Math.min(...tops);
    for (let x = 0; x < LAYER_W; x++) {
      const top = tops[x];
      if (top > peak + 70) continue;
      const depth = Math.max(2, snowDepth - (top - peak) * 0.25 + Math.sin(x * 0.37) * 3);
      ctx.fillStyle = snow;
      ctx.fillRect(x, top, 1, depth);
    }
  }
  if (trees) {
    const r = rng(seed);
    for (let i = 0; i < trees.count; i++) {
      const x = Math.floor(r() * LAYER_W);
      const top = tops[x];
      const h = trees.min + r() * (trees.max - trees.min);
      ctx.fillStyle = trees.color;
      if (trees.kind === 'pine') {
        ctx.beginPath(); ctx.moveTo(x - h * 0.28, top + 4); ctx.lineTo(x, top - h); ctx.lineTo(x + h * 0.28, top + 4); ctx.fill();
        if (trees.snow) { ctx.fillStyle = trees.snow; ctx.beginPath(); ctx.moveTo(x - h * 0.1, top - h * 0.62); ctx.lineTo(x, top - h); ctx.lineTo(x + h * 0.1, top - h * 0.62); ctx.fill(); }
      } else {
        ctx.beginPath(); ctx.arc(x, top - h * 0.55, h * 0.45, 0, TAU); ctx.fill();
        ctx.fillRect(x - 2, top - h * 0.3, 4, h * 0.3 + 4);
      }
    }
  }
  return c;
}

function clouds(seed) {
  const c = makeCanvas(LAYER_W, 200);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const x = r() * LAYER_W; const y = 20 + r() * 120; const s = 0.6 + r() * 0.9;
    for (const [dx, dy, rad, col] of [[0, 8, 22, '#c8dcf0'], [-26, 12, 16, '#c8dcf0'], [26, 12, 17, '#c8dcf0'], [0, 0, 22, '#ffffff'], [-24, 6, 15, '#ffffff'], [24, 6, 16, '#f4faff'], [-8, -6, 14, '#ffffff']]) {
      ctx.fillStyle = col;
      for (const wrap of [-LAYER_W, 0, LAYER_W]) {
        ctx.beginPath(); ctx.arc(x + dx * s + wrap, y + dy * s, rad * s, 0, TAU); ctx.fill();
      }
    }
  }
  return c;
}

function stars(seed, count) {
  const c = makeCanvas(VIEW_W, VIEW_H);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.3 + r() * 0.7;
    ctx.fillStyle = r() < 0.15 ? '#ffd8a8' : '#ffffff';
    const s = r() < 0.08 ? 2 : 1;
    ctx.fillRect(Math.floor(r() * VIEW_W), Math.floor(r() * VIEW_H * 0.75), s, s);
  }
  ctx.globalAlpha = 1;
  return c;
}

const THEMES = {
  meadow: {
    gradient: [[0, '#2a6ad8'], [0.45, '#5aa8f0'], [0.8, '#a8dcff'], [1, '#ffeec0']],
    sun: { x: 0.78, y: 0.22, r: 22, color: '#fff6c8', glow: 'rgba(255,240,180,0.35)' },
    build: () => [
      { img: clouds(3), factor: 0.04, y: 10, drift: 0.12 },
      { img: silhouette(300, ['#6a86c8', '#8aa4d8'], 70, [[2, 30, 0.3], [5, 14, 1.2], [9, 6, 2]], { snow: '#e8f0ff', snowDepth: 12 }), factor: 0.12, y: 70 },
      { img: silhouette(280, ['#3a8a5a', '#2a6a44'], 60, [[3, 16, 0.8], [7, 8, 2.1]], { trees: { count: 60, min: 18, max: 34, color: '#2a6a44', kind: 'round' }, seed: 5 }), factor: 0.3, y: 120 },
      { img: silhouette(240, ['#2e7a3e', '#1e5a2c'], 50, [[4, 10, 1.5], [11, 5, 0.4]], { trees: { count: 40, min: 26, max: 48, color: '#1e5a2c', kind: 'round' }, seed: 9 }), factor: 0.5, y: 160 },
    ],
  },
  winter: {
    gradient: [[0, '#140a2e'], [0.35, '#4a0e3a'], [0.62, '#a01a2a'], [0.85, '#e0402a'], [1, '#ff9a5a']],
    stars: 160,
    aurora: ['rgba(90,255,180,0.18)', 'rgba(120,200,255,0.14)', 'rgba(200,120,255,0.10)'],
    build: () => [
      { img: silhouette(320, ['#2a1440', '#3a1a4a'], 80, [[2, 40, 0.7], [5, 20, 2.2], [11, 8, 1.1]], { snow: '#d8c8ff', snowDepth: 22 }), factor: 0.1, y: 60 },
      { img: silhouette(300, ['#1a0e2a', '#120a20'], 80, [[3, 26, 1.4], [8, 10, 0.5]], { snow: '#b8a8e8', snowDepth: 14, trees: { count: 70, min: 14, max: 30, color: '#0e0818', kind: 'pine', snow: '#c8b8f0' }, seed: 4 }), factor: 0.25, y: 110 },
      { img: silhouette(260, ['#0e0818', '#0a0612'], 70, [[5, 12, 0.2], [13, 4, 1.7]], { trees: { count: 45, min: 30, max: 60, color: '#0a0612', kind: 'pine', snow: '#e8e0ff' }, seed: 8 }), factor: 0.45, y: 160 },
    ],
  },
  crystal: {
    gradient: [[0, '#06020e'], [0.5, '#140a2a'], [1, '#2a1250']],
    stars: 70,
    build: () => [
      { img: silhouette(400, ['#1a0e34', '#120a26'], 160, [[3, 50, 0.4], [7, 20, 1.9]], { trees: { count: 40, min: 30, max: 90, color: '#2a1a54', kind: 'pine' }, seed: 12 }), factor: 0.15, y: 0 },
      { img: silhouette(360, ['#24124a', '#180c34'], 150, [[4, 34, 2.3], [9, 12, 0.7]], { trees: { count: 50, min: 20, max: 60, color: '#3a2270', kind: 'pine' }, seed: 13 }), factor: 0.35, y: 40 },
    ],
  },
};

// Night jungle: moonlit teal, glowing canopy silhouettes.
THEMES.grove = {
  gradient: [[0, '#05031a'], [0.45, '#14104a'], [0.75, '#0b4a5c'], [1, '#1f8a6a']],
  stars: 120,
  sun: { x: 0.24, y: 0.2, r: 26, color: '#eaffd8', glow: 'rgba(160,255,200,0.25)' },
  build: () => [
    { img: silhouette(320, ['#0e1a3a', '#0a1430'], 90, [[2, 30, 0.6], [6, 14, 1.8]], { trees: { count: 50, min: 30, max: 70, color: '#0a1838', kind: 'round' }, seed: 21 }), factor: 0.12, y: 90 },
    { img: silhouette(300, ['#082a2e', '#061e22'], 80, [[3, 20, 1.1], [9, 8, 0.3]], { trees: { count: 60, min: 40, max: 90, color: '#06262a', kind: 'round' }, seed: 22 }), factor: 0.3, y: 140 },
  ],
};
// Candy land: pastel sky, a rainbow, cotton clouds.
THEMES.candy = {
  gradient: [[0, '#6ac8ff'], [0.4, '#a8b8ff'], [0.75, '#ffb0e0'], [1, '#ffe0f0']],
  rainbow: true,
  build: () => [
    { img: clouds(31), factor: 0.05, y: 30, drift: 0.15 },
    { img: silhouette(260, ['#ff9ad0', '#f080c0'], 70, [[2, 26, 0.4], [5, 12, 2.0]], { snow: '#fff0fa', snowDepth: 16 }), factor: 0.12, y: 130 },
    { img: clouds(37), factor: 0.25, y: 150, drift: 0.3 },
  ],
};
// Volcano forge: smouldering reds behind glowing peaks.
THEMES.forge = {
  gradient: [[0, '#0a0204'], [0.5, '#2a0608'], [0.8, '#6a1008'], [1, '#c0300c']],
  stars: 40,
  build: () => [
    { img: silhouette(320, ['#1a0606', '#120404'], 110, [[1, 60, 0.5], [3, 26, 1.7], [8, 10, 0.2]], { snow: '#ff5a1a', snowDepth: 6 }), factor: 0.1, y: 70 },
    { img: silhouette(280, ['#0c0303', '#080202'], 90, [[2, 30, 2.4], [7, 12, 0.9]]), factor: 0.3, y: 140 },
  ],
};

export class Sky {
  constructor(theme) {
    this.def = THEMES[theme] || THEMES.meadow;
    this.theme = theme;
    this.layers = this.def.build();
    this.bg = makeCanvas(VIEW_W, VIEW_H);
    const ctx = this.bg.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    for (const [at, color] of this.def.gradient) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.def.stars) ctx.drawImage(stars(7, this.def.stars), 0, 0);
  }

  draw(ctx, camX, camY, time) {
    ctx.drawImage(this.bg, 0, 0);
    const sun = this.def.sun;
    if (sun) {
      const x = sun.x * VIEW_W; const y = sun.y * VIEW_H;
      const glow = ctx.createRadialGradient(x, y, sun.r * 0.5, x, y, sun.r * 4);
      glow.addColorStop(0, sun.glow); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - sun.r * 4, y - sun.r * 4, sun.r * 8, sun.r * 8);
      ctx.fillStyle = sun.color; ctx.beginPath(); ctx.arc(x, y, sun.r, 0, TAU); ctx.fill();
    }
    if (this.def.aurora) this.aurora(ctx, camX, time);
    if (this.def.rainbow) this.rainbow(ctx, camX);
    if (this.theme === 'crystal') this.shafts(ctx, camX, time);
    for (const layer of this.layers) {
      const drift = layer.drift ? time * layer.drift : 0;
      const off = -(((camX * layer.factor + drift) % LAYER_W) + LAYER_W) % LAYER_W;
      const y = Math.round(layer.y - camY * layer.factor * 0.25);
      for (let x = Math.floor(off); x < VIEW_W; x += LAYER_W) ctx.drawImage(layer.img, x, y);
    }
  }

  // Slow, rippling aurora ribbons.
  aurora(ctx, camX, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.def.aurora.forEach((color, band) => {
      ctx.fillStyle = color;
      for (let x = 0; x < VIEW_W; x += 3) {
        const wx = x + camX * 0.03;
        const top = 40 + band * 22 + Math.sin(wx * 0.012 + time * 0.012 + band) * 26 + Math.sin(wx * 0.031 - time * 0.02) * 10;
        const h = 50 + Math.sin(wx * 0.02 + time * 0.016 + band * 2) * 30;
        ctx.fillRect(x, top, 3, Math.max(10, h));
      }
    });
    ctx.restore();
  }

  rainbow(ctx, camX) {
    const x = VIEW_W * 0.6 - ((camX * 0.02) % 200);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ['#ff4a4a', '#ff9a3a', '#ffe84a', '#5ae05a', '#4ac0ff', '#8a6aff'].forEach((c, i) => {
      ctx.strokeStyle = c; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(x, VIEW_H * 0.95, 230 - i * 7, Math.PI, 0); ctx.stroke();
    });
    ctx.restore();
  }

  shafts(ctx, camX, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 190 - camX * 0.08) % (VIEW_W + 200) + VIEW_W + 200) % (VIEW_W + 200) - 100;
      const a = 0.05 + Math.sin(time * 0.01 + i) * 0.025;
      const g = ctx.createLinearGradient(x, 0, x + 80, VIEW_H);
      g.addColorStop(0, `rgba(120,220,255,${a})`); g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x + 170, VIEW_H); ctx.lineTo(x + 90, VIEW_H); ctx.fill();
    }
    ctx.restore();
  }
}

// Screen-space weather with several depths; follows the camera with parallax.
export class Weather {
  constructor(kind, count = 140) {
    this.kind = kind;
    this.parts = [];
    const r = rng(99);
    for (let i = 0; i < count; i++) {
      this.parts.push({ x: r() * VIEW_W, y: r() * VIEW_H, z: 0.3 + r() * 0.9, phase: r() * TAU, spin: r() });
    }
    this.lastCam = null;
  }

  update(camX, camY, time) {
    if (!this.kind) return;
    const dx = this.lastCam ? camX - this.lastCam.x : 0;
    const dy = this.lastCam ? camY - this.lastCam.y : 0;
    this.lastCam = { x: camX, y: camY };
    for (const p of this.parts) {
      if (this.kind === 'snow') {
        p.y += 0.35 + p.z * 0.9;
        p.x += Math.sin(time * 0.02 + p.phase) * 0.4 * p.z - 0.15;
      } else if (this.kind === 'leaves') {
        p.y += 0.25 + p.z * 0.5;
        p.x += Math.sin(time * 0.015 + p.phase) * 0.9 + 0.3;
      } else if (this.kind === 'embers') {
        p.y -= 0.4 + p.z * 0.9;
        p.x += Math.sin(time * 0.03 + p.phase) * 0.5;
      } else if (this.kind === 'fireflies') {
        p.x += Math.sin(time * 0.013 + p.phase * 7) * 0.5;
        p.y += Math.cos(time * 0.011 + p.phase * 5) * 0.4;
      } else {
        p.y -= 0.1 + p.z * 0.2;
        p.x += Math.sin(time * 0.01 + p.phase) * 0.3;
      }
      p.x -= dx * p.z * 0.6;
      p.y -= dy * p.z * 0.6;
      p.x = ((p.x % VIEW_W) + VIEW_W) % VIEW_W;
      p.y = ((p.y % VIEW_H) + VIEW_H) % VIEW_H;
    }
  }

  // Back particles before the world, front particles after it.
  draw(ctx, front, time) {
    if (!this.kind) return;
    for (const p of this.parts) {
      if ((p.z > 0.85) !== front) continue;
      const x = Math.round(p.x); const y = Math.round(p.y);
      if (this.kind === 'snow') {
        const s = p.z > 1 ? 3 : p.z > 0.6 ? 2 : 1;
        ctx.fillStyle = p.z > 0.6 ? '#ffffff' : '#cfd8ff';
        ctx.fillRect(x, y, s, s);
        if (s === 3) { ctx.fillStyle = '#ffffffaa'; ctx.fillRect(x - 1, y + 1, 5, 1); ctx.fillRect(x + 1, y - 1, 1, 5); }
      } else if (this.kind === 'leaves') {
        ctx.fillStyle = ['#e8a030', '#d86a20', '#f0d050', '#6ac04a'][Math.floor(p.spin * 4)];
        const w = Math.abs(Math.sin(time * 0.05 + p.phase)) * 3 + 1;
        ctx.fillRect(x, y, Math.round(w), 2);
      } else if (this.kind === 'embers') {
        ctx.globalAlpha = 0.5 + Math.sin(time * 0.1 + p.phase * 9) * 0.4;
        ctx.fillStyle = p.spin > 0.6 ? '#ffe08a' : p.spin > 0.3 ? '#ff8a2a' : '#ff4a1a';
        ctx.fillRect(x, y, p.z > 0.9 ? 3 : 2, p.z > 0.9 ? 3 : 2);
        ctx.globalAlpha = 1;
      } else if (this.kind === 'fireflies') {
        const on = Math.sin(time * 0.04 + p.phase * 11);
        if (on > 0) {
          ctx.globalAlpha = on;
          ctx.fillStyle = 'rgba(200,255,120,0.25)';
          ctx.fillRect(x - 3, y - 3, 7, 7);
          ctx.fillStyle = '#f0ffa0';
          ctx.fillRect(x - 1, y - 1, 2, 2);
          ctx.globalAlpha = 1;
        }
      } else if (this.kind === 'sparkles') {
        const tw = Math.sin(time * 0.08 + p.phase * 13);
        if (tw > 0.3) {
          ctx.globalAlpha = tw;
          ctx.fillStyle = ['#ffffff', '#ffd0f0', '#c0f0ff', '#fff4a0'][Math.floor(p.spin * 4)];
          ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 2, y, 5, 1);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.globalAlpha = 0.4 + Math.sin(time * 0.05 + p.phase) * 0.3;
        ctx.fillStyle = p.spin > 0.5 ? '#7ae8ff' : '#ff9ae8';
        ctx.fillRect(x, y, 2, 2);
        ctx.globalAlpha = 1;
      }
    }
  }
}
