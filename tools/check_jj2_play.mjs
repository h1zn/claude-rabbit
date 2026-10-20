// Stuck-spot check on the game's own physics: from every place the player
// can stand, play short scripted moves (walks, jumps, run-ups, crouch super
// jumps, Jazz's copter, Spaz's double jump, dropping through, climbing,
// swimming) through Game.update, so springs, poles, vines, tubes, water,
// platforms and warps act exactly as in play. Where each move settles is an
// edge. A place reachable from the start with no way back to it (and no
// exit, and nothing to die on and respawn) is a trap.
//
// A floating lizard close by can be shot down for its copter, so flying on
// it is a move there too.
//
// Triggers are part of the state: a node is a cell plus the set of triggers
// that are on, so a trigger zone that closes a door behind the player is
// seen, and a trigger crate within reach (stomped or shot) is a move too.
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
  // Let go of the direction mid-air, to come down on a small block.
  MOVES.push({ steps: [[16, 'jump', d], [29, 'jump']] }, { steps: [[26, 'jump', d], [19, 'jump']] });
  MOVES.push({ vx: d === 'left' ? -8 : 8, steps: [[45, 'jump', d]] });
  MOVES.push({ steps: [[18, 'down'], [2, 'down', 'jump'], [43, 'jump', d]] });   // crouch super jump
  MOVES.push({ as: 'jazz', steps: [[24, 'jump', d], [2, d], [150, 'jump', d]] });
  MOVES.push({ as: 'spaz', steps: [[16, 'jump', d], [2, d], [45, 'jump', d]] });
  MOVES.push({ steps: [[40, d, 'up']] }, { steps: [[40, d, 'down']] });
  const back = d === 'left' ? 'right' : 'left';
  MOVES.push({ steps: [[14, d], [45, 'jump', d]] });                         // walk, then jump
  MOVES.push({ steps: [[22, 'jump', d], [30, 'jump', back]] });               // turn in the air
  MOVES.push({ steps: [[40, 'jump', d], [2, d], [40, 'jump', d], [2, d], [40, 'jump', d]] });   // hops
  MOVES.push({ steps: [[10, d], [20, back]] });                               // off a ledge, back under
  MOVES.push({ steps: [[18, 'jump'], [36, 'jump', d]] });                      // up, then over onto a ledge
  MOVES.push({ steps: [[18, 'jump'], [24, 'jump', d], [30, 'jump']] });        // ...a small one
}
MOVES.push({ steps: [[45, 'jump']] }, { steps: [[18, 'down'], [2, 'down', 'jump'], [43, 'jump']] });
MOVES.push({ as: 'spaz', steps: [[16, 'jump'], [2], [45, 'jump']] });
MOVES.push({ steps: [[20, 'down']] }, { steps: [[60, 'up']] }, { steps: [[25, 'jump'], [30, 'down']] });

// Hanging from a floating lizard's copter (shot down near the player, it
// is theirs to grab): the original's 279 ticks of flight.
const COPTER_TICKS = 279;
const COPTER_MOVES = [{ steps: [[150, 'up']] }];
for (const d of ['left', 'right']) {
  COPTER_MOVES.push({ steps: [[60, 'up'], [180, 'up', d]] }, { steps: [[120, 'up', d], [120, d]] }, { steps: [[240, d]] }, { steps: [[40, 'up'], [200, d]] });
}

// As a bird: long flights, since a bird only settles where it can stand.
const FLIGHTS = [{ steps: [[200, 'jump']] }, { steps: [[500, 'jump']] }];
for (const d of ['left', 'right']) {
  FLIGHTS.push({ steps: [[60, 'jump', d]] }, { steps: [[200, 'jump', d]] }, { steps: [[500, 'jump'], [120, 'jump', d]] }, { steps: [[200, 'jump'], [200, d]] }, { steps: [[300, 'down', d]] });
}

const CHARS = new Set(['jazz', 'spaz', 'lori']);

