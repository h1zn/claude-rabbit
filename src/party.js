// Party mode for up to five players: on one network or the internet over the
// serve.py relay (WebSocket at /ws), or two on one computer (split screen).
//
// Game types (the manual's), picked by the host:
//   Treasure Hunt  collect the goal in gems (red 1, green 3, purple 5, gold
//                  10), then find the exit. Taken gems come back after a while.
//   Battle         first to the goal in roasts (knock-outs of other players).
//   Race           first to finish the goal in laps.
//   Capture the Flag  two teams (blue: players 1, 3, 5; red: 2, 4): take the
//                  other team's flag home while your own is there.
// Every player has five hearts; a hit costs one (and in a treasure hunt drops
// up to five gems' worth). With none left you're knocked out for 10 s and
// come back, keeping your gems, at a spot away from the others. For the first
// two minutes (the host can change this) nobody can hurt anybody.
//
// Sync: each side simulates its own player and sends its state 20 times a
// second; the others are drawn smoothly between updates. The host owns the
// pickups (the others ask before collecting, and the host brings collected
// ones back), and each side decides hits on its own player, so nobody can be
// hit unfairly.

import { PLAYER, TILE } from './config.js';
import { overlap, Pickup } from './entities.js';
import { tr } from './lang.js';
import { Items, placeBoxes } from './partyitems.js';
import { Bullet, TNT } from './weapons.js';

export const MAX_PLAYERS = 5;
export const PARTY_GOAL = 100;
export const PARTY_RESPAWN = 700;   // ticks (10 s)
export const PARTY_DROP = 5;        // most gem value a hit drops
export const PARTY_HEARTS = PLAYER.maxHealth;
export const SECOND = 1000 / 14;    // ticks per second
const GEM_BACK = 45 * SECOND;       // a collected pickup comes back after this
const EXIT_CLEAR = 18;              // tiles: nobody (re)spawns this close to the exit

// Who plays as whom: join order picks the hero. Players 4 and 5 are Jazz and
// Spaz in other colours. `color` marks the player on the HUD and name tags.
export const SLOTS = [
  null,
  { character: 'jazz', tint: null, color: '#5ae08a' },
  { character: 'spaz', tint: null, color: '#ff7a5a' },
  { character: 'lori', tint: null, color: '#ffd54a' },
  { character: 'jazz', tint: 'purple', color: '#c48aff' },
  { character: 'spaz', tint: 'blue', color: '#6ab8ff' },
];

export const TEAMS = [{ name: 'BLUE', color: '#4a9aff' }, { name: 'RED', color: '#ff4a4a' }];
export const teamOf = (id) => (id % 2 ? 0 : 1);

// Each game type's goal choices (the first is the default) and the HUD word.
export const MODE_INFO = {
  treasure: { name: 'TREASURE HUNT', goals: [100, 150, 200, 50], unit: 'GEMS' },
  battle: { name: 'BATTLE', goals: [10, 15, 20, 5], unit: 'ROASTS' },
  race: { name: 'RACE', goals: [3, 5, 10, 1], unit: 'LAPS' },
  ctf: { name: 'CAPTURE THE FLAG', goals: [5, 3, 10, 1], unit: 'FLAGS' },
};
export const TRUCES = [120, 0, 60, 180];   // seconds without fighting (first: default)

// Built-in levels that make good treasure and battle grounds.
const OWN_PARTY_LEVELS = [0, 2, 5, 6];

// The levels a game type can be played on: ours and the JJ2 ones whose
// pack lists it (src/jj2/catalog.js).
export function partyLevels(mode, jj2) {
  const own = mode === 'treasure' || mode === 'battle' ? OWN_PARTY_LEVELS : [];
  return [...jj2.filter((d) => d.modes.includes(mode)).map((d) => d.key), ...own];
}

// The relay connection. Messages are queued and handled on the game tick.
export class Net {
  constructor() {
    this.ws = null;
    this.inbox = [];
    this.status = 'idle';     // idle | connecting | open | closed | error
    this.error = null;
  }

