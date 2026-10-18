// An original JJ2 level as a playable level: collision from the tile set's
// per-pixel masks on the sprite layer (layer 4), and the level's events turned
// into this game's entities (start, exit, gems, food, springs, enemies, warps,
// signs) or kept as areas the player reacts to (vines, tubes, water, wind,
// belts, float-up columns, lights).

import { TILE } from '../config.js';
import { Level } from '../level.js';
import { cleanText, decodeEvent, eventFields, tileMask } from './files.js';

// JJ2 boss events -> our boss characters (src/bosses.js); other bosses stay
// ordinary enemies.
const BOSS_CHAR = { 101: 'V', 151: 'Z', 114: 'B', 202: 'R', 195: 'O' };

// Event ids (JJ2 numbering).
export const EV = {
  ONE_WAY: 1, HURT: 2, VINE: 3, HOOK: 4, SLIDE: 5, H_POLE: 6, V_POLE: 7, FLY_OFF: 8,
  BELT_RIGHT: 10, BELT_LEFT: 11, ACC_BELT_RIGHT: 12, ACC_BELT_LEFT: 13, STOP_ENEMY: 14,
  WIND_LEFT: 15, WIND_RIGHT: 16, EOL: 17, EOL_WARP: 18, FLOAT_UP: 20, LIGHT_SET: 23, LIGHT_RESET: 25,
  SECRET_WARP: 26, JAZZ_START: 29, SPAZ_START: 30, MP_START: 31, LORI_START: 32,
  EOL_SIGN: 81, SAVE_POINT: 83, BRIDGE: 153, LIGHT_STEADY: 148, LIGHT_PULSE: 149, LIGHT_FLICKER: 150,
  DESTRUCT: 185, DESTRUCT_BOMB: 186, COLLAPSE: 187, BUTTSTOMP: 188, GEMSTOMP: 189,
  TUBE: 206, TEXT: 207, SET_WATER: 208, GENERATOR: 216, WARP_ORIGIN: 230, WARP_TARGET: 240, GEM_RING: 192,
  LAVA: 122, TRIGGER_CRATE: 95, ACTIVATE_BOSS: 28, WATER_BLOCK: 233, TRIGGER_AREA: 234, TRIGGER_ZONE: 246,
};

// Events that become an entity character of this game.
const CHAR = {
  44: '$', 45: '@', 63: '*', 64: 'g', 65: 'b', 66: 'v', 67: 'b', 97: '*', 98: 'g', 99: 'b',
  72: '+', 73: '%', 88: '%', 80: '1', 47: '+', 50: '+', 48: '1', 51: '1',
  46: 'A', 69: 'A', 219: 'A',
  61: 'F', 74: 'Q', 75: 'Q', 76: 'Q', 227: 'Q', 83: 'C',
  85: 'S', 86: 'T', 87: 'U', 60: 'T',
  // Enemies, by how they move: walkers, hoppers, flyers, shooters.
  117: 'w', 100: 'w', 248: 'w', 191: 'w', 125: 'w', 196: 'w', 118: 'w', 41: 'w',
  104: 'k', 249: 'k', 102: 'k', 116: 'k', 110: 'k',
  120: 'n', 115: 'n', 126: 'n', 103: 'n',
  108: 'f', 190: 'f', 109: 'f', 152: 'f', 127: 'f', 106: 'f', 197: 'f',
  123: 'd', 105: 'd', 107: 'd', 225: 'd', 237: 'd',
  124: 'J', 184: 'J', 183: 'd', 250: 'd',   // copter lizards hover and dive
};
for (let id = 141; id <= 147; id++) CHAR[id] = 'o';
for (let id = 154; id <= 182; id++) CHAR[id] = 'o';
const BOSSES = new Set([101, 114, 151, 195, 198, 199, 200, 201, 202, 235, 241]);
// Weapon events -> weapon number (src/weapons.js): ammo (+3), ammo crates
// and power-up monitors.
const AMMO_EV = { 33: 2, 34: 3, 35: 4, 36: 5, 37: 6, 38: 7, 39: 8, 40: 9 };
const CRATE_EV = { 53: 3, 54: 2, 55: 4, 56: 5, 57: 6, 58: 7 };
const POWER_EV = { 131: 1, 132: 2, 133: 3, 134: 4, 135: 5, 136: 6, 220: 8, 221: 9 };
const BOMB_CRATE = 52; const BOMB = 43;

