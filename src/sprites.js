// Original shaded sprites: Kip, enemies, items, props and scenery.

import { Pix, ramp, rng } from './paint.js';

const OUT = '#1a0b1e';

// ---------------------------------------------------------------- Kip

const K = {
  fur: ramp(['#5a1e06', '#a8460e', '#e8761e', '#ffa850', '#ffd89a'], 7),
  cream: ramp(['#9c7856', '#dcbc96', '#fff3e0'], 5),
  pink: ramp(['#9a3e5a', '#e47a96', '#ffc0d0'], 4),
  scarf: ramp(['#073e3a', '#0f8a7e', '#22d0be', '#a6fff2'], 6),
  boot: ramp(['#141e52', '#2a4cb0', '#5a8cff', '#b8d0ff'], 6),
  gun: ramp(['#1e2230', '#4a5068', '#8a90a8', '#dfe4f0'], 6),
  glow: ramp(['#0a6a80', '#2ad8ff', '#d8fbff'], 4),
  flame: ramp(['#c42a0a', '#ff7a1a', '#ffd54a', '#fff6c0'], 4),
  nose: ramp(['#120810', '#3a1c28', '#7a4a5a'], 3),
};

function paintKip(o) {
  const {
    bob = 0, legA = 0, legB = 0, liftA = 0, liftB = 0, tail = 0, ears = 0, wave = 0,
    arm = 0, armX = 0, hover = false, flame = 0, hurt = false, blink = false, squat = 0,
    look = 0, mouth = 'smile', fist = false, tuck = false,
  } = o;
  const p = new Pix(52, 62);
  const fb = bob + 8;          // feet baseline: crouching does not move the feet
  const by = fb + squat;       // body offset: crouching lowers the body
  const hy = by + look * -1;

  // Tail: a chain of shaded puffs curling behind, white tip.
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 18 - t * 13 - tail * t * 0.6;
    const y = 40 + by - t * 8 - Math.sin(t * 3 + wave * 0.6) * tail * 0.8;
    p.ball(x, y, 4 + t * 2.4, 3.6 + t * 2, i > 4 ? K.cream : K.fur);
  }

  // Two thin scarf streamers trailing back and fluttering.
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const x = 19 - i * 1.3 - s;
      const y = 28 + by + s * 2.5 + Math.sin(wave + i * 0.8 + s * 1.7) * (0.5 + t * 2);
      p.ball(x, y, 1.3, 1.1, K.scarf.slice(s, 5), { rim: false });
    }
  }

  // Legs and jet boots.
  const legs = tuck
    ? [[22, 46, 19, 49, 0], [28, 46, 31, 49, 0]]
    : [[22, 42, 21 + legB, 53 - liftB, liftB], [28, 42, 29 + legA, 53 - liftA, liftA]];
  for (const [hx, hyy, fx, fy] of legs) {
    const footY = fy + fb - 8;
    p.limb(hx, hyy + by - 8, fx, footY, 2.6, K.fur.slice(0, 5));
    p.ball(fx + 1.5, footY + 2.5, 5, 3.2, K.boot);
    p.rect(Math.round(fx - 3), Math.round(footY + 5), 9, 1, K.boot[0]);
  }
  if (hover) {
    for (const [, , fx, fy] of legs) {
      const baseY = fy + fb - 8 + 6;
      for (let j = 0; j < 5 + flame * 2; j++) {
        const w = Math.max(1, 3 - j * 0.5);
        const color = K.flame[Math.max(0, 3 - Math.floor(j / 2))];
        p.rect(Math.round(fx + 1.5 - w), Math.round(baseY + j), Math.round(w * 2), 1, color);
      }
    }
  }

  // Body and belly.
  p.ball(25, 36 + by, 9, 10, K.fur);
  p.ball(28, 38 + by, 5, 7, K.cream);

  // Scarf band and knot.
  for (let x = 17; x <= 33; x++) p.ball(x, 27 + by + Math.sin(x * 0.4) * 0.4, 1.4, 2.4, K.scarf, { rim: false });
  p.ball(20, 29 + by, 2.6, 2.2, K.scarf);

  // Head.
  const headX = 29;
  const headY = 17 + hy;
  // Ears (back then front).
  p.triShade(20, headY - 4, 25, headY - 7, 18 - ears, headY - 19 + Math.abs(ears) * 0.3, K.fur);
  p.triShade(27, headY - 7, 33, headY - 5, 30 + ears * 0.6, headY - 20, K.fur);
  p.triShade(21.5, headY - 5, 24, headY - 7, 19.5 - ears, headY - 15, K.pink);
  p.triShade(28.5, headY - 7, 31.5, headY - 6, 30 + ears * 0.6, headY - 16, K.pink);
  p.ball(headX, headY, 10.5, 9.5, K.fur);
  p.ball(22, headY + 5, 5, 3.6, K.cream);
  p.ball(37, headY + 4, 6.5, 4.4, K.cream);
  p.ball(43, headY + 2, 2.2, 1.8, K.nose);
  p.set(42, headY + 1, '#c09aaa');
  // Eye.
  if (hurt) {
    p.line(31, headY - 4, 35, headY, OUT);
    p.line(35, headY - 4, 31, headY, OUT);
  } else if (blink) {
    p.line(31, headY - 1, 35, headY - 1, OUT);
  } else {
    p.ball(33, headY - 2, 3.2, 4.2, ['#c8d0e0', '#ffffff', '#ffffff'], { rim: false });
    p.ball(34.2, headY - 1 - look, 1.7, 2.8, ['#0c0610', '#1a0f24', '#3a2a50']);
    p.set(33, headY - 3 - look, '#ffffff');
    p.set(33, headY - 4 - look, '#ffffff');
  }
  p.line(30, headY - 7, 35, headY - 6, K.fur[1]);
  // Mouth.
  if (mouth === 'open' || hurt) {
    p.ball(39, headY + 7, 2.4, 1.8, ['#3a0a1a', '#7a1a32', '#c84a62']);
  } else {
    p.line(36, headY + 7, 40, headY + 6, K.nose[1]);
  }

  // Arm and blaster.
  if (fist) {
    // Arm thrust straight up past the head (uppercut / victory).
    p.limb(31, 30 + by, 38, 6 + by, 2.6, K.fur.slice(0, 6));
    p.ball(38.5, 3 + by, 3.8, 3.8, K.cream);
    p.line(36, 1 + by, 41, 1 + by, K.cream[0]);
  } else {
    const ay = 32 + by + arm;
    p.limb(29, 30 + by, 36 + armX, ay, 2.6, K.fur.slice(0, 6));
    // Blaster body with lit top and a glowing energy cell.
    for (let y = 0; y < 6; y++) {
      const shade = K.gun[Math.max(0, 4 - y)];
      p.rect(35 + armX, ay - 3 + y, 12, 1, shade);
    }
    p.rect(46 + armX, ay - 2, 4, 3, K.gun[3]);
    p.rect(49 + armX, ay - 2, 1, 3, K.gun[1]);
    p.ball(40 + armX, ay - 1, 2, 1.6, K.glow, { rim: false });
    p.ball(37 + armX, ay + 1, 2.2, 2, K.cream);
  }
  return p.outline(OUT);
}