  connect() {
    return new Promise((resolve) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      this.status = 'connecting';
      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        this.status = 'error'; this.error = 'Could not reach the party server.'; resolve(false); return;
      }
      this.ws.onopen = () => { this.status = 'open'; resolve(true); };
      this.ws.onerror = () => { this.status = 'error'; this.error = 'Could not reach the party server. Start the game with party.bat (serve.py --lan).'; resolve(false); };
      this.ws.onclose = () => { if (this.status === 'open') this.inbox.push({ t: 'left', id: 1, closed: true }); this.status = 'closed'; };
      this.ws.onmessage = (e) => { try { this.inbox.push(JSON.parse(e.data)); } catch (err) { /* ignore */ } };
    });
  }

  send(msg) {
    if (this.ws && this.status === 'open') this.ws.send(JSON.stringify(msg));
  }

  take() {
    const all = this.inbox;
    this.inbox = [];
    return all;
  }

  close() {
    this.status = 'closed';
    if (this.ws) this.ws.close();
    this.ws = null;
  }
}

// Split screen: two games on one computer, joined by a pair of these in
// place of the relay. Each message is copied, as if it had been sent, and
// marked with its sender like the relay does.
class LocalNet {
  constructor(id) {
    this.id = id;
    this.inbox = [];
    this.peer = null;
    this.status = 'open';
  }

  send(msg) { if (this.peer && this.peer.status === 'open') this.peer.inbox.push({ ...JSON.parse(JSON.stringify(msg)), from: this.id }); }

  take() {
    const all = this.inbox;
    this.inbox = [];
    return all;
  }

  close() { this.status = 'closed'; }
}

export function localPair() {
  const a = new LocalNet(1); const b = new LocalNet(2);
  a.peer = b; b.peer = a;
  return [a, b];
}

// Another player, as last reported, drawn between updates.
class Rival {
  constructor(id, name) {
    Object.assign(this, {
      id, name, x: -999, y: -999, prevX: -999, prevY: -999, tx: -999, ty: -999, vx: 0, vy: 0,
      w: PLAYER.w, h: PLAYER.h, facing: 1, anim: 'idle', gems: 0, hearts: PARTY_HEARTS, roasts: 0, laps: 0,
      carry: -1, dead: false, seen: false,
    });
    Object.assign(this, SLOTS[id] || SLOTS[1]);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update() {
    this.prevX = this.x; this.prevY = this.y;
    if (!this.seen) return;
    // Extrapolate by the reported speed, then ease toward the target.
    this.tx += Math.max(-8, Math.min(8, this.vx)); this.ty += this.vy;
    const far = Math.abs(this.tx - this.x) + Math.abs(this.ty - this.y) > 160;
    this.x = far ? this.tx : this.x + (this.tx - this.x) * 0.35;
    this.y = far ? this.ty : this.y + (this.ty - this.y) * 0.35;
  }
}

export class Party {
  // `players`: [{ id, name }] (ids are slots 1-5; the host is 1).
  // `settings`: { mode, goal, truce } as the host chose them.
  constructor(net, { id, players, mode = 'treasure', goal = null, truce = TRUCES[0], local = false }) {
    this.net = net;
    this.id = id;
    this.local = local;
    this.mode = MODE_INFO[mode] ? mode : 'treasure';
    this.goal = goal || MODE_INFO[this.mode].goals[0];
    this.truceTicks = Math.round(truce * SECOND);
    this.players = players;
    this.name = (players.find((p) => p.id === id) || {}).name || `PLAYER ${id}`;
    this.rivals = new Map(players.filter((p) => p.id !== id).map((p) => [p.id, new Rival(p.id, p.name)]));
    Object.assign(this, SLOTS[id] || SLOTS[1]);
    this.team = teamOf(id);
    this.shots = [];
    this.respawn = 0;           // ticks left while knocked out
    this.result = null;         // { winner: id } or { team } or { left: true }
    this.dropSeq = 0;
    this.stateTimer = 0;
    this.clock = 0;             // ticks since the start
    this.roasts = 0;
    this.laps = 0;
    this.carry = -1;            // the team whose flag we hold
    this.captures = [0, 0];
    this.feed = [];             // kill feed: { text, t }
    this.byId = new Map();      // every pickup, for bringing them back
    this.gone = new Map();      // host: pickup id -> tick it comes back
    this.spots = [];
    this.items = new Items(this);
  }

  get host() { return this.id === 1; }
  get role() { return this.host ? 'host' : 'guest'; }
  get truce() { return Math.max(0, this.truceTicks - this.clock); }

  // Players other than us still in the game, for shots and seekers to find.
  targets() { return [...this.rivals.values()].filter((r) => r.seen && !r.dead); }
  nameOf(id) { return id === this.id ? this.name : (this.rivals.get(id) || {}).name || `PLAYER ${id}`; }
  colorOf(id) { return (SLOTS[id] || SLOTS[1]).color; }