// Cell kinds for collision.
const SOLID = 0; const ONE_WAY = 1; const PASS = 2;

export class JJ2Level extends Level {
  // `file` from parseLevel, `ts` from parseTileset, `opts.party` keeps
  // multiplayer-only events and drops single-player ones.
  constructor(file, ts, meta, opts = {}) {
    const sprite = file.layers[3];
    const w = sprite.w; const h = sprite.h;
    const rows = Array.from({ length: h }, () => '.'.repeat(w));
    super(rows, meta);
    this.file = file;
    this.ts = ts;
    this.jj2 = true;
    this.masks = new Array(w * h).fill(null);
    this.kind = new Uint8Array(w * h);
    this.areas = new Uint8Array(w * h);      // area event id per cell
    this.areaParams = new Uint32Array(w * h);
    this.broken = new Map();                 // cell -> tile word shown after breaking
    this.collapse = new Map();               // collapsing cells -> ticks stood on
    this.triggers = new Map();               // trigger id -> [{ i, off, on }] tile words
    this.triggerState = new Set();           // trigger ids switched on
    this.triggerCrates = [];
    this.platforms = [];                     // moving platforms (src/jj2/platforms.js)
    this.lights = [];
    this.bridges = [];
    this.water = Infinity;                   // water surface (px), Infinity = none
    this.waterTarget = Infinity;
    this.texts = file.texts.map(cleanText);
    this.maskCache = new Map();
    this.layer = sprite.tiles ? sprite.tiles.slice() : new Uint16Array(w * h);
    this.convert(opts);
  }

  // ---------------------------------------------------------------- tiles

  // A layer word → { id, flipX, flipY, anim } (anim: index or -1).
  resolve(word) {
    const max = this.file.maxTiles;
    const flipY = !!(word & 0x2000);
    const flipX = !!(word & max);
    let id = word & (max - 1);
    const first = max - this.file.anims.length;
    let anim = -1;
    if (id >= first) {
      anim = id - first;
      id = this.firstFrame(anim, 0);
    }
    return { id, flipX, flipY, anim };
  }

  // Static tile of an animation's first frame (frames may be animations too).
  firstFrame(anim, depth) {
    const a = this.file.anims[anim];
    if (!a || !a.frames.length || depth > 8) return 0;
    const max = this.file.maxTiles;
    const id = a.frames[0] & 0x0fff & (max - 1);
    const first = max - this.file.anims.length;
    return id >= first ? this.firstFrame(id - first, depth + 1) : id;
  }

