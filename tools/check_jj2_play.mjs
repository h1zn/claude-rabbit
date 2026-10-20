// Stuck-spot check on the game's own physics: from every place the player
// can stand, play short scripted moves (walks, jumps, run-ups, crouch super
// jumps, Jazz's copter, Spaz's double jump, dropping through, climbing,
// swimming) through Game.update, so springs, poles, vines, tubes, water,
// platforms and warps act exactly as in play. Where each move settles is an
// edge. A place reachable from the start with no way back to it (and no
// exit, and nothing to die on and respawn) is a trap.
//
// Runs in the browser on a loaded game (window.kip.play(key) first):
// explore(game) -> { nodes, exitReached, traps, ... }.
// tools/check_jj2_run.mjs --play drives it over every level.

const T = 32;

// Scripted moves: [ticks, ...keys held], played in order. `vx` starts the
// move at that speed (a run-up); `as` plays it as that character.
const MOVES = [];
for (const d of ['left', 'right']) {
  MOVES.push({ steps: [[10, d]] }, { steps: [[30, d]] });
  MOVES.push({ steps: [[45, 'jump', d]] }, { steps: [[8, 'jump', d]] });
  MOVES.push({ vx: d === 'left' ? -8 : 8, steps: [[45, 'jump', d]] });
  MOVES.push({ steps: [[18, 'down'], [45, 'jump', d]] });
  MOVES.push({ as: 'jazz', steps: [[24, 'jump', d], [2, d], [150, 'jump', d]] });
  MOVES.push({ as: 'spaz', steps: [[16, 'jump', d], [2, d], [45, 'jump', d]] });
  MOVES.push({ steps: [[40, d, 'up']] }, { steps: [[40, d, 'down']] });
  const back = d === 'left' ? 'right' : 'left';
  MOVES.push({ steps: [[14, d], [45, 'jump', d]] });                         // walk, then jump
  MOVES.push({ steps: [[22, 'jump', d], [30, 'jump', back]] });               // turn in the air
  MOVES.push({ steps: [[40, 'jump', d], [2, d], [40, 'jump', d], [2, d], [40, 'jump', d]] });   // hops
  MOVES.push({ steps: [[10, d], [20, back]] });                               // off a ledge, back under
}
MOVES.push({ steps: [[45, 'jump']] }, { steps: [[18, 'down'], [45, 'jump']] });
MOVES.push({ as: 'spaz', steps: [[16, 'jump'], [2], [45, 'jump']] });
MOVES.push({ steps: [[20, 'down']] }, { steps: [[60, 'up']] }, { steps: [[25, 'jump'], [30, 'down']] });

const CHARS = new Set(['jazz', 'spaz', 'lori']);

