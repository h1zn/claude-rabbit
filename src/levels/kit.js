// Shared helpers for the level designs: scenery, ladders, item shapes and the
// room-maze builder. Coordinates are tiles (32 px).

import { rng } from '../paint.js';

export { Builder } from '../level.js';
export { rng };

// Scatter scenery along the ground between two columns.
export function scenery(L, kinds, from, to, seed, every = 5, opts = {}) {
  const r = rng(seed);
  for (let c = from; c < to; c += every + Math.floor(r() * 3)) {
    if (L.tops[c] === null || L.tops[c - 1] === null || L.tops[c + 1] === null) continue;
    L.decoAt(kinds[Math.floor(r() * kinds.length)], c, { v: Math.floor(r() * 3), ...opts });
  }
}

// Scenery on the first ground at or below row `from`, on flat spots with
// nothing standing there, every `every` columns or so.
export function dress(L, kinds, x0, x1, from, seed, every = 6) {
  const r = rng(seed);
  for (let c = x0; c < x1; c += every + Math.floor(r() * 4)) {
    const top = L.surface(c, from);
    if (top >= L.h || L.surface(c - 1, from) !== top || L.surface(c + 1, from) !== top) continue;
    if (L.grid[top][c] !== '#' && L.grid[top][c] !== '=') continue;
    if (L.grid[top - 1]?.[c] !== '.' || L.grid[top - 2]?.[c] !== '.') continue;
    L.deco(kinds[Math.floor(r() * kinds.length)], c, top, { v: Math.floor(r() * 4) });
  }
  return L;
}

// An item or enemy standing on the surface at a column.
export function on(L, x, ch) { return L.put(x, L.above(x), ch); }

// A loot vault standing on the floor of row `row` (the row Kip stands in):
// `w` wide, `h` tall inside, with a weapon-block door on its left side that
// only `weapon` breaks (manual: "Weapon Block").
export function weaponVault(L, x, row, weapon, { w = 7, h = 2, loot = 'g', door = 'left' } = {}) {
  L.block(x, row - h, w, 1);
  const dx = door === 'left' ? x : x + w - 1;
  const bx = door === 'left' ? x + w - 1 : x;
  L.weaponBlock(dx, row - h + 1, 1, h, weapon).block(bx, row - h + 1, 1, h);
  for (let c = x + 1; c < x + w - 1; c++) L.put(c, row, loot);
  return L;
}

// Ammo for `weapon` standing on the first ground at or below row `from`.
export function ammoOn(L, x, weapon, from = 0) { return L.ammo(x, L.surface(x, from) - 1, weapon); }

// One-way ledges up a shaft, every `step` rows, alternating sides, so Kip can
// hop up a tall shaft (he jumps through one-way ledges from below).
export function ladder(L, x, w, top, bottom, step = 3) {
  for (let r = bottom - step, i = 0; r > top; r -= step, i++) L.plat(i % 2 ? x : x + w - 3, r, 3);
  return L;
}