  maskOf(word) {
    if (this.maskCache.has(word)) return this.maskCache.get(word);
    const { id, flipX, flipY } = this.resolve(word);
    let m = tileMask(this.ts, id);
    if (flipX || flipY) {
      const f = new Uint8Array(1024);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) f[(flipY ? 31 - y : y) * 32 + (flipX ? 31 - x : x)] = m[y * 32 + x];
      m = f;
    }
    let n = 0;
    for (let i = 0; i < 1024; i++) n += m[i];
    const out = n ? { m, n } : null;
    this.maskCache.set(word, out);
    return out;
  }

  // ---------------------------------------------------------------- conversion

  convert({ party = false }) {
    const { file } = this;
    const w = this.w; const h = this.h;
    const ok = (d) => (party ? d === 0 || d === 3 : d === 0);
    const starts = {};
    let exits = 0;
    const bosses = [];
    const armed = new Set([1]);        // weapons the level gives ammo for ('blast': explosives)
    const put = (tx, ty, ch) => { if (tx >= 0 && ty >= 0 && tx < w && ty < h) this.entities.push({ ch, tx, ty }); };

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        const word = this.layer[i];
        const tile = this.resolve(word);
        let ev = decodeEvent(file.events[i]);
        if (!ev.id && tile.id) {
          // A tile's own default event applies where the layer has none.
          const te = file.tileEvents[tile.id] || 0;
          if (te & 0xff) ev = { id: te & 0xff, difficulty: 0, params: ((te >>> 12) & 0x000ffff0) | ((te >>> 8) & 0xf) };
        }
        if (ev.id === EV.GENERATOR) {
          // Generators spawn objects; ids up to 32 are area events (exits,
          // hooks...), which a generator never makes real.
          const [inner] = eventFields(ev.params, [8]);
          ev = inner <= 32 ? { id: 0, difficulty: 0, params: 0 } : { id: inner, difficulty: ev.difficulty, params: 0 };
        }
        const mask = word ? this.maskOf(word) : null;
        this.masks[i] = mask && mask.m;
        let ch = mask ? (mask.n >= 512 ? '#' : 's') : '.';
        const id = ev.id;
        if (!id) { this.tiles[ty][tx] = ch; continue; }
        if (!ok(ev.difficulty) && !(id <= 32 || id === EV.TEXT || id === EV.SET_WATER || id === EV.TUBE)) { this.tiles[ty][tx] = ch; continue; }

        switch (id) {
          case EV.ONE_WAY: this.kind[i] = ONE_WAY; if (mask) ch = '-'; break;
          case EV.HURT: if (mask) ch = '^'; this.areas[i] = id; break;
          case EV.VINE: case EV.HOOK:
            this.kind[i] = PASS; ch = '.'; this.areas[i] = id; this.vineY = this.vineY || new Map();
            this.vineY.set(i, vineRow(mask && mask.m));
            break;
          case EV.H_POLE: case EV.V_POLE:
            this.objects.push({ type: 'pole', tx, ty, vertical: id === EV.V_POLE });
            break;
          case EV.DESTRUCT: case EV.DESTRUCT_BOMB: case EV.BUTTSTOMP: case EV.GEMSTOMP: case EV.COLLAPSE: {
            if (!mask) break;
            const [, speed, weapon] = id === EV.DESTRUCT ? eventFields(ev.params, [10, 5, 4]) : [0, 0, 0];
            ch = speed > 0 ? 'p' : id === EV.BUTTSTOMP || id === EV.GEMSTOMP ? 'm' : 'x';
            // Weapon blocks: one weapon breaks them; bomb scenery, explosions.
            const need = id === EV.DESTRUCT_BOMB ? 7 : !speed && weapon >= 1 && weapon <= 9 ? weapon : 0;
            if (need) { ch = 'W'; this.weapons.set(`${tx},${ty}`, need); }
            // Collapsing scenery ('K') only gives way under the player's feet.
            if (id === EV.COLLAPSE) { this.collapse.set(i, 0); ch = 'K'; }
            // Destructible animated tiles hold their first frame until broken,
            // then show the last one (rubble, or nothing).
            if (tile.anim >= 0) {
              const a = file.anims[tile.anim];
              const keep = word & (file.maxTiles | 0x2000);
              this.layer[i] = (a.frames[0] & 0x0fff) | keep;
              this.broken.set(i, a.frames.length > 1 ? (a.frames[a.frames.length - 1] & 0x0fff) | keep : 0);
            }
            break;
          }
          case EV.JAZZ_START: case EV.SPAZ_START: case EV.LORI_START: case EV.MP_START:
            (starts[id] = starts[id] || []).push([tx, ty]);
            break;
          case EV.EOL: case EV.EOL_WARP: case EV.SECRET_WARP:
            if (!party) { this.objects.push({ type: 'exit', tx, ty }); exits++; }
            break;
          case EV.EOL_SIGN:
            put(tx, ty, 'E'); exits++;
            break;
          case EV.TEXT: {
            const [text] = eventFields(ev.params, [8]);
            if (this.texts[text]) this.objects.push({ type: 'hint', tx, ty, text: this.texts[text], hidden: true });
            break;
          }
          case EV.WARP_ORIGIN: {
            const [wid, coins] = eventFields(ev.params, [8, 8]);
            this.objects.push({ type: 'warp', tx, ty, id: `o${tx},${ty}`, to: `t${wid}`, cost: coins, label: coins ? 'COIN WARP!' : null, exitOnly: false, hidden: !coins });
            break;
          }
          case EV.WARP_TARGET: {
            const [wid] = eventFields(ev.params, [8]);
            this.objects.push({ type: 'warp', tx, ty: ty + 1, id: `t${wid}`, to: null, cost: 0, exitOnly: true, hidden: true });
            break;
          }
          case 85: case 86: case 87: case 60: {
            const [ceiling] = eventFields(ev.params, [1]);
            if (!ceiling) put(tx, ty, CHAR[id]);
            break;
          }
          case 91: case 92: case 93: {
            const [, , , , reverse] = eventFields(ev.params, [1, 1, 1, 4, 1]);
            // Horizontal springs push away from the wall they stand against.
            const wallLeft = this.solidCell(tx - 1, ty);
            put(tx, ty, reverse ? (wallLeft ? '<' : '>') : (wallLeft ? '>' : '<'));
            break;
          }
          case EV.GEM_RING: {
            const [len] = eventFields(ev.params, [5]);
            const n = Math.max(4, len || 8);
            for (let k = 0; k < n; k++) {
              const a = (k / n) * Math.PI * 2;
              this.extraPickups = this.extraPickups || [];
              this.extraPickups.push({ ch: '*', x: tx * TILE + 16 + Math.cos(a) * 40, y: ty * TILE + 16 + Math.sin(a) * 40 });
            }
            break;
          }
          case 49: case 70: {
            // Gem barrels and crates: their gems, in a little cluster.
            const counts = eventFields(ev.params, [4, 4, 4, 4]);
            let k = 0;
            ['*', 'g', 'b', 'v'].forEach((g, c) => {
              for (let n = 0; n < Math.min(counts[c], 6); n++, k++) {
                this.extraPickups = this.extraPickups || [];
                this.extraPickups.push({ ch: g, x: tx * TILE + 16 + ((k % 3) - 1) * 14, y: ty * TILE + 16 - Math.floor(k / 3) * 14 });
              }
            });
            if (!k) put(tx, ty, '*');
            break;
          }
          case EV.BRIDGE: {
            const [len] = eventFields(ev.params, [4]);
            this.bridges.push({ tx, ty, len: Math.max(1, len) });
            break;
          }
          case EV.TRIGGER_AREA: {
            // Trigger scenery: solid while its trigger is off; switched on, a
            // plain tile vanishes and an animated one shows its second frame.
            const [tid] = eventFields(ev.params, [5]);
            let off = word; let on = 0;
            if (tile.anim >= 0) {
              const a = file.anims[tile.anim];
              const keep = word & (file.maxTiles | 0x2000);
              off = (a.frames[0] & 0x0fff) | keep;
              on = a.frames.length > 1 ? (a.frames[1] & 0x0fff) | keep : 0;
              this.layer[i] = off;
            }
            if (!this.triggers.has(tid)) this.triggers.set(tid, []);
            this.triggers.get(tid).push({ i, off, on });
            break;
          }
          case EV.TRIGGER_CRATE: {
            const [tid, setOff, toggle] = eventFields(ev.params, [5, 1, 1]);
            this.triggerCrates.push({ tx, ty, id: tid, on: !setOff, toggle: !!toggle });
            break;
          }
          case 209: case 210: case 211: case 212: case 213: case 214: {
            const [sync, speed, length, swing] = eventFields(ev.params, [2, -6, 4, 1]);
            this.platforms.push({ x: tx * TILE + 16, y: ty * TILE + 16, type: id - 208, sync, speed, length, swing: !!swing });
            break;
          }
          case EV.LAVA:
            this.areas[i] = EV.HURT;
            break;
          case 33: case 34: case 35: case 36: case 37: case 38: case 39: case 40:
            this.objects.push({ type: 'ammo', tx, ty, weapon: AMMO_EV[id] });
            armed.add(AMMO_EV[id]);
            break;
          case 53: case 54: case 55: case 56: case 57: case 58:
            this.objects.push({ type: 'ammoCrate', tx, ty, weapon: CRATE_EV[id] });
            armed.add(CRATE_EV[id]);
            break;
          case 131: case 132: case 133: case 134: case 135: case 136: case 220: case 221:
            this.objects.push({ type: 'powerup', tx, ty, weapon: POWER_EV[id], ev: id });
            if (id < 220) armed.add(POWER_EV[id]);
            break;
          case BOMB_CRATE: this.objects.push({ type: 'bombCrate', tx, ty }); armed.add('blast'); break;
          case 79: this.objects.push({ type: 'item', tx, ty, kind: 'fastFeet' }); break;
          case 89: this.objects.push({ type: 'item', tx, ty, kind: 'stopwatch' }); break;
          case 90: this.objects.push({ type: 'item', tx, ty, kind: 'freeze' }); break;
          case BOMB: this.objects.push({ type: 'bomb', tx, ty }); armed.add('blast'); break;
          case EV.TRIGGER_ZONE: case EV.WATER_BLOCK: case EV.ACTIVATE_BOSS:
            this.areas[i] = id; this.areaParams[i] = ev.params;
            break;
          case EV.LIGHT_STEADY: case EV.LIGHT_PULSE: case EV.LIGHT_FLICKER:
            this.lights.push({ x: tx * TILE + 16, y: ty * TILE + 16, kind: id });
            break;
          case EV.BELT_RIGHT: case EV.BELT_LEFT: case EV.ACC_BELT_RIGHT: case EV.ACC_BELT_LEFT:
          case EV.WIND_LEFT: case EV.WIND_RIGHT: case EV.FLOAT_UP: case EV.TUBE: case EV.SET_WATER:
          case EV.LIGHT_SET: case EV.LIGHT_RESET: case EV.STOP_ENEMY: case EV.SLIDE:
            this.areas[i] = id; this.areaParams[i] = ev.params;
            break;
          default:
            if (BOSSES.has(id)) { bosses.push([tx, ty]); put(tx, ty, BOSS_CHAR[id] || 'n'); break; }
            if (CHAR[id]) put(tx, ty, CHAR[id]);
        }
        this.tiles[ty][tx] = ch;
      }
    }

    // Events 220/221 (pepper and electro power-ups) by the dozen are some
    // JJ2+ script's markers, not monitors.
    if (this.objects.filter((o) => o.ev >= 220).length > 8) this.objects = this.objects.filter((o) => !(o.ev >= 220));
    for (const o of this.objects) if (o.ev >= 220) armed.add(o.weapon);

    // A weapon block whose weapon the level never hands out (players carried
    // ammo between levels in the original) breaks with any shot instead, so
    // no level is left impassable. Missiles and TNT count as explosives.
    if ([4, 5, 7].some((n) => armed.has(n))) armed.add('blast');
    for (const [key, need] of this.weapons) {
      if (armed.has(need === 7 ? 'blast' : need)) continue;
      const [tx, ty] = key.split(',').map(Number);
      this.tiles[ty][tx] = 'x';
      this.weapons.delete(key);
    }

    for (const b of this.bridges) {
      for (let k = 0; k < b.len; k++) {
        const i = b.ty * w + b.tx + k;
        if (b.tx + k >= w) break;
        this.kind[i] = ONE_WAY;
        this.masks[i] = BRIDGE_MASK;
        if (this.tiles[b.ty][b.tx + k] === '.') this.tiles[b.ty][b.tx + k] = '-';
      }
    }

    const start = (starts[EV.JAZZ_START] || starts[EV.SPAZ_START] || starts[EV.LORI_START] || starts[EV.MP_START] || [[2, 2]]);
    this.starts = starts[EV.MP_START] || start;
    put(start[0][0], start[0][1], 'P');
    // A level that ends with a boss fight: beating the boss ends it (the exit
    // also waits where the boss was).
    this.bossEnds = !exits && bosses.length > 0;
    if (!exits && !party) {
      // No exit event (some JJ2+ levels place theirs by script): the exit
      // waits where the boss is, or else at the open spot with a floor that
      // is furthest from the start, never on the start itself.
      const [bx, by] = bosses[0] || this.farthestSpot(start[0][0], start[0][1]);
      put(bx, by, 'E');
    }
    // Levels open at the start light (64 = full daylight).
    this.ambient = Math.min(1, file.startLight / 64);
    // Original rule: instant water events under and beside the start set the
    // opening water level (and full light).
    const [sx, sy] = start[0];
    const heights = [[sx - 1, sy + 1], [sx, sy + 1], [sx + 1, sy + 1]].map(([x, y]) => {
      if (x < 0 || x >= w || y >= h) return null;
      const i = y * w + x;
      if (this.areas[i] !== EV.SET_WATER) return null;
      const [height, instant] = eventFields(this.areaParams[i], [8, 1]);
      return instant ? height : null;
    });
    if (heights.every((v) => v !== null && v === heights[0])) {
      this.water = this.waterTarget = heights[0] * TILE;
      this.ambient = 1;
    }
    this.lightTarget = this.ambient;
  }

  // Switch a trigger: its scenery tiles swap between their off and on words
  // (collision follows the tile shown).
  setTrigger(id, on) {
    if (this.triggerState.has(id) === on) return false;
    if (on) this.triggerState.add(id); else this.triggerState.delete(id);
    for (const t of this.triggers.get(id) || []) {
      const word = on ? t.on : t.off;
      this.layer[t.i] = word;
      const mask = word ? this.maskOf(word) : null;
      this.masks[t.i] = mask && mask.m;
      const tx = t.i % this.w; const ty = Math.floor(t.i / this.w);
      if (this.kind[t.i] !== ONE_WAY && this.tiles[ty][tx] !== '^') this.tiles[ty][tx] = mask ? (mask.n >= 512 ? '#' : 's') : '.';
      if (this.onBreak) this.onBreak(tx, ty);
    }
    return true;
  }

  solidCell(tx, ty) {
    if (tx < 0 || tx >= this.w) return true;
    if (ty < 0 || ty >= this.h) return false;
    return this.tiles[ty][tx] === '#';
  }

  // ---------------------------------------------------------------- queries

  // Pixel solidity. One-way cells only count when `oneWay` is set.
  solidPx(x, y, oneWay = false) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= this.pixelW) return true;
    if (y < 0 || y >= this.pixelH) return false;
    const i = (y >> 5) * this.w + (x >> 5);
    const m = this.masks[i];
    if (!m) return false;
    const k = this.kind[i];
    if (k === PASS || (k === ONE_WAY && !oneWay)) return false;
    return m[((y & 31) << 5) | (x & 31)] === 1;
  }

  areaAt(x, y) {
    const tx = Math.floor(x / TILE); const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return 0;
    return this.areas[ty * this.w + tx];
  }

  areaParam(x, y) {
    const tx = Math.floor(x / TILE); const ty = Math.floor(y / TILE);
    return this.areaParams[ty * this.w + tx] || 0;
  }

  // Tile-level answers for enemies, shots and the HUD.
  // Breadth-first through open cells from (sx, sy): the furthest cell that
  // has ground right under it.
  farthestSpot(sx, sy) {
    const { w, h } = this;
    const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !'#=xmpKW'.includes(this.tiles[y][x]);
    const floor = (x, y) => y + 1 < h && '#s-'.includes(this.tiles[y + 1][x]);
    const seen = new Uint8Array(w * h);
    let queue = [[sx, sy]];
    seen[sy * w + sx] = 1;
    let best = [sx, sy];
    while (queue.length) {
      const next = [];
      for (const [x, y] of queue) {
        if (floor(x, y)) best = [x, y];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (!open(nx, ny) || seen[ny * w + nx]) continue;
          seen[ny * w + nx] = 1;
          next.push([nx, ny]);
        }
      }
      queue = next;
    }
    return best;
  }

  solid(tx, ty) { const c = this.at(tx, ty); return c === '=' || c === '#' || c === 'x' || c === 'm' || c === 'p' || c === 'K' || c === 'W'; }
  slope(tx, ty) { return this.at(tx, ty) === 's'; }
  groundish(tx, ty) { return this.solid(tx, ty) || this.at(tx, ty) === 's' || this.at(tx, ty) === '^'; }
  shotHits(x, y) { return this.solidPx(x, y); }
  solidAt(x, y) { return this.solidPx(x, y); }
  platform(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.kind[ty * this.w + tx] === ONE_WAY;
  }

  breakTile(tx, ty, opts = {}) {
    let r;
    if (this.at(tx, ty) === 'K') {
      if (!opts.collapse) return false;
      this.tiles[ty][tx] = '.';
      r = true;
    } else r = super.breakTile(tx, ty, opts);
    if (r && this.at(tx, ty) === '.') {
      const i = ty * this.w + tx;
      this.layer[i] = this.broken.get(i) || 0;
      this.masks[i] = null;
      this.collapse.delete(i);
      if (this.onBreak) this.onBreak(tx, ty);
    }
    return r;
  }

  // ---------------------------------------------------------------- collision

  // Columns under the feet: the middle 10 px (slopes are walked on there).
  feetClear(body, y, oneWay) {
    const cx = body.x + body.w / 2;
    for (let x = Math.floor(cx - 5); x <= Math.floor(cx + 5); x++) if (this.solidPx(x, y, oneWay)) return false;
    return true;
  }

  // How far a body must rise to free its feet (up to `max` px), or null.
  lift(body, max, oneWay = false) {
    const cx = body.x + body.w / 2;
    for (let u = 0; u <= max; u++) {
      const bottom = body.y + body.h - u;
      let clear = true;
      for (let y = Math.floor(bottom - 12); y < bottom && clear; y++) {
        for (let x = Math.floor(cx - 5); x <= Math.floor(cx + 5); x++) if (this.solidPx(x, y, oneWay)) { clear = false; break; }
      }
      if (clear) return u;
    }
    return null;
  }

  columnClear(x, y0, y1) {
    for (let y = Math.floor(y0); y < y1; y++) if (this.solidPx(x, y)) return false;
    return true;
  }

  // Pixel-stepped movement against the masks. Walls block the body above its
  // feet; the feet climb slopes and lips up to `stepH` px per pixel moved.
  move(body, dx, dy, { dropThrough = false, climb = false, land = 0 } = {}) {
    const result = { left: false, right: false, top: false, bottom: false, slope: false };
    const stepH = climb ? 10 : Math.max(3, land);
    const enemy = !!body.type && climb;   // stop-enemy areas turn walkers only
    // Feet already inside a one-way tile (dropping through it, or after
    // jumping up into it) don't land on it until they are out. Checked before
    // the horizontal step, which can lift grounded feet onto a slope.
    const row0 = Math.floor(body.y + body.h - 0.001);
    const inside = dy > 0 && !this.feetClear(body, row0, true) && this.feetClear(body, row0, false);
    let left = Math.abs(dx);
    const dir = Math.sign(dx);
    while (left > 0) {
      const step = Math.min(1, left);
      const nx = body.x + dir * step;
      const edge = dir > 0 ? nx + body.w - 0.001 : nx;
      let blocked = !this.columnClear(edge, body.y, body.y + body.h - stepH);
      if (!blocked && enemy && this.areaAt(edge, body.y + body.h - 4) === EV.STOP_ENEMY) blocked = true;
      if (!blocked && land && !climb) {
        // Landing allowance: falling onto a ledge's edge lifts the body
        // over it, as long as the leading edge clears within `land` px.
        let u = 0;
        while (u <= land && !this.columnClear(edge, body.y - u, body.y + body.h - u)) u++;
        if (u > land || (u > 0 && !this.headClear(body, body.y - u))) blocked = true;
        else { body.x = nx; body.y -= u; left -= step; continue; }
      }
      if (!blocked) {
        const ox = body.x; const oy = body.y;
        body.x = nx;
        // Grounded feet ride one-way slopes too, but one-way tiles never wall.
        let u = this.lift(body, stepH, climb);
        if (u === null && climb) u = this.lift(body, stepH, false);
        if (u === null || (u > 0 && !this.headClear(body, body.y - u))) { body.x = ox; body.y = oy; blocked = true; }
        else body.y -= u;
      }
      if (blocked) { if (dir > 0) result.right = true; else result.left = true; break; }
      left -= step;
    }

    if (dy > 0) {
      let rest = dy;
      while (rest > 0) {
        const step = Math.min(1, rest);
        const ny = body.y + step;
        const row = Math.floor(ny + body.h - 0.001);
        const oneWay = !dropThrough && !inside;
        if (!this.feetClear(body, row, oneWay)) {
          body.y = row - body.h;
          result.bottom = true;
          break;
        }
        body.y = ny;
        rest -= step;
      }
    } else if (dy < 0) {
      let rest = -dy;
      while (rest > 0) {
        const step = Math.min(1, rest);
        const ny = body.y - step;
        if (!this.headClear(body, ny)) { body.y = Math.floor(ny) + 1; result.top = true; break; }
        body.y = ny;
        rest -= step;
      }
    }
    return result;
  }

  headClear(body, y) {
    const row = Math.floor(y);
    for (let x = Math.floor(body.x + 2); x <= Math.floor(body.x + body.w - 3); x++) if (this.solidPx(x, row)) return false;
    return true;
  }

  groundBelow(body, maxDist, { platforms = true } = {}) {
    const feet = body.y + body.h;
    for (let d = 0; d <= maxDist; d++) {
      const row = Math.floor(feet + d);
      if (!this.feetClear(body, row, platforms)) return row;
    }
    return null;
  }

  snapDown(body, speed, opts) {
    const s = this.groundBelow(body, 6 + Math.abs(speed) * 1.5, opts);
    if (s === null) return false;
    body.y = s - body.h;
    return true;
  }

  touchesSpikes(body) {
    const x0 = Math.floor((body.x - 1) / TILE); const x1 = Math.floor((body.x + body.w) / TILE);
    const y0 = Math.floor((body.y - 1) / TILE); const y1 = Math.floor((body.y + body.h + 1) / TILE);
    for (let ty = Math.max(0, y0); ty <= Math.min(this.h - 1, y1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(this.w - 1, x1); tx++) {
        if (this.areas[ty * this.w + tx] !== EV.HURT) continue;
        // Touching the tile's solid pixels (or the cell, for mask-less spikes).
        const m = this.masks[ty * this.w + tx];
        if (!m) { if (body.y + body.h > ty * TILE + 8) return true; continue; }
        for (let y = Math.max(ty * TILE, Math.floor(body.y - 1)); y <= Math.min(ty * TILE + 31, body.y + body.h + 1); y++) {
          for (let x = Math.max(tx * TILE, Math.floor(body.x - 1)); x <= Math.min(tx * TILE + 31, body.x + body.w); x += 2) {
            if (m[((y & 31) << 5) | (x & 31)]) return true;
          }
        }
      }
    }
    return false;
  }
}

// The row a vine is held from: the first solid mask row, else 8.
function vineRow(m) {
  if (m) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (m[y * 32 + x]) return y;
  return 8;
}

// Bridges: a plank band 10-15 px down the cell.
const BRIDGE_MASK = new Uint8Array(1024);
for (let y = 10; y < 16; y++) for (let x = 0; x < 32; x++) BRIDGE_MASK[y * 32 + x] = 1;