function kipFrames() {
  const run = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * Math.PI * 2;
    const s = Math.sin(ph);
    run.push({
      legA: s * 6, legB: -s * 6,
      liftA: Math.max(0, -Math.cos(ph)) * 4, liftB: Math.max(0, Math.cos(ph)) * 4,
      bob: -Math.abs(Math.cos(ph)) * 1.5, tail: 3 + s, ears: 1.5, wave: ph * 2, arm: s * 1.2, armX: -s,
    });
  }
  const sets = {
    idle: [
      { tail: 0, wave: 0 }, { tail: 0.6, wave: 0.8, bob: 0.5 }, { tail: 1, wave: 1.6, bob: 1 }, { tail: 0.6, wave: 2.4, bob: 0.5 },
      { tail: 0, wave: 3.2, blink: true },
    ],
    run,
    skid: [{ legA: 7, legB: 3, bob: 1, tail: -2, ears: -2, wave: 1, armX: -3, mouth: 'open' }],
    jump: [{ legA: 4, legB: -4, liftA: 5, liftB: 1, tail: 4, ears: -2, wave: 2, bob: -1, mouth: 'open' }],
    fall: [{ legA: -2, legB: 4, liftA: 1, liftB: 3, tail: -3, ears: 3, wave: 4 }],
    hover: [
      { legA: 0, legB: 2, tail: 2, ears: 3, hover: true, flame: 1, wave: 1, bob: -6 },
      { legA: 0, legB: 2, tail: 3, ears: 2.5, hover: true, flame: 0, wave: 2.2, bob: -6 },
    ],
    hurt: [{ legA: 4, legB: -4, tail: -3, ears: 4, hurt: true, arm: 3, wave: 3 }],
    shoot: [{ arm: -1, armX: -2 }],
    crouch: [{ squat: 6, legA: 3, legB: -2, tail: 1, ears: 1 }],
    look: [{ look: 2, ears: -1 }],
    stomp: [{ tuck: true, tail: 4, ears: 4, bob: -3, wave: 5, mouth: 'open' }],
    uppercut: [{ fist: true, legA: 3, legB: -3, liftA: 4, tail: 4, ears: -3, wave: 2, mouth: 'open', bob: -2 }],
    victory: [{ fist: true, ears: 2, mouth: 'open', tail: 2 }, { fist: true, ears: 3, mouth: 'open', tail: 3, bob: -2 }],
  };
  const frames = {};
  for (const [name, list] of Object.entries(sets)) frames[name] = list.map((pose) => paintKip(pose).both());
  return frames;
}