// Room maze on a grid of cells (cw x ch tiles each). A seeded spanning tree
// links every room: side doors, or a hole in the floor with a spring below to
// come back up. Some doors need blocks smashed (blast, countdown, speed), some
// holes have butt-stomp lids, and a few extra loop doors are switch blocks
// (shortcuts only, so the switch can never lock you out). Warp tubes join
// far rooms, the exit is in the room farthest from the start, two dead ends
// become secret rooms, and one cell is a bonus room reached by Coin Warp.
// `irregular` shrinks rooms at random (caves) and joins them with tunnels.
export function roomMaze(L, { cols, rows, cw, ch, seed, start, bonus, irregular = false, enemies, theme }) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  L.fill(0, 0, cols * cw, rows * ch, '#');
  L.wall(0, 0, cols * cw, rows * ch);
  const id = (x, y) => y * cols + x;
  const rooms = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Room interior: x0..x1 columns, top..floor-1 rows (floor = solid row).
      const ox = x * cw; const oy = y * ch;
      let x0 = ox + 1; let x1 = ox + cw - 2; let top = oy + 1;
      if (irregular && !(x === start[0] && y === start[1])) {
        x0 += Math.floor(r() * 3); x1 -= Math.floor(r() * 3); top += Math.floor(r() * 2);
      }
      const floor = oy + ch - 2;
      rooms.push({ x, y, x0, x1, top, floor, links: 0 });
      L.carve(x0, top, x1 - x0 + 1, floor - top);
    }
  }
  const isBonus = (x, y) => x === bonus[0] && y === bonus[1];
  // Spanning tree by depth-first search from the start room.
  const seen = new Set([id(...start)]);
  const stack = [start];
  const edges = [];
  const depth = new Map([[id(...start), 0]]);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen.has(id(nx, ny)) && !isBonus(nx, ny));
    if (!next.length) { stack.pop(); continue; }
    const n = pick(next);
    seen.add(id(...n));
    depth.set(id(...n), depth.get(id(x, y)) + 1);
    edges.push([[x, y], n, true]);
    stack.push(n);
  }
  // Extra loop doors between side-by-side rooms.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x + 1 < cols; x++) {
      if (isBonus(x, y) || isBonus(x + 1, y)) continue;
      const tree = edges.some(([a, b]) => (a[0] === x && a[1] === y && b[0] === x + 1 && b[1] === y) || (b[0] === x && b[1] === y && a[0] === x + 1 && a[1] === y));
      if (!tree && r() < 0.3) edges.push([[x, y], [x + 1, y], false]);
    }
  }
  const room = (x, y) => rooms[id(x, y)];
  const gates = ['x', 'c', 'p', null, null, null];
  for (const [a, b, tree] of edges) {
    const A = room(...a); const B = room(...b);
    A.links++; B.links++;
    if (a[1] === b[1]) {
      // Side door at floor level through the wall between the rooms.
      const [left, right] = a[0] < b[0] ? [A, B] : [B, A];
      const fl = Math.min(left.floor, right.floor);
      L.carve(left.x1 + 1, fl - 3, right.x0 - left.x1 - 1, 3);
      const gx = left.x1 + 1;
      const gate = tree ? pick(gates) : 'u';
      if (gate === 'x') L.breakable(gx, fl - 3, 1, 3);
      else if (gate === 'c') L.countdown(gx, fl - 3, 1, 3, 1 + Math.floor(r() * 3));
      else if (gate === 'p' && left.x1 - left.x0 > 10) L.speedBlocks(gx, fl - 3, 1, 3);
      else if (gate === 'u') L.fill(gx, fl - 3, 1, 3, 'u');
    } else {
      // Hole in the floor of the upper room; spring below it.
      const [up, down] = a[1] < b[1] ? [A, B] : [B, A];
      const hx = Math.max(up.x0, down.x0) + 2 + Math.floor(r() * Math.max(1, Math.min(up.x1, down.x1) - Math.max(up.x0, down.x0) - 6));
      L.carve(hx, up.floor, 3, down.top - up.floor);
      // Stomp lids only where the tree reaches the upper room first, so Kip
      // always meets a lid from above.
      if (tree && up === A && r() < 0.35) L.stomp(hx, up.floor, 3, 1);
      // The spring sits under the hole's edge, so it throws Kip back up.
      L.put(hx + 2, down.floor - 1, 'T');
      down.spring = true;
    }
  }
  // Furnish each room.
  for (const R of rooms) {
    if (isBonus(R.x, R.y)) continue;
    const w = R.x1 - R.x0 + 1;
    if (r() < 0.55) shape(L, R.x0 + 2 + Math.floor(r() * Math.max(1, w - 9)), R.floor - 3, pick(['hump', 'arc', 'line5', 'diamond']), 'o');
    if (R.floor - R.top >= 7) {
      const px = R.x0 + 2 + Math.floor(r() * Math.max(1, w - 8));
      L.plat(px, R.floor - 4, 4).row(px, R.floor - 5, 4, pick(['*', '*', 'g', '$']));
    }
    if (r() < 0.75) {
      // Only on bare floor: not over a hole, a spring or another thing.
      const ex = R.x0 + 3 + Math.floor(r() * (w - 6));
      const kind = pick(enemies);
      if (L.grid[R.floor - 1][ex] === '.' && L.grid[R.floor][ex] === '#') L.put(ex, R.floor - 1, kind);
    }
    if (r() < 0.3) L.put(R.x0 + 2 + Math.floor(r() * (w - 4)), R.top + 1, 'f');
    if (r() < 0.3) L.row(R.x0 + 3, R.top + 2, Math.min(4, w - 6), '$');
  }
  // Warp tube pairs between far-apart rooms.
  const far = rooms.filter((R) => !isBonus(R.x, R.y) && !(R.x === start[0] && R.y === start[1]));
  for (let k = 0; k < 3; k++) {
    const A = pick(far); const B = pick(far.filter((R) => Math.abs(R.x - A.x) + Math.abs(R.y - A.y) >= 4));
    if (!B || A.warped || B.warped) continue;
    A.warped = B.warped = true;
    // On a ledge by the room's left wall: warps touch-trigger, and one on the
    // floor in front of a door caught everyone walking through.
    const perch = (R, id, to) => {
      if (R.floor - R.top >= 6) { L.plat(R.x0 + 1, R.floor - 3, 3); L.warp(R.x0 + 2, R.floor - 4, id, to); } else L.warp(R.x0 + 1, R.floor - 1, id, to);
    };
    perch(A, `${theme}w${k}a`, `${theme}w${k}b`);
    perch(B, `${theme}w${k}b`, `${theme}w${k}a`);
  }
  // Exit in the deepest room; secrets in dead ends.
  const order = [...depth.entries()].sort((p, q) => q[1] - p[1]).map(([k]) => rooms[k]);
  const exit = order[0];
  const deadEnds = order.filter((R) => R.links === 1 && R !== exit && !R.warped).slice(0, 2);
  // A free floor cell in a room at or after column `from` (offset from x0).
  const spot = (R, from = 1, dir = 1) => {
    for (let k = 0; k <= R.x1 - R.x0; k++) {
      const c = dir > 0 ? R.x0 + from + k : R.x1 - from - k;
      if (c < R.x0 || c > R.x1) continue;
      if (L.grid[R.floor - 1][c] === '.' && L.grid[R.floor][c] === '#' && L.grid[R.floor - 2][c] === '.') return c;
    }
    return R.x0 + from;
  };
  return { rooms, exit, deadEnds, room, spot, startRoom: room(...start), bonusRoom: room(...bonus) };
}