  // ---------------------------------------------------------------- setup

  // Set up a freshly loaded level for the game.
  begin(game) {
    game.enemies = [];
    game.totals.enemies = 0;
    game.lives = 99;
    const p = game.player;
    p.health = PARTY_HEARTS;
    for (const r of this.rivals.values()) r.h = p.h;
    game.pickups.forEach((k, i) => { k.id = `p${i}`; k.home = { x: k.x, y: k.y }; this.byId.set(k.id, k); });
    if (this.mode === 'treasure' || this.mode === 'race') this.showExits(game);
    const exits = game.props.filter((pr) => pr.kind === 'sign');
    this.spots = this.spawnSpots(game, exits);
    // A treasure hunt needs an exit: a level without one gets it as far from
    // the starts as the level goes.
    if (this.mode === 'treasure' && !exits.length) this.placeExit(game);
    if (this.mode === 'treasure') this.layGems(game);
    if (this.mode !== 'race') placeBoxes(game, this);
    // CTF bases (blue 0, red 1) from the level.
    this.bases = [0, 1].map((team) => {
      const o = game.level.objects.find((b) => b.type === 'base' && b.team === team);
      return o && { x: o.tx * TILE + TILE / 2, y: o.ty * TILE + TILE, team };
    });
    const spot = this.spots[(this.id - 1) % this.spots.length];
    if (spot) {
      p.spawn(spot.x, spot.y);
      game.respawn = { x: p.x, y: p.y };
      game.cam = { x: p.cx - game.viewW / 2, y: p.cy - 180 };
      game.clampCamera();
      game.prevCam = { ...game.cam };
    }
  }

  // Can a player stand in tile (tx, ty): two open cells over solid ground,
  // nothing harmful there?
  standable(level, tx, ty) {
    if (tx < 1 || ty < 2 || tx >= level.w - 1 || ty >= level.h - 1) return false;
    const cx = tx * TILE + TILE / 2;
    const open = (y) => !level.solidAt(cx - 8, y) && !level.solidAt(cx + 8, y);
    if (!open(ty * TILE + 4) || !open(ty * TILE + 28) || !open(ty * TILE - 20)) return false;
    // Ground under the feet (tiles with a rounded top start lower down).
    if (![4, 10, 16].some((d) => level.solidAt(cx, (ty + 1) * TILE + d))) return false;
    if (level.areaAt(cx, ty * TILE + 16) || (ty + 1) * TILE > level.water) return false;
    const ch = level.tiles[ty] && level.tiles[ty][tx];
    return ch !== '^' && ch !== '~';
  }

  // Standable cells joined through open air to the given spots (so none is
  // in a sealed room), every third column.
  openFloor(level, from) {
    const { w, h } = level;
    const seen = new Uint8Array(w * h);
    const air = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && !level.solidAt(tx * TILE + 16, ty * TILE + 16);
    const queue = [];
    for (const s of from) if (air(s.tx, s.ty)) { seen[s.ty * w + s.tx] = 1; queue.push(s.ty * w + s.tx); }
    const out = [];
    for (let i = 0; i < queue.length; i++) {
      const tx = queue[i] % w; const ty = (queue[i] - tx) / w;
      if (tx % 3 === 0 && this.standable(level, tx, ty)) out.push([tx, ty]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx; const ny = ty + dy;
        if (air(nx, ny) && !seen[ny * w + nx]) { seen[ny * w + nx] = 1; queue.push(ny * w + nx); }
      }
    }
    return out;
  }