// ---------------------------------------------------------------- enemies

const E = {
  shell: ramp(['#2a0a5a', '#5a2aa8', '#8a52e0', '#c49aff', '#f0e0ff'], 6),
  metal: ramp(['#1a1424', '#3a3450', '#6a6488', '#b0acc8'], 5),
  red: ramp(['#5a0010', '#ff2a4a', '#ffd0d8'], 4),
  slime: ramp(['#0a4a20', '#1e9e48', '#4ade78', '#b4ffcc', '#ffffff'], 6),
  bee: ramp(['#6a3a00', '#d88a00', '#ffcf2e', '#fff2a0'], 5),
  wing: ['#9ac8e8', '#c8e6ff', '#eef8ff'],
  snow: ramp(['#5a7aa8', '#9ec0e8', '#dff0ff', '#ffffff'], 5),
  ice: ramp(['#1a4a8a', '#3a8ee0', '#9ad8ff', '#e8faff'], 5),
};

function bugbot(step) {
  const p = new Pix(36, 30);
  const legs = step ? [5, 12, 20, 27] : [7, 14, 18, 25];
  legs.forEach((x, i) => p.limb(x, 19, x + (i < 2 ? -2 : 2) * (step ? 1 : -1), 27, 1.4, E.metal));
  p.ball(18, 17, 14, 10, E.shell);
  p.ball(16, 13, 9, 5, E.shell.slice(2));
  p.ball(18, 22, 13, 3, E.metal);
  p.ball(28, 16, 4.2, 4.2, ['#e0e0f0', '#ffffff', '#ffffff']);
  p.ball(29.5, 16, 2.4, 2.4, E.red);
  p.limb(14, 7, 10, 1, 0.8, E.metal);
  p.ball(10, 1.5, 1.8, 1.8, ['#c08a00', '#ffd54a', '#fff6c0']);
  return p.outline(OUT);
}

function blobble(shape) {
  const p = new Pix(34, 32);
  const rx = [12, 14.5, 9][shape];
  const ry = [10, 7.5, 13.5][shape];
  const cy = 31 - ry;
  p.ball(17, cy, rx, ry, E.slime);
  p.ball(12, cy - ry * 0.45, 2.5, 1.6, ['#ffffff', '#ffffff']);
  const ey = cy - 1;
  p.ball(13, ey, 2.6, 3.2, ['#d0e8d8', '#ffffff']);
  p.ball(21, ey, 2.6, 3.2, ['#d0e8d8', '#ffffff']);
  p.ball(13.6, ey + 0.6, 1.3, 1.8, [OUT, '#2a1a34']);
  p.ball(21.6, ey + 0.6, 1.3, 1.8, [OUT, '#2a1a34']);
  p.line(15, cy + 5, 19, cy + 5, '#0e5a28');
  return p.outline(OUT);
}

function buzzwing(wing) {
  const p = new Pix(38, 30);
  const wy = wing ? 3 : 8;
  p.ball(13, wy + 4, 8, 4.5, E.wing, { rim: false });
  p.ball(23, wy + 3, 8, 4.5, E.wing, { rim: false });
  p.ball(18, 18, 11, 7.5, E.bee);
  for (const x of [12, 17, 22]) for (let y = 11; y <= 25; y++) if (Math.abs(((x - 18) / 11) ** 2 + ((y - 18) / 7.5) ** 2) <= 1) p.rect(x, y, 2, 1, '#2a1406');
  p.ball(29, 16, 5.5, 5.5, E.bee);
  p.ball(31, 15, 2.4, 2.4, ['#e0e0f0', '#ffffff']);
  p.ball(31.8, 15.3, 1.3, 1.3, E.red);
  p.tri(6, 17, 1, 19, 6, 21, '#2a1406');
  return p.outline(OUT);
}