// Item shapes as [dx, dy] offsets from their top-left cell. Placing items in
// small shapes along a route reads as a trail; carpets of food read as mess.
export const SHAPES = {
  hump: [[0, 1], [1, 0], [2, 0], [3, 1]],
  arc: [[0, 2], [1, 1], [2, 0], [3, 0], [4, 1], [5, 2]],
  line3: [[0, 0], [1, 0], [2, 0]],
  line5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  col3: [[0, 0], [0, 1], [0, 2]],
  diamond: [[1, 0], [0, 1], [2, 1], [1, 2]],
  ring: [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]],
  arrow: [[0, 1], [1, 1], [2, 1], [2, 0], [2, 2], [3, 1]],
  arrowUp: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]],
};

// Put a shape with its top-left at (x, y), only into empty cells.
export function shape(L, x, y, name, ch = 'o') {
  for (const [dx, dy] of SHAPES[name]) if (L.grid[y + dy]?.[x + dx] === '.') L.put(x + dx, y + dy, ch);
  return L;
}

// A shape hovering `lift` cells above the first ground at or below row
// `from` under column x.
export function over(L, x, from, name, ch = 'o', lift = 1) {
  const h = Math.max(...SHAPES[name].map(([, dy]) => dy)) + 1;
  return shape(L, x, L.surface(x, from) - lift - h + 1, name, ch);
}