  // Spawn spots: the level's starts, then places just under its pickups
  // (put where players can get to), none near an exit, spread as far apart
  // as they go. Every side works out the same list.
  spawnSpots(game, exits) {
    const level = game.level;
    const near = (tx, ty) => this.mode !== 'race' && exits.some((e) => Math.hypot(e.x / TILE - tx, e.y / TILE - ty) < EXIT_CLEAR);
    const out = [];
    const add = (tx, ty, start) => {
      if (near(tx, ty) || out.some((s) => s.tx === tx && s.ty === ty)) return;
      out.push({ tx, ty, start });
    };
    const starts = level.allStarts || level.entities.filter((e) => e.ch === 'P').map((e) => [e.tx, e.ty]);
    for (const [tx, ty] of starts) add(tx, ty, true);
    if (!level.allStarts) for (const e of level.entities) if (e.ch === 'P') add(e.tx, e.ty, true);
    // A race starts everybody at the start line.
    if (this.mode !== 'race' || !out.length) {
      for (const k of game.pickups) {
        const tx = Math.floor((k.x + k.w / 2) / TILE);
        for (let ty = Math.floor((k.y + k.h / 2) / TILE), n = 0; n < 8; ty++, n++) {
          if (this.standable(level, tx, ty)) { add(tx, ty, false); break; }
          if (level.solidAt(tx * TILE + 16, ty * TILE + 16)) break;
        }
      }
    }
    if (!out.length) {
      const p = game.player;
      out.push({ tx: Math.floor(p.cx / TILE), ty: Math.floor((p.y + p.h - 1) / TILE), start: true });
    }
    // Few pickups (small arenas): any floor in the open air the starts are
    // in, every few columns, so five players still start apart.
    if (this.mode !== 'race' && out.length < 12) for (const [tx, ty] of this.openFloor(level, out)) add(tx, ty, false);
    // Farthest-point order: starts first, then each next spot the farthest
    // from those already picked.
    const picked = [out.find((s) => s.start) || out[0]];
    const rest = out.filter((s) => s !== picked[0]);
    while (rest.length && picked.length < 12) {
      let best = 0; let bestD = -1;
      rest.forEach((s, i) => {
        // Level starts come first, unless crowded against one already picked.
        const gap = Math.min(...picked.map((q) => Math.hypot(q.tx - s.tx, q.ty - s.ty)));
        const d = gap + (s.start && gap >= 4 ? 6 : 0);
        if (d > bestD) { bestD = d; best = i; }
      });
      picked.push(rest.splice(best, 1)[0]);
    }
    const ph = game.player.h;
    return picked.map((s) => ({ tx: s.tx, ty: s.ty, x: s.tx * TILE + (TILE - PLAYER.w) / 2, y: s.ty * TILE + TILE - ph }));
  }

  // JJ2 exits are invisible areas: each group of them gets a sign standing
  // on the floor under it, so players can see where to go.
  showExits(game) {
    const level = game.level;
    const cells = game.props.filter((pr) => pr.kind === 'sign' && pr.hidden).map((pr) => [Math.round(pr.x / TILE), Math.round(pr.y / TILE)]);
    const groups = [];
    for (const [tx, ty] of cells) {
      const g = groups.find((q) => q.some(([x, y]) => Math.abs(x - tx) <= 2 && Math.abs(y - ty) <= 2));
      if (g) g.push([tx, ty]); else groups.push([[tx, ty]]);
    }
    for (const g of groups) {
      const tx = Math.round(g.reduce((a, [x]) => a + x, 0) / g.length);
      const top = Math.min(...g.map(([, y]) => y));
      const bottom = Math.max(...g.map(([, y]) => y));
      let ty = top;
      while (ty < top + 10 && !this.standable(level, tx, ty)) ty++;
      // No floor under it (an exit in the air or a tube): the sign marks the area.
      game.addExit(tx, ty < top + 10 ? ty : bottom);
    }
  }

  // An exit for a level that has none: the reachable spot with a floor
  // farthest from the spawn spots.
  placeExit(game) {
    const level = game.level;
    const s = this.spots[0];
    let spot = null;
    if (level.farthestSpot && s) spot = level.farthestSpot(s.tx, s.ty);
    if (!spot) {
      let bestD = -1;
      for (const k of game.pickups) {
        const d = Math.min(...this.spots.map((q) => Math.hypot(q.x - k.x, q.y - k.y)));
        if (d > bestD) { bestD = d; spot = [Math.floor(k.x / TILE), Math.floor(k.y / TILE)]; }
      }
    }
    if (!spot) return;
    game.addExit(spot[0], spot[1]);
  }

  // Treasure gems: red ones are worth 1, and ten green (3), eight purple
  // (5) and one gold (10) go where the level put its better gems, then on
  // the red ones farthest from the spawn spots.
  layGems(game) {
    const gems = game.pickups.filter((k) => k.kind === 'gem');
    const far = (k) => Math.min(...this.spots.map((s) => Math.hypot(s.x - k.x, s.y - k.y)));
    const order = [...gems].sort((a, b) => (b.value - a.value) || (far(b) - far(a)) || (a.x - b.x) || (a.y - b.y));
    const set = (k, color, value) => Object.assign(k, { color, value, score: value * 100 });
    gems.forEach((k) => set(k, 'red', 1));
    order.forEach((k, i) => {
      if (i === 0) set(k, 'gold', 10);
      else if (i <= 8) set(k, 'purple', 5);
      else if (i <= 18) set(k, 'green', 3);
    });
  }