function frostmite(roll) {
  const p = new Pix(34, 34);
  p.ball(17, 18, 14, 14, E.snow);
  for (let i = 0; i < 6; i++) {
    const a = roll + i * Math.PI / 3;
    p.ball(17 + Math.cos(a) * 13, 18 + Math.sin(a) * 13, 2.6, 2.6, E.ice);
  }
  const ex = 17 + Math.cos(roll) * 4;
  p.ball(ex - 4, 15, 2, 2.6, [OUT, '#2a1a34']);
  p.ball(ex + 4, 15, 2, 2.6, [OUT, '#2a1a34']);
  p.line(ex - 3, 23, ex + 3, 22, '#2a3a6a');
  return p.outline(OUT);
}

// ---------------------------------------------------------------- items

const GEM_COLORS = {
  red: ['#5a0010', '#c8143a', '#ff4a6a', '#ffb0c0', '#ffffff'],
  green: ['#00401a', '#0e9a44', '#3ae07a', '#b4ffcc', '#ffffff'],
  blue: ['#001a5a', '#1a52d0', '#4a8aff', '#bcd4ff', '#ffffff'],
  purple: ['#2a005a', '#7a1ad0', '#b45aff', '#e4c4ff', '#ffffff'],
};

function gemFrames(color) {
  const c = GEM_COLORS[color];
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const sx = Math.abs(Math.cos((f / 8) * Math.PI));
    const p = new Pix(20, 20);
    const w = Math.max(1.5, 8.5 * sx);
    const cx = 10;
    p.tri(cx - w, 7, cx + w, 7, cx, 18, c[1]);
    p.tri(cx - w, 7, cx, 7, cx, 18, c[2]);
    p.tri(cx - w * 0.6, 2, cx + w * 0.6, 2, cx + w, 7, c[3]);
    p.tri(cx - w * 0.6, 2, cx - w, 7, cx + w, 7, c[3]);
    p.tri(cx - w * 0.6, 2, cx, 2, cx - w * 0.3, 7, c[4]);
    if (sx > 0.5) p.set(cx - 2, 4, '#ffffff');
    frames.push(p.outline(OUT).toCanvas());
  }
  return frames;
}

function coinFrames() {
  const frames = [];
  const gold = ramp(['#6a3a00', '#c88a10', '#ffd040', '#fff4b0'], 5);
  for (let f = 0; f < 8; f++) {
    const sx = Math.abs(Math.cos((f / 8) * Math.PI));
    const p = new Pix(18, 18);
    p.ball(9, 9, Math.max(1.2, 7.5 * sx), 7.5, gold);
    if (sx > 0.4) p.ball(9, 9, 4 * sx, 4, gold.slice(1, 4), { flat: 0.6 });
    frames.push(p.outline(OUT).toCanvas());
  }
  return frames;
}