export function explore(game, { maxNodes = 5000 } = {}) {
  const g = game; const p = g.player; const L = g.level;
  const { w, h } = L;
  // Out of the way: enemies, pickups, the clock; open every breakable.
  g.enemies = []; g.pickups = []; g.enemyShots = [];
  g.coins = 9999;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (!'xmpKW'.includes(L.tiles[ty][tx])) continue;
    L.tiles[ty][tx] = '.';
    if (L.masks) L.masks[ty * w + tx] = null;
  }
  if (L.triggers) for (const id of L.triggers.keys()) L.setTrigger(id, true);
  const audio = g.audio; const ctx = audio.ctx; audio.ctx = null;
  const startChar = p.character;

  const cell = () => {
    const tx = Math.floor(p.cx / T); const ty = Math.floor((p.y + p.h - 1) / T);
    return tx >= 0 && ty >= 0 && tx < w && ty < h ? ty * w + tx : -1;
  };
  const saved = new Map();     // node -> player state to start its moves from
  const snapshot = () => {
    const s = {};
    for (const k of Object.keys(p)) if (typeof p[k] !== 'function') s[k] = p[k];
    return s;
  };
  const restore = (s) => { Object.assign(p, s); p.prevX = p.x; p.prevY = p.y; };

  let held = new Set(); let prev = new Set();
  const input = {
    held: (k) => held.has(k),
    pressed: (k) => held.has(k) && !prev.has(k),
    released: (k) => prev.has(k) && !held.has(k),
    padPressed: () => false,
  };
  const tick = () => {
    p.invuln = 50; p.health = Math.max(p.health, 1);
    g.update(input);
    prev = held;
  };
  // Play a move from a state; where it settles: a node, -2 death, -3 exit.
  const play = (state, move) => {
    restore(state);
    if (move.as && CHARS.has(move.as)) p.character = move.as;
    if (move.vx) { p.vx = move.vx; p.dash = 30; }
    let hurt = false;
    const run = (keys, n) => {
      held = new Set(keys);
      for (let t = 0; t < n; t++) {
        const hp = p.health; tick();
        if (p.health < hp) hurt = true;
        if (p.dead || g.state !== 'play') return true;
      }
      return false;
    };
    let over = false;
    for (const [n, ...keys] of move.steps) { if ((over = run(keys, n))) break; }
    // Let go and wait to settle: standing, hanging, or still in water.
    if (!over) {
      held = new Set();
      let calm = 0;
      for (let t = 0; t < 240; t++) {
        const x = p.x; const y = p.y;
        const hp = p.health; tick();
        if (p.health < hp) hurt = true;
        if (p.dead || g.state !== 'play') { over = true; break; }
        const still = Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5;
        calm = (p.onGround || p.hang || p.swimming || p.platform) && (still || p.swimming || p.platform) ? calm + 1 : 0;
        if (calm > 4) break;
      }
    }
    p.character = startChar;
    if (g.state !== 'play') { g.state = 'play'; g.clearTime = 0; return [-3, hurt]; }
    if (p.dead) return [-2, hurt];
    return [cell(), hurt];
  };

  // Start where the level puts the player.
  p.spawn(g.respawn.x, g.respawn.y);
  for (let t = 0; t < 120 && !p.onGround; t++) { held = new Set(); tick(); }
  const start = cell();
  saved.set(start, snapshot());
  const fwd = new Map();
  const queue = [start];
  const seen = new Set([start]);
  let exitReached = false;
  for (let q = 0; q < queue.length && queue.length < maxNodes; q++) {
    const i = queue[q];
    const out = new Set();
    for (const move of MOVES) {
      const [n, hurt] = play(saved.get(i), move);
      if (hurt) out.add(-2);
      if (n === -3) exitReached = true;
      if (n < 0) { out.add(n); continue; }
      if (n === i) continue;
      out.add(n);
      if (!seen.has(n)) { seen.add(n); saved.set(n, snapshot()); queue.push(n); }
    }
    fwd.set(i, out);
  }
  audio.ctx = ctx;

  const back = new Map();
  for (const [i, out] of fwd) for (const n of out) if (n >= 0) { if (!back.has(n)) back.set(n, []); back.get(n).push(i); }
  const home = new Set();
  const bq = [];
  // Home: the start and the places right by it (a move rarely lands on
  // the start's own cell), and anywhere with a way out.
  const near = (i) => Math.abs((i % w) - (start % w)) <= 2 && Math.abs(Math.floor(i / w) - Math.floor(start / w)) <= 1;
  // Right by an exit is out too (a move that finishes the level there can
  // leave the explorer standing beside it).
  const exits = [...L.objects.filter((o) => o.type === 'exit'), ...L.entities.filter((e) => e.ch === 'E')];
  const byExit = (i) => exits.some((o) => Math.abs((i % w) - o.tx) <= 2 && Math.abs(Math.floor(i / w) - o.ty) <= 2);
  for (const [i, out] of fwd) if (near(i) || byExit(i) || out.has(-2) || out.has(-3)) { home.add(i); bq.push(i); }
  for (let k = 0; k < bq.length; k++) for (const pr of back.get(bq[k]) || []) if (!home.has(pr)) { home.add(pr); bq.push(pr); }
  const trapped = queue.filter((i) => fwd.has(i) && !home.has(i));
  const group = new Map(); const traps = [];
  for (const i of trapped) {
    if (group.has(i)) continue;
    const cells = [i]; group.set(i, traps.length);
    for (let k = 0; k < cells.length; k++) {
      for (const n of [...(fwd.get(cells[k]) || []), ...(back.get(cells[k]) || [])]) {
        if (n >= 0 && fwd.has(n) && !home.has(n) && !group.has(n)) { group.set(n, traps.length); cells.push(n); }
      }
    }
    const xs = cells.map((c) => c % w); const ys = cells.map((c) => Math.floor(c / w));
    const entry = queue.find((pr) => home.has(pr) && [...(fwd.get(pr) || [])].some((n) => cells.includes(n)));
    traps.push({ size: cells.length, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), cells: cells.slice(0, 40).map((c) => [c % w, Math.floor(c / w)]), from: entry === undefined ? null : [entry % w, Math.floor(entry / w)] });
  }
  traps.sort((a, b) => b.size - a.size);
  const outOf = (x, y) => [...(fwd.get(y * w + x) || [])].map((n) => (n < 0 ? n : `${n % w},${Math.floor(n / w)}${home.has(n) ? 'h' : ''}`));
  const far = (n) => queue.filter((i) => fwd.has(i)).sort((a, b) => (b % w) - (a % w)).slice(0, n).map((i) => [i % w, Math.floor(i / w)]);
  return { far, outOf, nodes: queue.length, explored: fwd.size, start: [start % w, Math.floor(start / w)], exitReached, traps, home: [...home], reached: queue };
}
