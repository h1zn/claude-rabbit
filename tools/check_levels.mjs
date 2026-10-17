// Reachability check for the level designs: a coarse search over the tiles
// Kip can stand on, using his movement envelope (jumps, super jumps, hover,
// springs, poles, warps). Breakable blocks count as open, since Kip can
// smash them. Reports the exit, checkpoints, secrets and pickups he cannot
// reach, and writes a map per level (tools/out/<n>.txt) where '@' marks
// reachable standing spots.
//
// usage: node tools/check_levels.mjs [levelNumber]

import { mkdirSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/levels.js';

const OPEN_BLOCKS = new Set(['x', 'm', 'c', 'p', 'Y', 'u']);
const SOLID = new Set(['#', '=', 'i']);
const SLOPE = new Set(['/', '\\', 'q', 'r', 'y', 'z']);
// Measured in game with the original physics (tiles of rise): standing jump
// 4.1, walking jump 4.6, running jump 6.5, super jump 6.5, springs 7.9 /
// 13.2 / 18.5. The search keeps a little margin.
const JUMP = 3;          // from a standstill
const WALK_JUMP = 4;     // with 2+ tiles of walk-up
const RUN_JUMP = 6;      // with 4+ tiles of run-up
const SUPER_JUMP = 6;    // crouch + jump, straight up
const SPRING = { S: 7, T: 12, U: 18 };
const PICKUPS = new Set('*gbv$@o+%1AFQ'.split(''));

function check(make, index) {
  const level = make();
  const { w, h } = level;
  const ents = level.entities;
  const at = (x, y) => (x < 0 || x >= w ? '=' : y < 0 ? '.' : y >= h ? '=' : level.tiles[y][x]);
  const blocked = (x, y) => SOLID.has(at(x, y));
  const open = (x, y) => !blocked(x, y) || OPEN_BLOCKS.has(at(x, y));
  const free = (x, y) => (x >= 0 && x < w && y < h) && (SOLID.has(at(x, y)) ? false : true);
  const support = (x, y) => SOLID.has(at(x, y)) || at(x, y) === '-' || SLOPE.has(at(x, y)) || OPEN_BLOCKS.has(at(x, y));
  // Kip stands at (x, y) when his two cells are free and something holds him.
  const stand = (x, y) => y >= 1 && free(x, y) && free(x, y - 1) && !OPEN_BLOCKS.has(at(x, y))
    && !OPEN_BLOCKS.has(at(x, y - 1)) && at(x, y) !== '^' && at(x, y) !== '~' && at(x, y - 1) !== '~' && support(x, y + 1);
  const passable = (x, y) => x >= 0 && x < w && y < h && (y < 0 || open(x, y));
  const colClear = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (!passable(x, y)) return false; return true; };
  const rowClear = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (!passable(x, y) || !passable(x, y - 1)) return false; return true; };

  const springs = new Map();
  const poles = [];
  for (const e of ents) {
    if (SPRING[e.ch]) springs.set(`${e.tx},${e.ty}`, SPRING[e.ch]);
    if (e.ch === 'H' || e.ch === 'I') poles.push(e);
    if (e.ch === '>' || e.ch === '<') springs.set(`${e.tx},${e.ty}`, -(e.ch === '>' ? 1 : -1));
  }
  const warps = level.objects.filter((o) => o.type === 'warp');

  // Arc from a stand (x, y) to (tx, ty) through apex row a: up the start
  // column, across at the apex, down the target column.
  const arc = (x, y, tx, ty, a) => colClear(x, a - 1, y) && rowClear(a, x, tx) && colClear(tx, a - 1, ty);

  const seen = new Set();
  const queue = [];
  const start = ents.find((e) => e.ch === 'P');
  const push = (x, y) => {
    const k = `${x},${y}`;
    if (seen.has(k) || !stand(x, y)) return;
    seen.add(k);
    queue.push([x, y]);
  };
  // Land somewhere below (x, y) in column x, falling through open cells.
  const fall = (x, y) => {
    for (let yy = y; yy < h; yy++) {
      if (!passable(x, yy)) return null;
      if (stand(x, yy)) return yy;
    }
    return null;
  };
  push(start.tx, start.ty);
  const poleHit = new Set();
  const flown = new Set(); // cells passed through on a spring ride
  while (queue.length) {
    const [x, y] = queue.shift();
    const runway = (n) => [-1, 1].some((d) => Array.from({ length: n }, (_, k) => k + 1).every((k) => stand(x - d * k, y)));
    const up = runway(4) ? RUN_JUMP : runway(2) ? WALK_JUMP : JUMP;
    // Walk and drop off ledges.
    for (const d of [-1, 1]) {
      if (passable(x + d, y) && passable(x + d, y - 1)) {
        const l = fall(x + d, y);
        if (l !== null) push(x + d, l);
      }
      if (stand(x + d, y - 1)) push(x + d, y - 1); // step up a slope
    }
    // Jumps (with hover for distance).
    for (let ty = Math.max(1, y - SUPER_JUMP); ty < Math.min(h, y + 30); ty++) {
      const dy = y - ty;
      // Copter glide: 4 px across per px down (walk cap over a 1 px/tick descent).
      const reachUp = up === RUN_JUMP ? 12 : up === WALK_JUMP ? 7 : 4;
      const maxDx = dy > 0 ? (dy <= up ? reachUp : 2) : Math.min(40, (up === RUN_JUMP ? 14 : 8) + 4 * -dy);
      if (dy > up && dy > SUPER_JUMP) continue;
      for (let tx = x - maxDx; tx <= x + maxDx; tx++) {
        if (!stand(tx, ty)) continue;
        if (dy > up && Math.abs(tx - x) > 2) continue;
        const a = Math.min(y, ty) - 1;
        if (arc(x, y, tx, ty, a)) push(tx, ty);
      }
    }
    // Springs.
    const s = springs.get(`${x},${y}`);
    if (s > 0) {
      for (let k = 0; k <= s; k++) if (passable(x, y - k)) flown.add(`${x},${y - k}`); else break;
      for (let ty = Math.max(1, y - s); ty < y; ty++) {
        for (let tx = x - 7; tx <= x + 7; tx++) if (stand(tx, ty) && arc(x, y, tx, ty, ty - 1) && colClear(x, ty - 1, y)) push(tx, ty);
      }
    } else if (s) {
      for (let k = 1; k <= 22; k++) {
        const tx = x + s * k;
        if (!passable(tx, y) || !passable(tx, y - 1)) break;
        const l = fall(tx, y);
        if (l !== null) push(tx, l);
      }
    }
    // Poles in reach: treat the pole as a launch point.
    for (const p of poles) {
      const key = `${p.tx},${p.ty}`;
      if (poleHit.has(key)) continue;
      const dy = y - p.ty;
      if (dy < 0 || dy > up + 1 || Math.abs(p.tx - x) > 9) continue;
      if (!arc(x, y, p.tx, p.ty + 1, p.ty + 1)) continue;
      poleHit.add(key);
      if (p.ch === 'I') {
        for (let ty = Math.max(1, p.ty - 7); ty <= p.ty + 12; ty++) for (let tx = p.tx - 6; tx <= p.tx + 6; tx++) if (stand(tx, ty) && colClear(p.tx, Math.min(ty, p.ty) - 1, p.ty) && arc(p.tx, p.ty, tx, ty, Math.min(ty, p.ty) - 1)) push(tx, ty);
      } else {
        for (const d of [-1, 1]) {
          for (let k = 1; k <= 20; k++) {
            const tx = p.tx + d * k;
            if (!passable(tx, p.ty) || !passable(tx, p.ty + 1)) break;
            flown.add(`${tx},${p.ty}`);
            const l = fall(tx, p.ty + 1);
            if (l !== null) push(tx, l);
          }
        }
      }
    }
    // Warps.
    for (const wp of warps) {
      if (wp.exitOnly || Math.abs(wp.tx - x) > 1 || Math.abs(wp.ty - y) > 1) continue;
      const t = warps.find((o) => o.id === wp.to);
      if (t) push(t.tx, fall(t.tx, t.ty) ?? t.ty);
    }
  }

  // Something at (x, y) is reachable when a reachable stand can jump to it.
  const reach = (x, y) => {
    if ([-1, 0, 1].some((d) => flown.has(`${x + d},${y}`))) return true;
    // In the air over a gap: reachable stands on both sides, a little below.
    const side = (dir) => { for (let k = 1; k <= 12; k++) for (let sy = y + 1; sy <= y + 6; sy++) if (seen.has(`${x + dir * k},${sy}`)) return true; return false; };
    if (passable(x, y) && side(-1) && side(1)) return true;
    for (let sy = y; sy <= y + RUN_JUMP + 1; sy++) {
      for (let sx = x - 3; sx <= x + 3; sx++) {
        if (seen.has(`${sx},${sy}`) && colClear(sx, y, sy) && rowClear(Math.max(y, 1) + (y === sy ? 0 : 1), sx, x)) return true;
      }
    }
    return false;
  };
  const problems = [];
  const count = {};
  for (const e of ents) {
    count[e.ch] = (count[e.ch] || 0) + 1;
    if (e.ch === 'E' && !reach(e.tx, e.ty)) problems.push(`EXIT unreachable at ${e.tx},${e.ty}`);
    if (e.ch === 'C' && !reach(e.tx, e.ty)) problems.push(`checkpoint unreachable at ${e.tx},${e.ty}`);
    if (e.ch === 'X' && !reach(e.tx, e.ty)) problems.push(`secret unreachable at ${e.tx},${e.ty}`);
    if (PICKUPS.has(e.ch) && !reach(e.tx, e.ty)) problems.push(`pickup ${e.ch} unreachable at ${e.tx},${e.ty}`);
  }
  for (const wp of warps) {
    if (!wp.exitOnly && !reach(wp.tx, wp.ty)) problems.push(`warp ${wp.id} unreachable at ${wp.tx},${wp.ty}`);
    if (wp.to && !warps.find((o) => o.id === wp.to)) problems.push(`warp ${wp.id} -> missing ${wp.to}`);
  }
  const coins = ents.reduce((n, e) => n + (e.ch === '$' ? 1 : e.ch === '@' ? 5 : 0), 0);
  for (const wp of warps) if (wp.cost > coins) problems.push(`warp ${wp.id} costs ${wp.cost} but the level has ${coins} coins`);

  // Map dump.
  const rows = level.tiles.map((r) => r.slice());
  for (const k of seen) { const [x, y] = k.split(',').map(Number); if (rows[y][x] === '.') rows[y][x] = '@'; }
  for (const e of ents) rows[e.ty][e.tx] = e.ch;
  for (const o of level.objects) rows[o.ty][o.tx] = o.type === 'warp' ? 'W' : '?';
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`./out/${index + 1}.txt`, import.meta.url), rows.map((r) => r.join('')).join('\n'));

  const stands = [...seen].length;
  console.log(`${index + 1}. ${make.title}: ${w}x${h} tiles, ${stands} reachable spots, ${coins} coins, `
    + `${count.o || 0} food, ${['*', 'g', 'b', 'v'].map((c) => count[c] || 0).join('/')} gems r/g/b/p, `
    + `${['w', 'k', 'n', 'h', 'f', 'd', 'J', 'G'].reduce((n, c) => n + (count[c] || 0), 0)} enemies, ${count.X || 0} secrets, ${warps.length} warps`);
  // Merge runs like "pickup o unreachable at 20,9" .. "at 77,9" into one line.
  const merged = [];
  for (const p of problems) {
    const m = p.match(/^(.*) at (\d+),(\d+)$/);
    const last = merged[merged.length - 1];
    if (m && last && last.what === m[1] && last.y === +m[3]) { last.x1 = +m[2]; last.n++; continue; }
    merged.push(m ? { what: m[1], x0: +m[2], x1: +m[2], y: +m[3], n: 1 } : { text: p });
  }
  for (const r of merged) console.log('   ', r.text || (r.n > 1 ? `${r.what} x${r.n} at ${r.x0}-${r.x1},${r.y}` : `${r.what} at ${r.x0},${r.y}`));
  return problems.length;
}

const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;
let bad = 0;
LEVELS.forEach((make, i) => { if (only === null || only === i) bad += check(make, i); });
process.exitCode = bad ? 1 : 0;