function food(kind) {
  const p = new Pix(22, 22);
  const red = ramp(['#5a0010', '#d81a3a', '#ff6a7a', '#ffd0d8'], 5);
  const leaf = ramp(['#0a4a1a', '#2aa84a', '#8ef0a6'], 4);
  if (kind === 'apple') {
    p.ball(11, 13, 8, 7.5, red);
    p.limb(11, 6, 12, 3, 0.8, ['#4a2a0a', '#7a4a1a']);
    p.ball(15, 4, 3, 1.6, leaf);
  } else if (kind === 'cherry') {
    p.line(8, 4, 6, 12, '#2a6a1a'); p.line(8, 4, 14, 12, '#2a6a1a');
    p.ball(6, 15, 4.2, 4.2, red); p.ball(14, 15, 4.2, 4.2, red);
  } else if (kind === 'cupcake') {
    const cake = ramp(['#6a3a1a', '#b8743a', '#e8a868'], 4);
    const icing = ramp(['#a83a7a', '#ff7ac0', '#ffd0ec', '#ffffff'], 5);
    for (let y = 12; y < 21; y++) p.rect(4 + (y - 12) * 0.2, y, 14 - (y - 12) * 0.4, 1, cake[Math.min(3, (y % 3) + 1)]);
    p.ball(11, 10, 8, 5, icing);
    p.ball(11, 4.5, 2.4, 2.4, red);
  } else if (kind === 'icecream') {
    const cone = ramp(['#6a3a10', '#c88a3a', '#f0c070'], 4);
    p.tri(5, 10, 17, 10, 11, 21, cone[2]);
    for (let y = 11; y < 20; y += 3) p.line(6 + (y - 10) * 0.5, y, 16 - (y - 10) * 0.5, y, cone[1]);
    p.ball(11, 8, 6.5, 5.5, ramp(['#6a8ab0', '#bcd8ff', '#ffffff'], 4));
    p.ball(11, 3.5, 2, 2, red);
  } else if (kind === 'donut') {
    const dough = ramp(['#6a3a1a', '#c88a4a', '#f0c088'], 4);
    p.ball(11, 12, 9, 7, dough);
    p.ball(11, 10.5, 8, 5, ramp(['#7a2a6a', '#e05ab0', '#ffb0e0', '#ffffff'], 5));
    p.erase(11, 11, 2.6, 1.8);
    for (let i = 0; i < 6; i++) p.set(5 + i * 2.2, 9 + (i % 2) * 2, ['#ffe04a', '#4ae0ff', '#ffffff'][i % 3]);
  } else {
    // candy cane
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const x = t < 0.35 ? 8 + Math.cos(Math.PI * (1 - t / 0.35)) * -4 + 4 : 12;
      const y = t < 0.35 ? 6 - Math.sin(Math.PI * t / 0.35) * 4 : 6 + (t - 0.35) * 22;
      p.ball(x, y, 2.2, 2.2, i % 3 === 0 ? ramp(['#7a0010', '#ff2a4a', '#ffd0d8'], 4) : ['#c8c8d8', '#ffffff', '#ffffff']);
    }
  }
  return p.outline(OUT).toCanvas();
}

function berry() {
  const p = new Pix(22, 22);
  const red = ramp(['#5a0018', '#d8143e', '#ff5a7a', '#ffd0dc'], 5);
  p.ball(7, 13, 5, 5, red);
  p.ball(15, 13, 5, 5, red);
  p.ball(11, 8, 5, 5, red);
  p.triShade(11, 4, 18, 0, 19, 5, ramp(['#0a5a1a', '#3fd66b', '#a8ffb8'], 4));
  return p.outline(OUT).toCanvas();
}

// Health pickup: a tapered, shaded root with leafy fronds.
function carrot() {
  const p = new Pix(22, 22);
  const orange = ramp(['#7a2a00', '#e0640a', '#ff9a2a', '#ffd08a'], 5);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    p.ball(15 - t * 10, 7 + t * 12, 4.2 * (1 - t) + 0.9, 4.2 * (1 - t) + 0.9, orange, { rim: false });
  }
  for (const k of [0.3, 0.5, 0.7]) p.line(15 - k * 10 - 2, 7 + k * 12 - 1, 15 - k * 10 + 1, 7 + k * 12 + 1, orange[0]);
  const leaf = ramp(['#0a5a1a', '#2fb84e', '#8af09a'], 4);
  p.triShade(15, 6, 13, 0, 17, 1, leaf);
  p.triShade(15, 6, 19, 0, 21, 3, leaf);
  p.triShade(15, 6, 9, 2, 12, 0, leaf);
  return p.outline(OUT).toCanvas();
}

function crate() {
  const p = new Pix(24, 22);
  const wood = ramp(['#4a2a10', '#8a5a2a', '#c08a4e', '#e8b880'], 5);
  for (let y = 2; y < 21; y++) p.rect(1, y, 22, 1, wood[y < 5 ? 4 : y > 17 ? 1 : 2 + (y % 4 === 0 ? 1 : 0)]);
  p.line(2, 3, 21, 19, wood[0], 2);
  p.ball(12, 11, 5, 5, ramp(['#0a6a6a', '#22d0be', '#d8fffa'], 4));
  p.rect(11, 7, 2, 9, '#ffffff');
  p.rect(8, 10, 8, 2, '#ffffff');
  return p.outline(OUT).toCanvas();
}

function spring(squash) {
  const p = new Pix(32, 26);
  const top = squash ? 15 : 6;
  const metal = ramp(['#4a4e60', '#9aa0b8', '#eef0ff'], 4);
  for (let y = top + 4; y < 22; y += 3) p.ball(16, y, 8, 1.4, metal, { rim: false });
  p.ball(16, top + 1.5, 12, 3.2, ramp(['#6a0018', '#ff2a4a', '#ff9aaa', '#ffffff'], 5));
  p.ball(16, 23, 11, 2.6, ramp(['#2a2e3a', '#5a6070', '#9aa0b8'], 4));
  return p.outline(OUT).toCanvas();
}

