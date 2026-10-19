// Party items: the funny weapons. "?" boxes stand on the spare spawn spots;
// grabbing one gives a random item, used with FIRE (instead of a shot):
//   banana peel   dropped behind you: whoever runs over it slips and spins
//   spring mine   dropped: whoever steps on it is launched sky-high
//   boomerang     flies out and comes back, costing whoever it hits a heart
//   bubble trap   traps whoever it hits in a bubble that floats them away
//   swap ray      swaps you with whoever it hits
//   pie           splats over the screen of whoever it hits
//   shrink ray    shrinks whoever it hits, small and slow, for a while
//   gem magnet    pulls loose gems to you for a while
// As with shots, each player decides what hits them (the others are told);
// nothing touches anybody during the truce.

import { overlap, Pickup } from './entities.js';
import { tr } from './lang.js';

export const ITEMS = {
  peel: { name: 'BANANA PEEL', color: '#ffe05a' },
  mine: { name: 'SPRING MINE', color: '#ff7a5a' },
  boomerang: { name: 'BOOMERANG', color: '#ffb04a' },
  bubble: { name: 'BUBBLE TRAP', color: '#8ad8ff' },
  swap: { name: 'SWAP RAY', color: '#d88aff' },
  pie: { name: 'CREAM PIE', color: '#fff4e0' },
  shrink: { name: 'SHRINK RAY', color: '#7aff9a' },
  magnet: { name: 'GEM MAGNET', color: '#ff5a8a' },
};
export const ITEM_KINDS = Object.keys(ITEMS);
const BOXES = 6;
// How long each effect lasts (ticks).
const LAST = { bubble: 150, pie: 210, shrink: 420, magnet: 420, slip: 90 };

// A shot item in flight (boomerang, bubble, swap, pie, shrink).
export class ItemShot {
  constructor(kind, x, y, dir, owner, remote = false) {
    Object.assign(this, { kind, x, y, vx: dir * (kind === 'boomerang' ? 7 : 5.5), vy: 0, w: 18, h: 14, owner, remote, life: kind === 'boomerang' ? 150 : 110, t: 0, dead: false, prevX: x, prevY: y });
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // `home`: where the thrower is now (the boomerang heads back to it).
  update(game, home) {
    this.prevX = this.x; this.prevY = this.y;
    this.t++;
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.kind === 'boomerang') {
      if (this.t > 26 && home) {
        const dx = home.cx - this.cx; const dy = home.cy - this.cy; const d = Math.hypot(dx, dy) || 1;
        this.vx += (dx / d) * 0.6; this.vy += (dy / d) * 0.6;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 8) { this.vx *= 8 / sp; this.vy *= 8 / sp; }
        if (d < 18) this.dead = true;      // caught
      } else this.vx *= 0.985;
      this.x += this.vx; this.y += this.vy;
      return;
    }
    this.x += this.vx;
    if (this.kind === 'bubble') this.y += Math.sin(this.t / 6) * 0.6;
    if (game.level.solidAt(this.cx, this.cy)) { this.dead = true; game.effect('poof', this.cx, this.cy); }
  }
}

// Put "?" boxes on the spawn spots no player starts on.
export function placeBoxes(game, party) {
  const spare = party.spots.slice(Math.max(5, party.players.length));
  spare.slice(0, BOXES).forEach((s, i) => {
    const k = new Pickup('itembox', s.x - 4, s.y + game.player.h - 28, { w: 24, h: 24, id: `i${i}`, t: 0 });
    k.home = { x: k.x, y: k.y };
    game.pickups.push(k);
    party.byId.set(k.id, k);
  });
}

// A box: drawn once.
let boxArt = null;
export function boxSprite() {
  if (boxArt) return boxArt;
  const c = document.createElement('canvas');
  c.width = 24; c.height = 24;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 24);
  g.addColorStop(0, '#ffe07a'); g.addColorStop(1, '#e0801a');
  x.fillStyle = g;
  x.beginPath(); x.roundRect(1, 1, 22, 22, 4); x.fill();
  x.strokeStyle = '#5a2a0a'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#ffffff'; x.font = 'bold 17px "Arial Black", Impact, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.strokeStyle = '#7a3a0a'; x.lineWidth = 3; x.strokeText('?', 12, 13); x.fillText('?', 12, 13);
  boxArt = { right: c, left: c, w: 24, h: 24, ax: 12, ay: 24 };
  return boxArt;
}

// The item part of a Party: what we hold, what's affecting us, and the
// traps and item shots in the level.
export class Items {
  constructor(party) {
    this.party = party;
    this.held = null;          // item kind we can use
    this.shots = [];           // item shots in flight (ours and others')
    this.traps = [];           // { id, kind, x, y, w, h, owner, t }
    this.seq = 0;
    Object.assign(this, { bubble: 0, pie: 0, shrink: 0, magnet: 0 });
  }