export function explore(game, { maxNodes = 5000, touch = false } = {}) {
  const g = game; const p = g.player; const L = g.level;
  const { w, h } = L;
  // Out of the way: enemies, pickups, the clock; open every breakable.
  // A boss area finishes the level (beating the boss it wakes ends it).
  const bossy = g.enemies.some((e) => e.boss);
  const lizards = g.enemies.filter((e) => /^lizardFloat/.test(e.skin || '')).map((e) => ({ x: e.cx, y: e.y + e.h / 2 }));
  // The pickups that change how the player moves stay, taken by touch (a
  // shot would open a monitor), and back for every move.
  g.enemies = []; g.enemyShots = [];
  // Spring crates open too: their springs stand there from the start.
  for (const k of g.pickups) if (k.spring) k.collect(g);
  const kept = g.pickups.filter((k) => k.kind === 'birdmorph' || k.kind === 'flycarrot' || k.kind === 'airboard');
  for (const k of kept) k.needsHit = false;
  g.pickups = [...kept];
  g.coins = 9999;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (!'xmpKW'.includes(L.tiles[ty][tx])) continue;
    L.tiles[ty][tx] = '.';
    if (L.masks) L.masks[ty * w + tx] = null;
  }
  const audio = g.audio; const ctx = audio.ctx; audio.ctx = null;
  const startChar = p.character;

  // Node ids: cell + WH * (index of the trigger set that is on).
  const WH = w * h;
  const trigSets = new Map([['', 0]]); const trigList = [[]];
  const trigIndex = () => {
    const on = [...(L.triggerState || [])].sort((a, b) => a - b);
    const k = on.join(',');
    if (!trigSets.has(k)) { trigSets.set(k, trigList.length); trigList.push(on); }
    return trigSets.get(k);
  };
  const setTriggers = (on) => {
    if (!L.triggerState) return;
    const want = new Set(on);
    for (const id of [...L.triggerState]) if (!want.has(id)) L.setTrigger(id, false);
    for (const id of want) L.setTrigger(id, true);
  };
  const cell = () => {
    const tx = Math.floor(p.cx / T); const ty = Math.floor((p.y + p.h - 1) / T);
    return tx >= 0 && ty >= 0 && tx < w && ty < h ? ty * w + tx + WH * trigIndex() : -1;
  };
  const saved = new Map();     // node -> player state to start its moves from
  // Nodes whose saved state is still in motion (a move that never settled,
  // e.g. mid-bounce): a settled arrival later replaces it and they're re-run.
  const rough = new Set();
  const snapshot = () => {
    const s = {};
    for (const k of Object.keys(p)) if (typeof p[k] !== 'function') s[k] = p[k];
    s.level = { trig: trigList[trigIndex()], water: L.water, waterTarget: L.waterTarget, zoneKey: L.zoneKey };
    return s;
  };
  const restore = (s) => {
    const { level, ...ps } = s;
    Object.assign(p, ps); p.prevX = p.x; p.prevY = p.y;
    setTriggers(level.trig);
    L.water = level.water; L.waterTarget = level.waterTarget; L.zoneKey = level.zoneKey;
  };
  // Trigger crates the player can break from a cell: close by, or level
  // with it and in a clear line to shoot.
  const crates = L.triggerCrates || [];
  const cratesFrom = (c) => {
    const cx = c % w; const cy = Math.floor(c / w);
    return crates.filter((k) => {
      const dx = k.tx - cx; const dy = k.ty - cy;
      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) return true;
      if (Math.abs(dy) > 0 || Math.abs(dx) > 10) return false;
      for (let x = Math.min(k.tx, cx) + 1; x < Math.max(k.tx, cx); x++) if (L.solidAt(x * T + 16, cy * T + 16)) return false;
      return true;
    });
  };

  let held = new Set(); let prev = new Set();
  const input = {
    held: (k) => held.has(k),
    pressed: (k) => held.has(k) && !prev.has(k),
    released: (k) => prev.has(k) && !held.has(k),
    padPressed: () => false,
  };
  let bossMet = false;
  // Every cell the player's body passes through (with `touch`): what they
  // can pick up on the way, not just where they can stand.
  const touched = touch ? new Set() : null;
  const tick = () => {
    p.invuln = 50; p.health = Math.max(p.health, 1);
    g.update(input);
    prev = held;
    if (g.bossCall) { g.bossCall = false; if (bossy) bossMet = true; }
    if (touched && !p.dead) {
      for (let ty = Math.floor(p.y / T); ty <= Math.floor((p.y + p.h - 1) / T); ty++) {
        for (let tx = Math.floor(p.x / T); tx <= Math.floor((p.x + p.w - 1) / T); tx++) {
          if (tx >= 0 && ty >= 0 && tx < w && ty < h) touched.add(ty * w + tx);
        }
      }
    }
  };
  // Play a move from a state; where it settles: a node, -2 death, -3 exit.
  const play = (state, move) => {
    restore(state); bossMet = false;
    for (const k of kept) k.taken = false;
    g.pickups = [...kept];
    if (move.as && CHARS.has(move.as)) p.character = move.as;
    if (move.vx) { p.vx = move.vx; p.dash = 30; }
    if (move.copter) { p.copter = COPTER_TICKS; p.onGround = false; p.vy = Math.min(p.vy, 0); }
    let hurt = false;
    const run = (keys, n) => {
      held = new Set(keys);
      for (let t = 0; t < n; t++) {
        const hp = p.health; tick();
        if (p.health < hp) hurt = true;
        if (p.dead || g.state !== 'play' || bossMet) return true;
      }
      return false;
    };
    let over = false; let settled = false;
    for (const [n, ...keys] of move.steps) { if ((over = run(keys, n))) break; }
    // Let go and wait to settle: standing, hanging, or still in water.
    if (!over) {
      held = new Set();
      let calm = 0;
      for (let t = 0; t < 240; t++) {
        const x = p.x; const y = p.y;
        const hp = p.health; tick();
        if (p.health < hp) hurt = true;
        if (p.dead || g.state !== 'play' || bossMet) { over = true; break; }
        const still = Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5;
        calm = (p.onGround || p.hang || p.swimming || p.platform) && (still || p.swimming || p.platform) ? calm + 1 : 0;
        if (calm > 4) { settled = true; break; }
      }
    }
    p.character = startChar;
    if (g.state !== 'play' || bossMet) { g.state = 'play'; g.clearTime = 0; return [-3, hurt]; }
    if (p.dead) return [-2, hurt];
    return [cell(), hurt, settled];
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
  for (let q = 0; q < queue.length && seen.size < maxNodes; q++) {
    const i = queue[q];
    const out = fwd.get(i) || new Set();
    // Breaking a trigger crate: the same place with the trigger switched.
    for (const k of cratesFrom(i % WH)) {
      restore(saved.get(i));
      L.setTrigger(k.id, k.toggle ? !L.triggerState.has(k.id) : k.on);
      const n = cell();
      if (n !== i && n >= 0) {
        out.add(n);
        if (!seen.has(n)) { seen.add(n); saved.set(n, snapshot()); queue.push(n); }
      }
    }
    // A floating lizard close enough to come at the player: its copter.
    const cx = (i % w) * T + 16; const cy = Math.floor((i % WH) / w) * T + 16;
    const copter = lizards.some((l) => Math.hypot(l.x - cx, l.y - cy) < 260) ? COPTER_MOVES.map((m) => ({ ...m, copter: true })) : [];
    for (const move of saved.get(i).birdForm || saved.get(i).flyCarrot ? [...MOVES, ...FLIGHTS] : [...MOVES, ...copter]) {
      const [n, hurt, settled] = play(saved.get(i), move);
      if (hurt) out.add(-2);
      if (n === -3) exitReached = true;
      if (n < 0) { out.add(n); continue; }
      if (n === i) continue;
      out.add(n);
      if (!seen.has(n)) { seen.add(n); saved.set(n, snapshot()); queue.push(n); if (!settled) rough.add(n); }
      else if (settled && rough.has(n)) { rough.delete(n); saved.set(n, snapshot()); queue.push(n); }
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
  const near = (i) => Math.abs((i % w) - (start % w)) <= 2 && Math.abs(Math.floor((i % WH) / w) - Math.floor(start / w)) <= 1;
  // Right by an exit is out too (a move that finishes the level there can
  // leave the explorer standing beside it).
  const exits = [...L.objects.filter((o) => o.type === 'exit'), ...L.entities.filter((e) => e.ch === 'E')];
  const byExit = (i) => exits.some((o) => Math.abs((i % w) - o.tx) <= 2 && Math.abs(Math.floor((i % WH) / w) - o.ty) <= 2);
  for (const [i, out] of fwd) if (near(i) || byExit(i) || out.has(-2) || out.has(-3)) { home.add(i); bq.push(i); }
  for (let k = 0; k < bq.length; k++) for (const pr of back.get(bq[k]) || []) if (!home.has(pr)) { home.add(pr); bq.push(pr); }
  const trapped = [...seen].filter((i) => fwd.has(i) && !home.has(i));
  const group = new Map(); const traps = [];
  for (const i of trapped) {
    if (group.has(i)) continue;
    const cells = [i]; group.set(i, traps.length);
    for (let k = 0; k < cells.length; k++) {
      for (const n of [...(fwd.get(cells[k]) || []), ...(back.get(cells[k]) || [])]) {
        if (n >= 0 && fwd.has(n) && !home.has(n) && !group.has(n)) { group.set(n, traps.length); cells.push(n); }
      }
    }
    const xs = cells.map((c) => c % w); const ys = cells.map((c) => Math.floor((c % WH) / w));
    const entry = queue.find((pr) => home.has(pr) && [...(fwd.get(pr) || [])].some((n) => cells.includes(n)));
    traps.push({ size: cells.length, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), cells: cells.slice(0, 40).map((c) => [c % w, Math.floor((c % WH) / w)]), from: entry === undefined ? null : [entry % w, Math.floor((entry % WH) / w)] });
  }
  traps.sort((a, b) => b.size - a.size);
  const xy = (n) => `${n % w},${Math.floor((n % WH) / w)}${n >= WH ? 't' + Math.floor(n / WH) : ''}`;
  const outOf = (x, y, t = 0) => [...(fwd.get(y * w + x + t * WH) || [])].map((n) => (n < 0 ? n : `${xy(n)}${home.has(n) ? 'h' : ''}`));
  const far = (n) => queue.filter((i) => fwd.has(i)).sort((a, b) => (b % w) - (a % w)).slice(0, n).map((i) => [i % w, Math.floor((i % WH) / w)]);
  return { far, outOf, nodes: queue.length, explored: fwd.size, start: [start % w, Math.floor(start / w)], exitReached, traps, home: [...home].map((i) => i % WH), reached: queue.map((i) => i % WH), triggerSets: trigList.length, touched: touched && [...touched], fwd };
}
