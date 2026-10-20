// Stuck-spot check for the JJ2 levels: a coarse search over the places a
// player can stand, on the level's real collision masks, with a generous
// movement envelope (running jumps, copter glides, springs, poles, vines,
// water, float-up, wind, tubes, moving platforms, warps; breakable and
// trigger scenery count as open). A place the player can get to but never
// get back from - no way back to the start, no exit, no spikes or fall to
// die on and respawn - is a trap. Runs in the browser (tools/check_jj2_run.mjs
// drives it): analyze(level) -> { traps, exitReached, nodes }.

import { BOSS_CHARS } from '../src/bosses.js';
import { EV } from '../src/jj2/level.js';

const T = 32;
const BODY_W = 18;
const BODY_H = 28;
const JUMP = 6 * T;              // highest jump (running jump, Spaz's double jump)
const REACH = 9;                 // tiles across in one jump (run-up, copter glide)
const SPRING = { S: 8, T: 13, U: 19 };
const OPEN = new Set(['x', 'm', 'p', 'K', 'W']);   // breakable scenery

export function analyze(level, { party = false } = {}) {
  const { w, h } = level;
  const H = level.pixelH;
  const triggerCells = new Set();
  for (const list of level.triggers.values()) for (const t of list) triggerCells.add(t.i);
  const cellOpen = (tx, ty) => OPEN.has(level.tiles[ty] && level.tiles[ty][tx]) || triggerCells.has(ty * w + tx);
  // Solid for the body (breakables and trigger scenery let it through).
  const solid = (x, y, oneWay = false) => {
    if (x < 0 || x >= level.pixelW) return true;
    if (y < 0 || y >= H) return false;
    if (cellOpen(x >> 5, y >> 5)) return false;
    return level.solidPx(x, y, oneWay);
  };
  // The body stands with its feet at y (column center cx): nothing in it.
  // Slopes: the body stands on its center, so its sides may dip into a
  // slope near the feet.
  const clear = (cx, y) => {
    for (let yy = y - 1; yy > y - BODY_H; yy -= 6) {
      if (solid(cx, yy)) return false;
      if (yy < y - 10 && (solid(cx - BODY_W / 2 + 1, yy) || solid(cx + BODY_W / 2 - 1, yy))) return false;
    }
    return !solid(cx - BODY_W / 2 + 1, y - BODY_H + 1) && !solid(cx + BODY_W / 2 - 1, y - BODY_H + 1);
  };
  const support = (cx, y) => solid(cx, y + 1, true) || solid(cx - 7, y + 1, true) || solid(cx + 7, y + 1, true);

  // Free-movement cells: water (at its highest), float-up, wind, tubes,
  // moving platforms' sweep.
  let water = level.water === Infinity ? Infinity : level.water;
  for (let i = 0; i < level.areas.length; i++) {
    if (level.areas[i] !== EV.SET_WATER) continue;
    const height = level.areaParams[i] & 0xff;
    water = Math.min(water, height * T);
  }
  const free = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = level.areas[i];
    if (a === EV.FLOAT_UP || a === EV.WIND_LEFT || a === EV.WIND_RIGHT || a === EV.TUBE) free[i] = 1;
    if ((Math.floor(i / w) + 1) * T > water) free[i] = 1;
  }
  for (const p of level.platforms || []) {
    const r = Math.ceil((Math.max(1, p.length) * 12 + 40) / T);
    const cx = Math.floor(p.x / T); const cy = Math.floor(p.y / T);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < w && y < h) free[y * w + x] = 1;
  }
  // Poles catch a flying player and fling them on: free movement around them.
  for (const o of level.objects) {
    if (o.type !== 'pole') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = o.tx + dx; const y = o.ty + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) free[y * w + x] = 1;
    }
  }
  const vine = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && (level.areas[ty * w + tx] === EV.VINE || level.areas[ty * w + tx] === EV.HOOK);
  const hurtCell = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && (level.areas[ty * w + tx] === EV.HURT || level.tiles[ty][tx] === '^');

  // Nodes: one stand per cell (the highest feet position in it), vines
  // (hanging below), and free cells.
  const feet = new Int32Array(w * h).fill(-1);
  const kind = new Uint8Array(w * h);   // 1 stand, 2 vine, 3 free
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      const cx = tx * T + 16;
      if (free[i] && !solid(cx, ty * T + 16)) { feet[i] = ty * T + 28; kind[i] = 3; continue; }
      for (let y = ty * T; y < ty * T + T; y += 2) {
        if (support(cx, y) && clear(cx, y)) { feet[i] = y; kind[i] = 1; break; }
      }
      if (kind[i]) continue;
      if (vine(tx, ty) && clear(cx, ty * T + 8 + BODY_H)) { feet[i] = ty * T + 8 + BODY_H; kind[i] = 2; }
    }
  }

  const springAt = new Map();
  for (const e of level.entities) {
    if (SPRING[e.ch]) springAt.set(e.ty * w + e.tx, SPRING[e.ch] * T);
    if (e.ch === '<' || e.ch === '>') springAt.set(e.ty * w + e.tx, -(e.ch === '>' ? 1 : -1));
  }

  const warpsFrom = new Map();          // cell -> target cell
  const targets = new Map();
  for (const o of level.objects) if (o.type === 'warp' && o.exitOnly) targets.set(o.id, o);
  for (const o of level.objects) {
    if (o.type !== 'warp' || o.exitOnly) continue;
    const t = targets.get(o.to);
    if (t) warpsFrom.set(o.ty * w + o.tx, t.ty * w + t.tx);
  }
  // Exits, and bosses (beating one ends its level or opens the exit), with
  // some room around them: a player near one gets to it.
  const exitCells = new Set();
  const mark = (tx, ty, r) => { for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (x >= 0 && y >= 0 && x < w && y < h) exitCells.add(y * w + x); };
  for (const o of level.objects) if (o.type === 'exit') mark(o.tx, o.ty, 1);
  for (const e of level.entities) if (e.ch === 'E') mark(e.tx, e.ty, 2);
  for (const e of level.entities) if (BOSS_CHARS[e.ch]) mark(e.tx, e.ty, 4);

  // Column drop from feet height y at column tx: the first node below that
  // the body falls onto, or -2 for falling out of the level (death).
  const drop = (tx, y) => {
    const cx = tx * T + 16;
    for (let yy = y; yy < H + T; yy += 4) {
      if (yy >= H) return -2;
      if (!clear(cx, yy)) return -1;
      const ty = yy >> 5;
      const i = ty * w + tx;
      if (kind[i] && feet[i] >= yy - 3 && feet[i] <= yy + 4) return i;
      if (kind[i] === 3) return i;
      if (kind[i] === 2) return i;        // catch a vine on the way down
    }
    return -2;
  };

  // Edges of node i (cells; -2 = death; -3 = exit).
  const edges = (i) => {
    const out = new Set();
    const tx = i % w; const ty = (i - tx) / w;
    const y0 = feet[i];
    const cx0 = tx * T + 16;
    if (exitCells.has(i) || exitCells.has(i - w)) out.add(-3);
    if (hurtCell(tx, ty) || hurtCell(tx, ty - 1)) out.add(-2);
    const warp = warpsFrom.get(i) ?? warpsFrom.get(i - w);
    if (warp !== undefined) {
      const wtx = warp % w; const wty = (warp - wtx) / w;
      const land = drop(wtx, Math.min(H - 1, wty * T + 28));
      out.add(land === -1 ? warp : land);
    }
    // Free movement: any neighbour that's a node or open.
    if (kind[i] === 3) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx; const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (kind[n]) out.add(n);
        else if (clear(nx * T + 16, ny * T + 28)) { const d = drop(nx, ny * T + 28); if (d !== -1) out.add(d); }
      }
      // Up out of the top of water / a float-up column onto a ledge beside.
    }
    // Walking: to the neighbouring column's stand within a slope's rise.
    if (kind[i] === 1) {
      for (const dx of [-1, 1]) {
        const nx = tx + dx;
        if (nx < 0 || nx >= w) continue;
        for (let ny = ty - 1; ny <= ty + 1; ny++) {
          if (ny < 0 || ny >= h) continue;
          const n = ny * w + nx;
          if (!kind[n] || Math.abs(feet[n] - y0) > 34) continue;
          if (clear(cx0 + dx * 16, Math.round((y0 + feet[n]) / 2))) out.add(n);
        }
      }
    }
    // Vines: along them.
    if (kind[i] === 2) for (const dx of [-1, 1]) if (vine(tx + dx, ty) && kind[i + dx]) out.add(i + dx);
    let up = kind[i] === 2 ? 3 * T : JUMP;
    // A spring in the cell, above it, or set into the floor below.
    const sp = springAt.get(i) ?? springAt.get(i - w) ?? springAt.get(i + w);
    if (typeof sp === 'number' && sp > 0) up = Math.max(up, sp);
    // Sideways springs and horizontal poles: a long flight across.
    const across = sp === 'pole' || (typeof sp === 'number' && sp < 0) ? 14 : REACH;
    // Arcs: up the start column to an apex, across, down the target column.
    for (let a = y0; a >= Math.max(BODY_H, y0 - up); a -= 8) {
      if (!clear(cx0, a)) break;
      for (const dir of [-1, 1]) {
        for (let k = 0; k <= across; k++) {
          const nx = tx + dir * k;
          if (nx < 0 || nx >= w) break;
          if (k && !clear(nx * T + 16, a)) break;
          if (!k && a === y0) continue;
          const d = drop(nx, a);
          if (d >= 0) out.add(d);
          else if (d === -2) out.add(-2);
        }
      }
    }
    out.delete(i);
    return out;
  };

  // Start: the node at or under the level's start.
  const st = level.entities.find((e) => e.ch === 'P') || { tx: 2, ty: 2 };
  let start = -1;
  for (let ty = st.ty; ty < h && start < 0; ty++) if (kind[ty * w + st.tx]) start = ty * w + st.tx;
  if (start < 0) for (let ty = st.ty - 1; ty >= 0 && start < 0; ty--) if (kind[ty * w + st.tx]) start = ty * w + st.tx;
  for (let r = 1; r <= 3 && start < 0; r++) {
    for (const x of [st.tx - r, st.tx + r]) for (let ty = st.ty - 2; ty < h && start < 0 && x >= 0 && x < w; ty++) if (kind[ty * w + x]) start = ty * w + x;
  }
  if (start < 0) return { error: 'no start node' };

  // Forward search; dying returns to the start, so death counts as a way back.
  const fwd = new Map();
  const seen = new Uint8Array(w * h);
  const queue = [start];
  seen[start] = 1;
  let exitReached = false;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const out = edges(i);
    fwd.set(i, out);
    for (const n of out) {
      if (n === -3) { exitReached = true; continue; }
      if (n < 0 || seen[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  // Backward: nodes with a way back to the start (or out: exit, death).
  const back = new Map();
  for (const [i, out] of fwd) for (const n of out) if (n >= 0) { if (!back.has(n)) back.set(n, []); back.get(n).push(i); }
  const home = new Uint8Array(w * h);
  const bq = [];
  for (const [i, out] of fwd) if (i === start || out.has(-2) || out.has(-3)) { home[i] = 1; bq.push(i); }
  for (let q = 0; q < bq.length; q++) for (const p of back.get(bq[q]) || []) if (!home[p]) { home[p] = 1; bq.push(p); }

  // Traps: reachable, no way home; grouped by edges between them.
  const trapped = queue.filter((i) => !home[i]);
  const group = new Map();
  const traps = [];
  for (const i of trapped) {
    if (group.has(i)) continue;
    const cells = [i];
    group.set(i, traps.length);
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q];
      const near = [...(fwd.get(c) || []), ...(back.get(c) || [])];
      for (const n of near) if (n >= 0 && !home[n] && seen[n] && !group.has(n)) { group.set(n, traps.length); cells.push(n); }
    }
    const xs = cells.map((c) => c % w); const ys = cells.map((c) => Math.floor(c / w));
    // How it's entered: a reachable home node with an edge into it.
    const entry = queue.find((p) => home[p] && [...fwd.get(p)].some((n) => n >= 0 && cells.includes(n)));
    traps.push({
      size: cells.length, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
      cell: [xs[0], ys[0]], from: entry === undefined ? null : [entry % w, Math.floor(entry / w)],
    });
  }
  traps.sort((a, b) => b.size - a.size);
  const debug = (x0, y0, x1, y1) => {
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let r = '';
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        r += i === start ? 'P' : seen[i] ? (home[i] ? 'o' : '!') : kind[i] === 1 ? '_' : kind[i] === 2 ? 'v' : kind[i] === 3 ? '~' : level.tiles[y][x] === '#' ? '#' : level.tiles[y][x] === 's' ? 's' : '.';
      }
      rows.push(r);
    }
    return rows.join('\n');
  };
  let stands = 0; for (let i = 0; i < w * h; i++) if (kind[i]) stands++;
  const exits = [...exitCells].slice(0, 3).map((c) => [c % w, Math.floor(c / w)]);
  // Unreached nodes right next to reached ones: where the search gives up.
  const frontier = [];
  for (let i = 0; i < w * h; i++) {
    if (!kind[i] || seen[i]) continue;
    const x = i % w; const y = (i - x) / w;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * w + x + dx; if (j >= 0 && j < w * h && seen[j]) { near = true; break; } }
    if (near) frontier.push([x, y, kind[i]]);
  }
  const edgesOf = (x, y) => [...edges(y * w + x)].map((n) => (n < 0 ? n : [n % w, Math.floor(n / w), feet[n], kind[n]]));
  const nodeAt = (x, y) => [kind[y * w + x], feet[y * w + x]];
  return { frontier, edgesOf, nodeAt, exits, nodes: queue.length, stands, start: [start % w, Math.floor(start / w)], exitReached, hasExit: exitCells.size > 0, traps, debug };
}