  // A spot to come back at: the one farthest from the other players.
  respawnSpot() {
    const live = this.targets();
    let best = this.spots[0]; let bestD = -1;
    for (const s of this.spots) {
      const d = live.length ? Math.min(...live.map((r) => Math.hypot(r.x - s.x, r.y - s.y))) : Math.random();
      const score = d + Math.random() * 40;
      if (score > bestD) { bestD = score; best = s; }
    }
    return best;
  }

  // ---------------------------------------------------------------- tick

  tick(game) {
    for (const m of this.net.take()) this.receive(game, m);
    const p = game.player;
    const wasTruce = this.truce > 0;
    this.clock++;
    if (wasTruce && this.truce === 0 && this.truceTicks) {
      game.banner(tr('FIGHT!'), 120);
      game.audio.play('fanfare');
      game.flash('#ffffff', 8);
    }
    if (this.respawn > 0 && --this.respawn === 0) {
      const s = this.respawnSpot();
      p.spawn(s.x, s.y);
      game.respawn = { x: p.x, y: p.y };
      p.invuln = 140;
      p.health = PARTY_HEARTS;
      game.effect('sparkle', p.cx, p.cy);
      this.beam(game, p.cx, p.y + p.h);
      game.audio.play('secret');
    }
    // Last seconds of the truce: 3, 2, 1.
    const left = Math.ceil(this.truce / SECOND);
    if (this.truce > 0 && left <= 3 && this.truce % Math.round(SECOND) === 0) game.audio.play('tally');
    this.warnings(game);
    if (++this.stateTimer >= 3) {
      this.stateTimer = 0;
      this.net.send({
        t: 's', x: Math.round(p.x), y: Math.round(p.y), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), f: p.facing, a: p.anim,
        g: game.gems, d: p.dead ? 1 : 0, h: p.health, r: this.roasts, l: this.laps, c: this.carry,
        e: (this.items.bubble ? 1 : 0) | (this.items.shrink ? 2 : 0) | (p.frog ? 4 : 0),
      });
    }
    for (const r of this.rivals.values()) r.update();
    for (const s of this.shots) s.update(game);
    // Others' shots against us (missiles and TNT blast us instead); ours
    // fizzle on them (they decide the hit). No harm at all in the truce.
    if (!p.dead && !this.truce) {
      for (const s of this.shots) {
        if (s.dead || s.weapon === TNT || !overlap(s, p)) continue;
        if (s.explosive) s.burst(game);
        else { s.dead = true; this.hit(game, s.x, s.owner); }
      }
    }
    if (!this.truce) {
      for (const s of game.shots) {
        if (s.dead || s.weapon === TNT) continue;
        if (!this.targets().some((r) => overlap(s, r))) continue;
        s.dead = true;
        game.effect(s.explosive ? 'explosion' : 'hitSpark', s.cx, s.cy, s.explosive ? 3 : undefined);
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);
    this.items.tick(game);
    if (this.host) this.bringBack(game);
    if (this.mode === 'ctf') this.flags(game);
    this.feed = this.feed.filter((f) => ++f.t < 360);
  }

  // Host: pickups whose time has come appear again, for everyone.
  bringBack(game) {
    for (const [id, at] of this.gone) {
      if (this.clock < at) continue;
      this.gone.delete(id);
      this.restore(game, id);
      this.net.send({ t: 'back', id });
    }
  }

  restore(game, id) {
    const k = this.byId.get(id);
    if (!k) return;
    Object.assign(k, { taken: false, pending: false, x: k.home.x, y: k.home.y });
    if (!game.pickups.includes(k)) game.pickups.push(k);
    game.effect('sparkle', k.x + k.w / 2, k.y + k.h / 2);
  }

  // A pickup is gone (taken by someone): the host times its return.
  taken(game, k, by) {
    k.taken = true;
    const t = k.trigger;
    if (t && by !== this.id) game.level.setTrigger(t.id, t.toggle ? !game.level.triggerState.has(t.id) : t.on);
    if (this.host && k.home && !k.droppedBy && !k.trigger) this.gone.set(k.id, this.clock + GEM_BACK);
  }

