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

export const PARTY_GOAL = 100;
export const PARTY_RESPAWN = 700;   // ticks (10 s)
export const PARTY_DROP = 5;        // gem value dropped per hit
// Levels with plenty of gems and room to chase (indices into LEVELS).
export const PARTY_LEVELS = [0, 2, 5, 6];

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

// A rival's shot: moves like a blaster shot, dies on walls, hurts only us.
class RivalShot {
  constructor(m) {
    Object.assign(this, { x: m.x, y: m.y, vx: m.vx, vy: m.vy, spread: m.sp, w: 14, h: 8, life: PLAYER.shotLife, dead: false });
    this.prevX = this.x; this.prevY = this.y;
  }

  update(game) {
    this.prevX = this.x; this.prevY = this.y;
    this.vx += Math.sign(this.vx) * PLAYER.shotAccel;
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
    if (game.level.solid(Math.floor((this.x + 7) / TILE), Math.floor((this.y + 4) / TILE))) this.dead = true;
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
      this.net.send({ t: 's', x: Math.round(p.x), y: Math.round(p.y), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), f: p.facing, a: p.anim, g: game.gems, d: p.dead ? 1 : 0 });
    }
    this.rival.update();
    for (const s of this.shots) s.update(game);
    // Rival shots against us; ours fizzle on the rival (it decides the hit).
    if (!p.dead && p.invuln === 0) {
      for (const s of this.shots) if (!s.dead && overlap(s, p)) { s.dead = true; this.hit(game, s.x); }
    }
    for (const s of game.shots) {
      if (!s.dead && !this.rival.dead && overlap(s, this.rival)) { s.dead = true; game.effect('hitSpark', s.x + 7, s.y + 4); }
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

  tile(tx, ty) { this.net.send({ t: 'tile', x: tx, y: ty }); }
  fire(shot) { this.net.send({ t: 'shot', x: Math.round(shot.x), y: Math.round(shot.y), vx: +shot.vx.toFixed(2), vy: +shot.vy.toFixed(2), sp: shot.spread ? 1 : 0 }); }

  win(game) {
    this.result = 'win';
    this.net.send({ t: 'win' });
    game.audio.play('fanfare');
  }

  receive(game, m) {
    const find = (id) => game.pickups.find((k) => k.id === id && !k.taken);
    switch (m.t) {
      case 's': {
        const r = this.rival;
        if (!r.seen) { r.x = m.x; r.y = m.y; r.prevX = m.x; r.prevY = m.y; }
        Object.assign(r, { tx: m.x, ty: m.y, vx: m.vx, vy: m.vy, facing: m.f, anim: m.a, gems: m.g, dead: !!m.d, seen: true });
        break;
      }
      case 'shot': this.shots.push(new RivalShot(m)); game.audio.play('shoot'); break;
      case 'drop': this.addDrops(game, m.drops, m.by); break;
      case 'take': {               // host: the guest asks for a pickup
        const k = find(m.id);
        if (k && !k.pending) { k.taken = true; this.net.send({ t: 'grant', id: m.id }); } else this.net.send({ t: 'deny', id: m.id });
        break;
      }
      case 'grant': { const k = game.pickups.find((q) => q.id === m.id); if (k && !k.taken) k.collect(game); break; }
      case 'deny': { const k = game.pickups.find((q) => q.id === m.id); if (k) k.taken = true; break; }
      case 'gone': { const k = find(m.id) || game.pickups.find((q) => q.id === m.id && q.pending); if (k) k.taken = true; break; }
      case 'tile': game.hitTile(m.x, m.y, { stomp: true, speed: true, remote: true }); break;
      case 'win': this.result = 'lose'; game.audio.play('gameover'); break;
      case 'left': this.result = this.result || 'left'; break;
      default: break;
    }
  }
}