  // The host picks what a box holds.
  static roll() { return ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)]; }

  give(game, kind) {
    this.held = kind;
    game.audio.play('select');
    game.banner(tr('{0}! FIRE TO USE', tr(ITEMS[kind].name)), 80);
  }

  // FIRE with an item held: use it instead of shooting. True when used.
  use(game) {
    if (!this.held) return false;
    const kind = this.held;
    this.held = null;
    const p = game.player;
    const party = this.party;
    if (kind === 'magnet') { this.magnet = LAST.magnet; game.audio.play('secret'); return true; }
    if (kind === 'peel' || kind === 'mine') {
      const trap = { id: `t${party.id}-${this.seq++}`, kind, x: Math.round(p.cx - 10 - p.facing * 26), y: Math.round(p.y + p.h - 12), owner: party.id };
      this.addTrap(trap);
      party.net.send({ t: 'trap', ...trap });
      game.audio.play('land');
      return true;
    }
    const s = new ItemShot(kind, p.facing > 0 ? p.x + p.w : p.x - 18, p.y + p.h / 2 - 10, p.facing, party.id);
    this.shots.push(s);
    party.net.send({ t: 'ishot', kind, x: Math.round(s.x), y: Math.round(s.y), d: p.facing });
    game.audio.play(kind === 'boomerang' ? 'throw' : 'shoot');
    return true;
  }

  addTrap(t) { this.traps.push({ ...t, w: 20, h: 12, t: 0 }); }

  // One tick: our effects, shots in flight, traps underfoot.
  tick(game) {
    const party = this.party;
    const p = game.player;
    for (const k of ['bubble', 'pie', 'shrink', 'magnet']) if (this[k] > 0) this[k]--;
    if (this.bubble > 0 && !p.dead) {
      // Floating off in a bubble, helpless.
      p.knock = Math.max(p.knock, 2); p.vy = -1.1; p.vx *= 0.9;
      if (this.bubble === 1) game.effect('poof', p.cx, p.cy);
    }
    if (this.shrink > 0) p.vx = Math.max(-3, Math.min(3, p.vx));
    if (this.magnet > 0) {
      for (const k of game.pickups) {
        if (k.kind !== 'gem' || k.taken || k.pending) continue;
        const dx = p.cx - (k.x + k.w / 2); const dy = p.cy - (k.y + k.h / 2); const d = Math.hypot(dx, dy);
        if (d < 220 && d > 4) { k.x += (dx / d) * 4; k.y += (dy / d) * 4; k.falling = false; }
      }
    }
    for (const s of this.shots) {
      const thrower = s.owner === party.id ? p : party.rivals.get(s.owner);
      s.update(game, thrower);
      if (s.dead || party.truce || p.dead) continue;
      // Someone else's item reaching us: we take the effect.
      if (s.owner !== party.id && overlap(s, p)) { s.dead = true; this.struck(game, s.kind, s.owner, s.cx); }
      // Ours reaching another player fizzles here (they decide).
      if (s.owner === party.id && party.targets().some((r) => overlap(s, r))) { s.dead = true; game.effect('hitSpark', s.cx, s.cy); }
    }
    this.shots = this.shots.filter((s) => !s.dead);
    for (const t of this.traps) {
      t.t++;
      if (party.truce || p.dead || (t.owner === party.id && t.t < 60) || !overlap(t, p)) continue;
      t.gone = true;
      party.net.send({ t: 'untrap', id: t.id, by: party.id });
      this.sprung(game, t);
    }
    this.traps = this.traps.filter((t) => !t.gone);
  }

  // An item shot hit us.
  struck(game, kind, by, fromX) {
    const party = this.party;
    const p = game.player;
    if (kind === 'boomerang') { party.hit(game, fromX, by); }
    else if (kind === 'bubble') { this.bubble = LAST.bubble; game.audio.play('hover'); }
    else if (kind === 'pie') { this.pie = LAST.pie; game.audio.play('stomp'); }
    else if (kind === 'shrink') { this.shrink = LAST.shrink; game.audio.play('denied'); }
    else if (kind === 'swap') {
      const r = party.rivals.get(by);
      if (r && r.seen) {
        party.net.send({ t: 'zap', kind, by, x: Math.round(p.x), y: Math.round(p.y) });
        game.warpTo({ x: r.x - (32 - p.w) / 2, w: 32, bottom: r.y + p.h });
        party.say(tr('{0} GOT {1} BY {2}', party.name, tr(ITEMS[kind].name), party.nameOf(by)));
        return;
      }
    }
    party.net.send({ t: 'zap', kind, by });
    party.say(tr('{0} GOT {1} BY {2}', party.name, tr(ITEMS[kind].name), party.nameOf(by)));
  }

  // We stepped on a trap.
  sprung(game, t) {
    const p = game.player;
    const party = this.party;
    if (t.kind === 'peel') {
      p.knock = 45; p.dizzy = 120; p.vx = (p.vx >= 0 ? 1 : -1) * 7; p.vy = -3;
      game.audio.play('hurt');
    } else {
      p.vy = -15; p.onGround = false; p.jumping = false;
      game.effect('explosion', t.x + 10, t.y + 6, 3);
      game.audio.play('spring');
    }
    party.say(tr('{0} GOT {1} BY {2}', party.name, tr(ITEMS[t.kind].name), party.nameOf(t.owner)));
  }

  receive(game, m) {
    const party = this.party;
    switch (m.t) {
      case 'ishot': this.shots.push(new ItemShot(m.kind, m.x, m.y, m.d, m.from, true)); return true;
      case 'trap': this.addTrap({ id: m.id, kind: m.kind, x: m.x, y: m.y, owner: m.from }); return true;
      case 'untrap': this.traps = this.traps.filter((t) => t.id !== m.id); return true;
      case 'zap':
        if (m.kind === 'swap' && m.by === party.id && m.x !== undefined) {
          const p = game.player;
          game.warpTo({ x: m.x - (32 - p.w) / 2, w: 32, bottom: m.y + p.h });
        }
        party.say(tr('{0} GOT {1} BY {2}', party.nameOf(m.from), tr(ITEMS[m.kind].name), party.nameOf(m.by)));
        return true;
      default: return false;
    }
  }
}