  // ---------------------------------------------------------------- harm

  // We were hit (a shot, a blast, or the scenery): a heart goes, and in a
  // treasure hunt up to five gems' worth falls out. With no hearts left we're
  // knocked out for 10 s. `by`: the player whose shot it was.
  hit(game, fromX, by = null) {
    const p = game.player;
    if (p.dead || p.invuln > 0 || this.result) return;
    if (by && this.truce) return;
    p.health--;
    p.loseBoard(game);
    if (game.bird) game.bird.flyAway();
    if (this.mode === 'treasure' && game.gems > 0) {
      const lost = Math.min(PARTY_DROP, game.gems);
      game.gems -= lost;
      const drops = [];
      for (let i = 0; i < lost; i++) {
        drops.push({ id: `d${this.id}-${this.dropSeq++}`, x: Math.round(p.cx - 10), y: Math.round(p.y + 4), vx: +((Math.random() - 0.5) * 6).toFixed(2), vy: +(-3 - Math.random() * 3).toFixed(2) });
      }
      this.addDrops(game, drops, this.id);
      this.net.send({ t: 'drop', drops });
      game.banner(tr('-{0} GEMS', lost), 50);
    }
    if (this.carry >= 0) this.dropFlag(game);
    if (p.health <= 0) { this.knockOut(game, by); return; }
    p.invuln = 90;
    p.knock = 14;
    p.vx = (p.cx < fromX ? -1 : 1) * 4;
    p.vy = -4;
    p.cry(game);
    game.flash('#ff2a4a', 6);
  }

  // Knocked out: back in 10 s, gems kept.
  knockOut(game, by = null) {
    const p = game.player;
    if (p.dead) return;
    if (this.carry >= 0) this.dropFlag(game);
    p.dead = true; p.health = 0; p.vy = -8; p.vx = 0; p.pole = null;
    this.respawn = PARTY_RESPAWN;
    game.audio.play('death');
    game.shake(10);
    this.net.send({ t: 'ko', by });
    this.say(by ? tr('{0} ROASTED {1}', this.nameOf(by), this.name) : tr('{0} WAS KNOCKED OUT', this.name));
  }

  say(text) { this.feed.push({ text, t: 0 }); if (this.feed.length > 4) this.feed.shift(); }

  // A column of light where a player comes back.
  beam(game, x, y) {
    for (let i = 0; i < 26; i++) {
      game.particles.push(new game.Particle(x + (Math.random() - 0.5) * 18, y - Math.random() * 120, 0, -0.6 - Math.random(), i % 2 ? this.color : '#ffffff', 34, 3, 0, true));
    }
  }

  // Someone close to winning: everyone hears about it, once.
  warnings(game) {
    if (this.result) return;
    const near = Math.max(1, Math.round(this.goal * 0.1));
    this.warned = this.warned || new Set();
    for (const row of this.standings(game)) {
      if (row.value <= 0 || row.value < this.goal - near || this.warned.has(row.id) || this.mode === 'ctf') continue;
      this.warned.add(row.id);
      this.say(tr('{0} IS ALMOST THERE!', row.name));
      if (row.me) game.audio.play('rank');
    }
  }

  // Gems knocked out of a player fly out; whoever dropped them can't grab
  // them back for the first 80 ticks.
  addDrops(game, drops, by) {
    for (const d of drops) {
      const k = new Pickup('gem', d.x, d.y, { color: 'red', value: 1, score: 100, w: 20, h: 20, id: d.id, vx: d.vx, vy: d.vy, falling: true, droppedBy: by, t: 0 });
      game.pickups.push(k);
      this.byId.set(k.id, k);
    }
  }

  // Our player touched a pickup. The host collects at once and says so; the
  // others hide it and ask the host, who grants it if it's still there.
  touch(game, k) {
    if (k.droppedBy === this.id && k.t < 80) return;
    if (k.kind === 'itembox' && this.items.held) return;     // one item at a time
    if (this.host) {
      const item = k.kind === 'itembox' ? Items.roll() : undefined;
      this.grab(game, k, item);
      this.taken(game, k, this.id);
      this.net.send({ t: 'got', id: k.id, by: this.id, item });
    } else if (!k.pending) {
      k.pending = true;
      this.net.send({ t: 'take', id: k.id, to: 1 });
    }
  }