function spikes(theme) {
  const p = new Pix(32, 16);
  const metal = theme === 'winter' ? ramp(['#2a4a8a', '#8ac8ff', '#ffffff'], 5) : ramp(['#3a3e4e', '#9aa0b8', '#ffffff'], 5);
  for (let i = 0; i < 4; i++) p.triShade(i * 8, 16, i * 8 + 4, 0, i * 8 + 8, 16, metal);
  return p.outline(OUT).toCanvas();
}

function lantern(on) {
  const p = new Pix(24, 56);
  const wood = ramp(['#3a1e0a', '#7a4a1e', '#b07a3e'], 4);
  p.limb(12, 16, 12, 55, 1.8, wood);
  p.rect(5, 54, 14, 2, wood[0]);
  const glass = on ? ramp(['#8a5a00', '#ffcf2e', '#fff6c0', '#ffffff'], 5) : ramp(['#2a2a3a', '#5a5a7a', '#9a9ab8'], 4);
  p.ball(12, 9, 6, 7, glass);
  p.rect(5, 1, 14, 2, wood[1]);
  p.rect(5, 16, 14, 2, wood[1]);
  return p.outline(OUT).toCanvas();
}

function signFrames() {
  const frames = [];
  const wood = ramp(['#3a1e0a', '#8a5a2a', '#d09a5a', '#f0c890'], 5);
  for (let f = 0; f < 12; f++) {
    const sx = Math.cos((f / 12) * Math.PI * 2);
    const p = new Pix(44, 60);
    p.limb(22, 26, 22, 59, 2.4, wood);
    const w = Math.max(1, Math.abs(sx) * 19);
    for (let y = 4; y < 28; y++) p.rect(22 - w, y, w * 2, 1, wood[y < 7 ? 3 : y > 24 ? 1 : 2]);
    if (Math.abs(sx) > 0.3) {
      if (sx > 0) {
        // Kip's star badge on the front.
        const s = Math.abs(sx);
        p.triShade(22 - 7 * s, 18, 22 + 7 * s, 18, 22, 7, ramp(['#c88a00', '#ffd54a', '#ffffff'], 4));
        p.triShade(22 - 7 * s, 12, 22 + 7 * s, 12, 22, 23, ramp(['#c88a00', '#ffd54a', '#ffffff'], 4));
      } else {
        p.ball(22, 16, 6 * Math.abs(sx), 6, ramp(['#0f8a7e', '#22d0be', '#a6fff2'], 4));
      }
    }
    frames.push(p.outline(OUT).toCanvas());
  }
  return frames;
}

function shot(colors) {
  const p = new Pix(18, 10);
  for (let i = 0; i < 8; i++) p.ball(4 + i * 0.8, 5, 1 + i * 0.35, 1 + i * 0.2, colors.slice(0, 2), { rim: false });
  p.ball(13, 5, 4, 3.2, colors);
  return p.toCanvas();
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
    kip: kipFrames(),
    bugbot: [0, 1].map((s) => bugbot(s).both()),
    blobble: [0, 1, 2].map((s) => blobble(s).both()),
    buzzwing: [0, 1].map((s) => buzzwing(s).both()),
    frostmite: [0, 1, 2, 3].map((s) => frostmite((s / 4) * Math.PI * 2).both()),
    gems: Object.fromEntries(Object.keys(GEM_COLORS).map((c) => [c, gemFrames(c)])),
    coin: coinFrames(),
    food: Object.fromEntries(['apple', 'cherry', 'cupcake', 'icecream', 'donut', 'candy'].map((k) => [k, food(k)])),
    berry: berry(),
    carrot: carrot(),
    crate: crate(),
    spring: [spring(false), spring(true)],
    spikes: { meadow: spikes('meadow'), winter: spikes('winter'), crystal: spikes('crystal') },
    lantern: [lantern(false), lantern(true)],
    sign: signFrames(),
    shot: shot(ramp(['#0a6a80', '#2ad8ff', '#d8fbff', '#ffffff'], 4)),
    spreadShot: shot(ramp(['#8a4a00', '#ffb02e', '#fff2a0', '#ffffff'], 4)),
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
    },
  };
}
