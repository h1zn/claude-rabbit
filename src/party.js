// Two-player party mode over the serve.py relay (WebSocket at /ws).
//
// Rules: both players hunt the same level's gems. Shooting the rival makes
// them drop up to 5 gems' worth, which either player can grab; a rival with
// no gems is knocked out and comes back 10 s later. The first to reach the
// exit sign holding 100 gems wins.
//
// Sync: each side simulates its own player and sends its state 20 times a
// second; the rival is drawn smoothly between updates. The host owns the
// pickups (the guest asks before collecting), and each side decides hits on
// its own player from the rival's shots, so neither can be hit unfairly.

import { PLAYER, TILE } from './config.js';
import { overlap, Pickup } from './entities.js';
import { Bullet, TNT } from './weapons.js';

export const PARTY_GOAL = 100;
export const PARTY_RESPAWN = 700;   // ticks (10 s)
export const PARTY_DROP = 5;        // gem value dropped per hit
// Levels with plenty of gems and room to chase (indices into LEVELS).
export const PARTY_LEVELS = ['jj2:overgrown:0', 0, 2, 5, 6];

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
      this.ws.onclose = () => { if (this.status === 'open') this.inbox.push({ t: 'left' }); this.status = 'closed'; };
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

// The rival as last reported, drawn between updates.
class Rival {
  constructor() {
    Object.assign(this, { x: -999, y: -999, prevX: -999, prevY: -999, tx: -999, ty: -999, vx: 0, vy: 0, w: PLAYER.w, h: PLAYER.h, facing: 1, anim: 'idle', gems: 0, dead: false, seen: false });
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
  constructor(net, role) {
    this.net = net;
    this.role = role;           // 'host' | 'guest'
    this.rival = new Rival();
    this.shots = [];
    this.respawn = 0;           // ticks left while knocked out
    this.result = null;         // 'win' | 'lose' | 'left'
    this.dropSeq = 0;
    this.stateTimer = 0;
  }

  get host() { return this.role === 'host'; }

  // Set up a freshly loaded level for the hunt.
  begin(game) {
    game.enemies = [];
    game.totals.enemies = 0;
    game.pickups.forEach((k, i) => { k.id = `p${i}`; });
    game.lives = 99;
    const p = game.player;
    this.rival.h = p.h;
    // Battle levels have several start spots: the guest takes another one.
    const starts = game.level.starts;
    if (!this.host && starts && starts.length > 1) {
      const [tx, ty] = starts[1];
      p.spawn(tx * TILE + (TILE - p.w) / 2, ty * TILE + TILE - p.h);
      game.respawn = { x: p.x, y: p.y };
    }
  }

  tick(game) {
    for (const m of this.net.take()) this.receive(game, m);
    const p = game.player;
    if (this.respawn > 0 && --this.respawn === 0) {
      p.spawn(game.respawn.x, game.respawn.y);
      p.invuln = 140;
      p.health = PLAYER.maxHealth;
    }
    if (++this.stateTimer >= 3) {
      this.stateTimer = 0;
      this.net.send({ t: 's', x: Math.round(p.x), y: Math.round(p.y), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), f: p.facing, a: p.anim, g: game.gems, d: p.dead ? 1 : 0, c: p.character });
    }
    this.rival.update();
    for (const s of this.shots) s.update(game);
    // Rival shots against us (missiles and TNT blast us instead); ours
    // fizzle on the rival (it decides the hit).
    // (While we blink after a hit the shot is still used up, as on the
    // shooter's screen; hit() ignores it.)
    if (!p.dead) {
      for (const s of this.shots) {
        if (s.dead || s.weapon === TNT || !overlap(s, p)) continue;
        if (s.explosive) s.burst(game);
        else { s.dead = true; this.hit(game, s.x); }
      }
    }
    for (const s of game.shots) {
      if (s.dead || s.weapon === TNT || this.rival.dead || !overlap(s, this.rival)) continue;
      if (s.explosive) { s.dead = true; game.effect('explosion', s.cx, s.cy, 3); } else { s.dead = true; game.effect('hitSpark', s.cx, s.cy); }
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }

  // We were shot (or burned): drop gems, or get knocked out if we have none.
  hit(game, fromX) {
    const p = game.player;
    if (p.dead || p.invuln > 0) return;
    if (game.gems > 0) {
      const lost = Math.min(PARTY_DROP, game.gems);
      game.gems -= lost;
      const drops = [];
      for (let i = 0; i < lost; i++) {
        drops.push({ id: `d${this.role[0]}${this.dropSeq++}`, x: Math.round(p.cx - 10), y: Math.round(p.y + 4), vx: +((Math.random() - 0.5) * 6).toFixed(2), vy: +(-3 - Math.random() * 3).toFixed(2) });
      }
      this.addDrops(game, drops, this.role);
      this.net.send({ t: 'drop', drops, by: this.role });
      p.invuln = 90;
      p.knock = 14;
      p.vx = (p.cx < fromX ? -1 : 1) * 4;
      p.vy = -4;
      game.audio.play('hurt');
      game.flash('#ff2a4a', 6);
      game.banner(`-${lost} GEMS`, 50);
    } else {
      p.dead = true;
      p.vy = -8; p.vx = 0;
      this.respawn = PARTY_RESPAWN;
      game.audio.play('death');
      game.shake(10);
    }
  }

  // Dropped gems fly out; the player who dropped them can't grab them back
  // for the first 80 ticks.
  addDrops(game, drops, by) {
    for (const d of drops) {
      const k = new Pickup('gem', d.x, d.y, { color: 'red', value: 1, score: 100, w: 20, h: 20, id: d.id, vx: d.vx, vy: d.vy, falling: true, droppedBy: by, t: 0 });
      game.pickups.push(k);
    }
  }

  // Our player touched a pickup. The host collects at once and says so; the
  // guest hides it and asks the host, who grants it if it is still there.
  touch(game, k) {
    if (k.droppedBy === this.role && k.t < 80) return;
    if (this.host) {
      k.collect(game);
      this.net.send({ t: 'gone', id: k.id });
    } else if (!k.pending) {
      k.pending = true;
      this.net.send({ t: 'take', id: k.id });
    }
  }

  // Our TNT went off: the rival's copy (or a JJ2 bomb there) goes off too.
  boom(x, y) { this.net.send({ t: 'boom', x: Math.round(x), y: Math.round(y) }); }

  tile(tx, ty, opts = {}) { this.net.send({ t: 'tile', x: tx, y: ty, w: opts.weapon || 0, b: opts.blast ? 1 : 0 }); }
  fire(shot) { this.net.send({ t: 'shot', x: Math.round(shot.x), y: Math.round(shot.y), vx: +shot.vx.toFixed(2), vy: +shot.vy.toFixed(2), w: shot.weapon, p: shot.powered ? 1 : 0, l: shot.life, h: shot.whammo || undefined }); }

  win(game) {
    this.result = 'win';
    this.net.send({ t: 'win' });
    game.audio.play('fanfare');
  }

  receive(game, m) {
    const find = (id) => game.pickups.find((k) => k.id === id && !k.taken);
    // The rival got it: a trigger crate still flips its trigger here.
    const gone = (k) => {
      k.taken = true;
      const t = k.trigger;
      if (t) game.level.setTrigger(t.id, t.toggle ? !game.level.triggerState.has(t.id) : t.on);
    };
    switch (m.t) {
      case 's': {
        const r = this.rival;
        if (!r.seen) { r.x = m.x; r.y = m.y; r.prevX = m.x; r.prevY = m.y; }
        Object.assign(r, { tx: m.x, ty: m.y, vx: m.vx, vy: m.vy, facing: m.f, anim: m.a, gems: m.g, dead: !!m.d, seen: true, character: m.c });
        break;
      }
      case 'shot': {
        // The rival's shot flies here as well, but only hurts us.
        const b = new Bullet(m.w || 1, !!m.p, m.x, m.y, m.vx, m.vy, { remote: true });
        if (m.h && m.w === 1) b.setWhammo(String(m.h));
        if (m.l) b.life = m.l;
        this.shots.push(b);
        game.audio.play(b.weapon === 6 ? 'flame' : 'shoot');
        break;
      }
      case 'drop': this.addDrops(game, m.drops, m.by); break;
      case 'take': {               // host: the guest asks for a pickup
        const k = find(m.id);
        if (k && !k.pending) { gone(k); this.net.send({ t: 'grant', id: m.id }); } else this.net.send({ t: 'deny', id: m.id });
        break;
      }
      case 'grant': { const k = game.pickups.find((q) => q.id === m.id); if (k && !k.taken) k.collect(game); break; }
      case 'deny': { const k = game.pickups.find((q) => q.id === m.id); if (k && !k.taken) gone(k); break; }
      case 'gone': { const k = find(m.id) || game.pickups.find((q) => q.id === m.id && q.pending); if (k) gone(k); break; }
      case 'tile': game.hitTile(m.x, m.y, { stomp: true, speed: true, collapse: true, weapon: m.w, blast: !!m.b, remote: true }); break;
      case 'boom': {
        const near = (s) => s.weapon === TNT && !s.dead && Math.abs(s.cx - m.x) < 24 && Math.abs(s.cy - m.y) < 24;
        for (const s of this.shots) if (near(s)) s.burst(game);
        for (const s of game.shots) if (near(s) && s.placed) s.burst(game);
        break;
      }
      case 'win': if (!this.result) { this.result = 'lose'; game.audio.play('gameover'); } break;
      case 'left': this.result = this.result || 'left'; break;
      default: break;
    }
  }
}