  // Collect a pickup that's ours: an item box gives its item.
  grab(game, k, item) {
    if (k.kind !== 'itembox') { k.collect(game); return; }
    k.taken = true;
    game.effect('sparkle', k.x + k.w / 2, k.y + k.h / 2);
    this.items.give(game, item);
  }

  // Our TNT went off: the others' copies (or a JJ2 bomb there) go off too.
  boom(x, y) { this.net.send({ t: 'boom', x: Math.round(x), y: Math.round(y) }); }

  tile(tx, ty, opts = {}) { this.net.send({ t: 'tile', x: tx, y: ty, w: opts.weapon || 0, b: opts.blast ? 1 : 0 }); }
  fire(shot) { this.net.send({ t: 'shot', x: Math.round(shot.x), y: Math.round(shot.y), vx: +shot.vx.toFixed(2), vy: +shot.vy.toFixed(2), w: shot.weapon, p: shot.powered ? 1 : 0, l: shot.life, h: shot.whammo || undefined }); }

  // ---------------------------------------------------------------- goals

  // A lap done (race): past the goal wins, else back to the start line.
  lap(game, back = true) {
    if (this.result) return;
    this.laps++;
    game.audio.play('checkpoint');
    if (this.laps >= this.goal) { this.win(game); return; }
    game.banner(tr('LAP {0} / {1}', this.laps + 1, this.goal), 90);
    if (back) {
      const s = this.spots[(this.id - 1) % this.spots.length];
      const p = game.player;
      p.spawn(s.x, s.y);
      game.warpTo({ x: s.x - (TILE - PLAYER.w) / 2, w: TILE, bottom: s.y + p.h });
    }
  }

  // Capture the flag: take the other flag at its base, score at your own
  // while your flag is home. A hit drops the flag (it goes home).
  flags(game) {
    const p = game.player;
    if (p.dead || this.result || !this.bases[0] || !this.bases[1]) return;
    const near = (b) => Math.abs(p.cx - b.x) < 24 && Math.abs(p.y + p.h - b.y) < 40;
    const other = 1 - this.team;
    const home = (team) => this.carry !== team && ![...this.rivals.values()].some((r) => r.carry === team && !r.dead);
    if (this.carry < 0 && near(this.bases[other]) && home(other)) {
      this.carry = other;
      game.audio.play('select');
      game.banner(tr('YOU HAVE THE FLAG!'), 80);
      this.net.send({ t: 'flag', take: other });
      this.say(tr('{0} TOOK THE {1} FLAG', this.name, tr(TEAMS[other].name)));
    } else if (this.carry === other && near(this.bases[this.team]) && home(this.team)) {
      this.carry = -1;
      this.captures[this.team]++;
      game.audio.play('fanfare');
      game.flash('#ffffff', 6);
      this.net.send({ t: 'cap', team: this.team });
      this.say(tr('{0} SCORED FOR {1}', this.name, tr(TEAMS[this.team].name)));
      if (this.captures[this.team] >= this.goal) this.win(game);
    }
  }

  dropFlag(game) {
    const team = this.carry;
    this.carry = -1;
    this.net.send({ t: 'flag', back: team });
    this.say(tr('THE {0} FLAG WENT HOME', tr(TEAMS[team].name)));
  }

  // Treasure hunt: the exit counts with enough gems.
  canExit(game) { return game.gems >= this.goal; }

  win(game) {
    if (this.result) return;
    this.result = this.mode === 'ctf' ? { team: this.team } : { winner: this.id };
    this.net.send({ t: 'win', team: this.mode === 'ctf' ? this.team : undefined });
    game.audio.play('fanfare');
  }

  // Everyone in order of how well they're doing: { id, name, color, value, me }.
  standings(game) {
    const value = (o) => (this.mode === 'treasure' ? o.gems : this.mode === 'battle' ? o.roasts : this.mode === 'race' ? o.laps : this.captures[teamOf(o.id)]);
    const me = { id: this.id, gems: game.gems, roasts: this.roasts, laps: this.laps };
    const rows = [me, ...this.rivals.values()].map((o) => ({ id: o.id, name: this.nameOf(o.id), color: this.colorOf(o.id), value: value(o), me: o.id === this.id, dead: o === me ? game.player.dead : o.dead }));
    return rows.sort((a, b) => b.value - a.value || a.id - b.id);
  }

  // ---------------------------------------------------------------- messages

  receive(game, m) {
    if (this.items.receive(game, m)) return;
    const from = m.from;
    const find = (id) => game.pickups.find((k) => k.id === id && !k.taken);
    switch (m.t) {
      case 's': {
        const r = this.rivals.get(from);
        if (!r) break;
        if (!r.seen) { r.x = m.x; r.y = m.y; r.prevX = m.x; r.prevY = m.y; }
        Object.assign(r, { tx: m.x, ty: m.y, vx: m.vx, vy: m.vy, facing: m.f, anim: m.a, gems: m.g, dead: !!m.d, hearts: m.h, roasts: m.r, laps: m.l, carry: m.c, bubble: !!(m.e & 1), shrink: !!(m.e & 2), frog: !!(m.e & 4), seen: true });
        break;
      }
      case 'shot': {
        // Their shot flies here as well, but only hurts us.
        const b = new Bullet(m.w || 1, !!m.p, m.x, m.y, m.vx, m.vy, { remote: true });
        b.owner = from;
        if (m.h && m.w === 1) b.setWhammo(String(m.h));
        if (m.l) b.life = m.l;
        this.shots.push(b);
        // On one computer the shooter's own game already played it.
        if (!this.local) game.audio.play(b.weapon === 6 ? 'flame' : 'shoot');
        break;
      }
      case 'drop': this.addDrops(game, m.drops, from); break;
      case 'take': {              // host: someone asks for a pickup
        const k = find(m.id);
        if (k && !k.pending) {
          this.taken(game, k, from);
          this.net.send({ t: 'got', id: m.id, by: from, item: k.kind === 'itembox' ? Items.roll() : undefined });
        } else this.net.send({ t: 'deny', id: m.id, to: from });
        break;
      }
      case 'got': {
        const k = this.byId.get(m.id);
        if (!k) break;
        if (m.by === this.id) { if (!k.taken) { this.grab(game, k, m.item); this.taken(game, k, this.id); } } else if (!k.taken) this.taken(game, k, m.by);
        break;
      }
      case 'deny': { const k = this.byId.get(m.id); if (k) k.pending = false; break; }
      case 'back': this.restore(game, m.id); break;
      case 'tile': game.hitTile(m.x, m.y, { stomp: true, speed: true, collapse: true, weapon: m.w, blast: !!m.b, remote: true }); break;
      case 'boom': {
        const near = (s) => s.weapon === TNT && !s.dead && Math.abs(s.cx - m.x) < 24 && Math.abs(s.cy - m.y) < 24;
        for (const s of this.shots) if (near(s)) s.burst(game);
        for (const s of game.shots) if (near(s) && s.placed) s.burst(game);
        break;
      }
      case 'ko': {
        // `from` was knocked out, by `m.by` if a player did it.
        if (m.by === this.id) {
          this.roasts++;
          game.audio.play('rank');
          game.banner(tr('YOU ROASTED {0}!', this.nameOf(from)), 70);
          if (this.mode === 'battle' && this.roasts >= this.goal) this.win(game);
        }
        this.say(m.by ? tr('{0} ROASTED {1}', this.nameOf(m.by), this.nameOf(from)) : tr('{0} WAS KNOCKED OUT', this.nameOf(from)));
        break;
      }
      case 'flag':
        if (m.take !== undefined) this.say(tr('{0} TOOK THE {1} FLAG', this.nameOf(from), tr(TEAMS[m.take].name)));
        else this.say(tr('THE {0} FLAG WENT HOME', tr(TEAMS[m.back].name)));
        break;
      case 'cap':
        this.captures[m.team]++;
        this.say(tr('{0} SCORED FOR {1}', this.nameOf(from), tr(TEAMS[m.team].name)));
        if (m.team === this.team) game.audio.play('rank');
        break;
      case 'win':
        if (!this.result) {
          this.result = m.team !== undefined && m.team !== null ? { team: m.team } : { winner: from };
          const mine = this.result.team === this.team && this.mode === 'ctf';
          if (!this.local) game.audio.play(mine ? 'fanfare' : 'gameover');
        }
        break;
      case 'left': {
        const r = this.rivals.get(m.id);
        if (r) { this.say(tr('{0} LEFT', r.name)); this.rivals.delete(m.id); }
        if (m.closed || !this.rivals.size) this.result = this.result || { left: true };
        break;
      }
      default: break;
    }
  }
}
