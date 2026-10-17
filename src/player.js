// Kip, the player. Movement follows SPEC.md: measured values for jump launch,
// variable jump, friction, hover, stomp bounce, knockback and the special-move
// (uppercut) timing; tuned gravity, caps and buttstomp speed.

import { PHYS, PLAYER, TILE } from './config.js';
import { eventFields } from './jj2/files.js';
import { EV } from './jj2/level.js';

const HANG = 14;
const KICK_WINDUP = 8;   // tuned: Spaz's and Lori's kicks
const KICK_END = 30;   // px from a vine down to the top of a hanging body

export class Player {
  constructor(x, y) {
    this.w = PLAYER.w;
    this.h = PLAYER.h;
    this.spawn(x, y);
    this.health = PLAYER.maxHealth;
    this.spreadAmmo = 0;
    this.shotDelay = PLAYER.shotDelay;
  }

  spawn(x, y) {
    Object.assign(this, {
      x, y, prevX: x, prevY: y, vx: 0, vy: 0, facing: 1, onGround: false, onSlope: false,
      coyote: 0, jumpBuffer: 0, jumping: false, hovering: false, hoverLeft: PHYS.hoverTicks,
      invuln: 0, knock: 0, dropThrough: 0, shotCooldown: 0, shootPose: 0,
      stomping: false, special: 0, rush: 0, celebrate: false,
      pole: null, poleT: 0, poleCool: 0, springLock: 0, warpLock: null,
      crouchT: 0, superJump: false, shield: 0, dash: 0, jumpCut: false,
      hang: null, hangCool: 0, swimming: false, floatUp: false, inTube: 0, doubleJumped: false,
      dead: false, deadTimer: 0, anim: 'idle', animTime: 0, skid: 0, idleTime: 0,
    });
  }

  // Ticks of wind-up before the special move: Jazz's uppercut, or the kick
  // Spaz (side kick) and Lori (flying kick) do instead.
  get windup() { return this.character === 'spaz' || this.character === 'lori' ? KICK_WINDUP : PHYS.uppercutWindup; }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  // True while Kip destroys whatever he touches.
  get attacking() { return this.rush > 0 || this.stomping || this.special > 0; }

  update(game, input) {
    const { level, audio } = game;
    this.prevX = this.x;
    this.prevY = this.y;
    this.animTime++;
    for (const k of ['invuln', 'knock', 'shotCooldown', 'shootPose', 'dropThrough', 'skid', 'poleCool', 'springLock', 'hangCool', 'inTube']) if (this[k] > 0) this[k]--;
    if (this.rush > 0 && --this.rush === 0) game.endRush();
    if (this.shield > 0) this.shield--;

    if (this.dead) {
      this.deadTimer++;
      this.vy = Math.min(this.vy + PHYS.riseGravity, PHYS.maxFall);
      this.y += this.vy;
      this.anim = 'hurt';
      return;
    }
    if (this.celebrate) {
      this.vx = 0;
      this.anim = 'victory';
      this.fall(game);
      return;
    }

    if (this.pole) {
      this.swing(game, input);
      return;
    }
    // Original JJ2 levels: tubes, vines and hooks take over movement.
    if (level.areas && this.jj2Move(game, input)) return;

    const controlled = this.knock === 0 && this.special === 0 && this.springLock === 0;
    const dir = controlled ? (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0) : 0;
    // Dash: holding Run (or a sugar rush) keeps it active; it outlives the
    // key by 16 ticks and then the speed snaps straight back to walk speed.
    if (input.held('run') || this.rush > 0) this.dash = PHYS.dashGrace;
    else if (this.dash > 0 && --this.dash === 0 && Math.abs(this.vx) > PHYS.walkMax) this.vx = Math.sign(this.vx) * PHYS.walkMax;
    const dashing = this.dash > 0;
    const boost = this.rush > 0 ? PHYS.rushSpeedScale : 1;
    const accel = (dashing ? PHYS.runAccel : PHYS.walkAccel) * boost;
    const max = this.swimming ? (dashing ? 4 : 2.5) : (dashing && !this.hovering ? PHYS.runMax : PHYS.walkMax) * boost;
    const crouching = controlled && this.onGround && input.held('down') && !dir;
    this.crouchT = crouching ? this.crouchT + 1 : 0;
    if (dir) {
      if (this.onGround && Math.sign(this.vx) === -dir && Math.abs(this.vx) > 3) {
        this.skid = 10;
        if (this.animTime % 3 === 0) game.dust(this.cx, this.y + this.h, 1);
      }
      this.facing = dir;
    }

    // While coptering, horizontal speed tops out at the walk cap (original).
    if (this.hovering && Math.abs(this.vx) > PHYS.walkMax) this.vx = approach(this.vx, Math.sign(this.vx) * PHYS.walkMax, PHYS.dashDecel);
    // ---- horizontal: one table for ground and air (original). Input
    // accelerates toward the cap; speed above it (springs, poles) bleeds off.
    if (dir) {
      this.vx = accelerate(this.vx, dir, accel, max, PHYS.walkDecel);
    } else if (this.knock === 0 && this.springLock === 0) {
      this.vx = approach(this.vx, 0, dashing ? PHYS.dashDecel : PHYS.walkDecel);
    }

    // ---- special: uppercut (hold Up + Shoot). Measured timing: 16-tick
    // wind-up, then rise with vy = (t - 256) * 2048 / 65536 until tick 45.
    if (this.special === 0 && this.knock === 0 && input.held('up') && input.pressed('shoot')) {
      this.special = 1;
      this.stomping = false;
      this.hovering = false;
      audio.play('uppercutCharge');
    }
    if (this.special > 0 && this.windup === KICK_WINDUP) {
      // Kick: a short wind-up, then a fast dash forward that smashes whatever
      // it meets (Lori's flying kick lifts a little).
      const t = this.special++;
      if (t < KICK_WINDUP) {
        this.vx *= 0.5;
        this.vy = 0;
      } else if (t <= KICK_END) {
        if (t === KICK_WINDUP) audio.play('uppercut');
        this.vx = this.facing * 10;
        this.vy = this.character === 'lori' ? -1.4 + (t - KICK_WINDUP) * 0.06 : 0;
        if (t % 2 === 0) game.trail(this.cx - this.facing * 10, this.cy, '#ffd54a');
      } else {
        this.special = 0;
        this.vx = this.facing * PHYS.walkMax;
        this.jumping = false;
      }
    } else if (this.special > 0) {
      const t = this.special++;
      if (t < PHYS.uppercutWindup) {
        this.vx *= 0.6;
        this.vy = 0;
      } else if (t <= PHYS.uppercutEnd) {
        if (t === PHYS.uppercutWindup) audio.play('uppercut');
        this.vy = ((t - 256) * 2048) / 65536;
        this.vx = this.facing * 1.2;
        if (t % 2 === 0) game.trail(this.cx, this.y + 8, '#ffd54a');
      } else {
        this.special = 0;
        this.jumping = false;
      }
    }

    // ---- jump, drop-through, hover and buttstomp
    if (controlled && input.pressed('jump')) this.jumpBuffer = PHYS.jumpBufferTicks;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;
    const onPlatform = this.onGround && level.platform(Math.floor(this.cx / TILE), Math.floor((this.y + this.h + 1) / TILE));
    if (this.special === 0 && !this.swimming) {
      if (this.jumpBuffer > 0 && input.held('down') && onPlatform) {
        this.dropThrough = 10;
        this.jumpBuffer = 0;
        this.onGround = false;
      } else if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        // Measured: vy = jumpBase - |vx| / 4 (running jumps go higher). From a
        // full crouch it is a super jump (manual: 60% higher, smashes blocks).
        this.superJump = this.onGround && this.crouchT >= PHYS.superJumpCoil;
        this.vy = PHYS.jumpBase * (this.superJump ? PHYS.superJumpScale : 1) - Math.abs(this.vx) / PHYS.jumpRunBonusDivisor;
        this.jumpCut = false;
        this.launched = true;  // the launch tick moves at full speed, no gravity yet
        if (this.superJump) audio.play('uppercut');
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.jumping = true;
        audio.play('jump');
        game.dust(this.cx, this.y + this.h, 4);
      } else if (this.character === 'spaz' && controlled && input.pressed('jump') && !this.onGround && this.coyote === 0 && !this.stomping) {
        // Spaz: one extra jump in the air instead of the copter ears.
        if (!this.doubleJumped) {
          this.doubleJumped = true;
          this.vy = PHYS.jumpBase * 0.85;
          this.jumping = true; this.jumpCut = false; this.launched = true;
          this.jumpBuffer = 0;
          audio.play('jump');
          game.ring(this.cx, this.y + this.h, '#ffffff');
        }
      } else if (controlled && input.pressed('jump') && !this.onGround && this.coyote === 0 && !this.stomping && this.vy > -PHYS.hoverEngage) {
        // Original copter: each press re-arms 70 ticks; it only engages near
        // the top of a jump or while falling.
        this.hovering = true;
        this.hoverLeft = PHYS.hoverTicks;
        this.jumpBuffer = 0;
      } else if (controlled && input.pressed('down') && !this.onGround && !this.stomping) {
        // Buttstomp: brief hang, then slam down.
        this.stomping = true;
        this.hovering = false;
        this.vx = 0;
        this.vy = -2;
        audio.play('stompStart');
      }
    }
    if (this.hovering && (!input.held('jump') || this.hoverLeft <= 0 || this.onGround)) this.hovering = false;

    // ---- vertical
    if (this.special > 0) {
      // velocity set above
    } else if (this.swimming) {
      // Original swimming: weak gravity, Up/Down (or Jump) push 1/8 px/tick²
      // up to 2 px/tick (doubled while running); Jump at the surface leaps out.
      const vdir = (input.held('down') ? 1 : 0) - (input.held('up') || input.held('jump') ? 1 : 0);
      let accel = 1024 / 65536;
      let cap = 2;
      if (vdir) { const k = this.dash > 0 ? 2 : 1; accel += 0.125 * k * vdir; cap *= k; }
      cap += Math.abs(accel);
      this.vy = Math.max(-cap, Math.min(cap, this.vy + accel));
      this.stomping = false; this.hovering = false;
      if (input.pressed('jump') && this.cy - level.water < 20) {
        this.vy = PHYS.jumpBase;
        this.jumping = true; this.jumpCut = false;
        this.swimming = false;
        audio.play('jump');
      }
    } else if (this.floatUp) {
      // Updraft: carried up to 8 px/tick (original float-up speed).
      this.vy = Math.max(this.vy - 0.5, -8);
      this.stomping = false;
    } else if (this.stomping) {
      this.vx = 0;
      this.vy = Math.min(this.vy + PHYS.stompAccel, PHYS.stompFall);
    } else if (this.hovering) {
      this.hoverLeft--;
      this.vy = this.vy >= 0
        ? Math.min(this.vy + PHYS.hoverFallGravity, PHYS.hoverMaxFall)
        : Math.min(this.vy + PHYS.hoverRiseDecel, 0);
      if (this.animTime % 4 === 0) game.trail(this.cx + (Math.random() * 8 - 4), this.y + this.h + 2, '#ffb02e');
    } else {
      // Original variable jump: releasing jump makes the rest of the rise
      // heavier (0.875, then 0.625 below 1 px/tick); the held rise is 0.375
      // and the fall a floaty 0.125.
      if (this.jumping && !this.superJump && this.vy < 0 && !input.held('jump')) this.jumpCut = true;
      if (this.launched) this.launched = false;
      else this.vy += this.vy < 0
        ? (this.jumpCut ? (this.vy < -1 ? PHYS.riseGravityCut : PHYS.riseGravityCutApex) : PHYS.riseGravity)
        : PHYS.fallGravity;
      this.vy = Math.min(this.vy, PHYS.maxFall);
    }
    audio.hover(this.hovering);

    this.collide(game);
    if (level.areas) this.areaPush(level);

    // ---- shooting. Measured timing: holding fire shoots every 35 ticks, but
    // releasing the button cuts the wait to 5 ticks, so tapping fires faster.
    if (input.released('shoot')) this.shotCooldown = Math.min(this.shotCooldown, PLAYER.tapDelay);
    if (controlled && !input.held('up') && input.held('shoot') && this.shotCooldown === 0 && !this.stomping) {
      this.shotCooldown = this.shotDelay;
      this.shootPose = 8;
      const spread = this.spreadAmmo > 0;
      if (spread) this.spreadAmmo--;
      game.fire(this, spread);
    }

    // ---- hazards
    if (level.touchesSpikes(this) && this.rush === 0) this.hurt(game, this.cx - this.facing, { spikes: true });
    if (this.y > level.pixelH + 64) game.killPlayer();
    if (this.rush > 0 && this.animTime % 2 === 0) game.rushTrail(this);

    // ---- animation
    const lookUp = controlled && this.onGround && input.held('up') && !dir;
    if (this.knock > 0) this.anim = 'hurt';
    else if (this.special > 0) this.anim = 'uppercut';
    else if (this.stomping) this.anim = 'stomp';
    else if (this.hovering) this.anim = 'hover';
    else if (!this.onGround) this.anim = this.vy < 0 ? 'jump' : 'fall';
    else if (this.skid > 0) this.anim = 'skid';
    else if (Math.abs(this.vx) > 0.4) this.anim = 'run';
    else if (crouching) this.anim = 'crouch';
    else if (lookUp) this.anim = 'look';
    else this.anim = this.shootPose > 0 ? 'shoot' : 'idle';
    this.idleTime = this.anim === 'idle' ? this.idleTime + 1 : 0;
  }

  // Tubes and vines (original JJ2 levels). Returns true when it moved Kip.
  jj2Move(game, input) {
    const level = game.level;
    this.swimming = level.water !== Infinity && this.cy > level.water;
    this.floatUp = level.areaAt(this.cx, this.cy) === EV.FLOAT_UP || level.areaAt(this.cx, this.y + this.h - 2) === EV.FLOAT_UP;
    // A tube carries Kip at its own speed, straight through its walls.
    if (level.areaAt(this.cx, this.cy) === EV.TUBE) {
      const [xs, ys] = eventFields(level.areaParam(this.cx, this.cy), [-7, -7]);
      if (xs || ys) {
        const tx = Math.floor(this.cx / TILE); const ty = Math.floor(this.cy / TILE);
        this.vx = xs; this.vy = ys;
        if (!xs) this.x += (tx * TILE + TILE / 2 - this.cx) * 0.5;
        if (!ys) this.y += (ty * TILE + TILE / 2 - this.cy) * 0.5;
        this.x += xs; this.y += ys;
        Object.assign(this, { inTube: 6, hang: null, hovering: false, stomping: false, onGround: false, jumping: false, special: 0 });
        game.audio.hover(false);
        this.anim = 'jump';
        return true;
      }
    }
    if (this.hang) return this.hangOn(game, input);
    if (this.hangCool === 0 && !this.onGround && this.inTube === 0) {
      // Hands reach HANG px above the body's top.
      const hy = this.y - HANG;
      const tx = Math.floor(this.cx / TILE); const ty = Math.floor(hy / TILE);
      const id = level.areaAt(this.cx, hy);
      if (id === EV.VINE || id === EV.HOOK) {
        const line = ty * TILE + (level.vineY.get(ty * level.w + tx) ?? 8);
        if (hy >= line - 8 && hy <= line + 12) {
          this.hang = { hook: id === EV.HOOK, line };
          this.y = line + HANG;
          Object.assign(this, { vx: 0, vy: 0, hovering: false, stomping: false, jumping: false, special: 0 });
          game.audio.hover(false);
          return this.hangOn(game, input);
        }
      }
    }
    return false;
  }

  // Hanging from a vine (move hand over hand) or a hook (stay put).
  hangOn(game, input) {
    const level = game.level;
    const h = this.hang;
    const release = (vy, cool) => { this.hang = null; this.hangCool = cool; this.vy = vy; };
    if (input.pressed('jump')) {
      release(PHYS.jumpBase, 12);
      this.y -= 4;
      this.jumping = true; this.jumpCut = false; this.launched = true;
      game.audio.play('jump');
      return false;
    }
    if (input.pressed('down')) { release(4, 8); this.y += 4; return false; }
    const dir = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    if (dir) this.facing = dir;
    let vx = 0;
    if (!h.hook && dir) {
      // Original: 2 px/tick along a vine, double with Run.
      const ahead = level.areaAt(this.cx + dir * (this.w / 2 + 2), h.line + 1);
      if (ahead === EV.VINE) vx = dir * (input.held('run') ? 4 : 2);
    }
    this.vx = vx; this.vy = 0;
    if (vx) level.move(this, vx, 0, {});
    this.y = h.line + HANG;
    if (level.areaAt(this.cx, h.line + 1) !== (h.hook ? EV.HOOK : EV.VINE)) release(0, 8);
    this.anim = 'hang';
    return true;
  }

  // Wind areas push Kip along; belts carry him while he stands on them.
  areaPush(level) {
    const force = (id, p) => {
      switch (id) {
        case EV.WIND_LEFT: return p > 127 ? -(256 - p) : p;
        case EV.WIND_RIGHT: return p;
        case EV.BELT_LEFT: return p === 0 ? -2 : p > 127 ? 256 - p : -p;
        case EV.BELT_RIGHT: return p === 0 ? 2 : p > 127 ? -(256 - p) : p;
        case EV.ACC_BELT_LEFT: return -1.5 * (p || 4);
        case EV.ACC_BELT_RIGHT: return 1.5 * (p || 4);
        default: return 0;
      }
    };
    const wind = level.areaAt(this.cx, this.cy);
    let push = wind === EV.WIND_LEFT || wind === EV.WIND_RIGHT ? force(wind, level.areaParam(this.cx, this.cy)) : 0;
    if (this.onGround) {
      const fy = this.y + this.h + 2;
      const belt = level.areaAt(this.cx, fy);
      if (belt >= EV.BELT_RIGHT && belt <= EV.ACC_BELT_LEFT) push += force(belt, level.areaParam(this.cx, fy));
    }
    if (push) level.move(this, Math.max(-8, Math.min(8, push)), 0, { climb: this.onGround });
  }

  grabPole(pole, game) {
    // Fling speed grows with the speed Kip arrives at (measured cap 20).
    const entry = Math.hypot(this.vx, this.vy);
    this.poleSpeed = Math.max(PHYS.poleMinFling, Math.min(PHYS.poleMaxFling, entry * 1.5 + 6));
    this.poleHold = Math.round(PHYS.poleHoldTicks - (this.poleSpeed - PHYS.poleMinFling) * 3);
    this.poleDir = Math.sign(this.vx) || this.facing;
    this.pole = pole;
    this.poleT = 0;
    this.vx = 0; this.vy = 0;
    this.hovering = false; this.jumping = false;
    game.audio.hover(false);
    game.audio.play('uppercutCharge');
  }

  // Spinning on a pole: steer with left/right, jump lets go early.
  swing(game, input) {
    const pole = this.pole;
    this.poleT++;
    const dir = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    if (dir) this.poleDir = dir;
    this.facing = this.poleDir;
    this.x = pole.px - this.w / 2;
    this.y = pole.py - this.h / 2;
    this.anim = 'pole';
    if (this.poleT < this.poleHold && !(this.poleT > 8 && input.pressed('jump'))) return;
    this.pole = null;
    this.poleCool = 24;
    this.jumpCut = false;
    if (pole.vertical) {
      this.vx = this.poleDir * 2;
      this.vy = -this.poleSpeed;
      this.y = pole.py - this.h - 4;
    } else {
      this.vx = this.poleDir * this.poleSpeed;
      this.vy = -3;
      this.x = pole.px + this.poleDir * 18 - this.w / 2;
    }
    this.springLock = 12;
    this.hoverLeft = PHYS.hoverTicks;
    this.onGround = false;
    game.audio.play('uppercut');
    game.ring(pole.px, pole.py, '#ffd54a');
  }

  fall(game) {
    this.vy = Math.min(this.vy + (this.vy < 0 ? PHYS.riseGravity : PHYS.fallGravity), PHYS.maxFall);
    this.collide(game);
  }

  collide(game) {
    const { level, audio } = game;
    const wasAir = !this.onGround;
    const impact = this.vy;
    const grounded = this.onGround;
    const vx = this.vx;
    // Original: speed is momentum; movement is capped at 8 px/tick (rising
    // too). A dash reads 16 but travels 8; the extra still boosts jumps.
    const cap = PHYS.moveCap * (this.rush > 0 ? PHYS.rushSpeedScale : 1);
    const dx = Math.max(-cap, Math.min(cap, this.vx));
    const dy = Math.max(-PHYS.moveCap, this.vy);
    const hit = level.move(this, dx, dy, { dropThrough: this.dropThrough > 0, climb: grounded });
    if (hit.left || hit.right) {
      // Speed blocks only give way to a full-speed run (or a sugar rush).
      const fast = Math.abs(vx) >= PHYS.moveCap * 0.95 || this.rush > 0;
      const tx = Math.floor((hit.right ? this.x + this.w + 1 : this.x - 1) / TILE);
      let broke = false;
      if (fast) {
        for (let ty = Math.floor(this.y / TILE); ty <= Math.floor((this.y + this.h - 1) / TILE); ty++) {
          if (level.at(tx, ty) === 'p' && game.hitTile(tx, ty, { speed: true })) broke = true;
        }
      }
      // A kick smashes blocks in its way.
      if (!broke && this.special >= KICK_WINDUP && this.windup === KICK_WINDUP) {
        for (let ty = Math.floor(this.y / TILE); ty <= Math.floor((this.y + this.h - 1) / TILE); ty++) {
          if (game.hitTile(tx, ty, { speed: true })) broke = true;
        }
      }
      this.vx = broke ? vx : 0;
    }
    if (hit.top) {
      // An uppercut or super jump smashes the blocks it runs into.
      const smash = (this.special > 0 || this.superJump) && game.breakAround(this.cx, this.y - 4);
      if (!smash) this.vy = Math.max(this.vy, 0.5);
    }
    this.onGround = hit.bottom;
    if (!this.onGround && grounded && this.vy >= 0 && this.dropThrough === 0) this.onGround = level.snapDown(this, this.vx);
    this.onSlope = hit.slope;
    if (this.onGround) {
      if (this.stomping) {
        this.stomping = false;
        if (game.breakAround(this.cx, this.y + this.h + 4)) {
          this.onGround = false;
          this.vy = 2;
          return;
        }
        audio.play('stompLand');
        game.shake(8);
        game.dust(this.cx, this.y + this.h, 14);
      } else if (wasAir && impact > 5) {
        audio.play('land');
        game.dust(this.cx, this.y + this.h, Math.min(10, Math.round(impact)));
      }
      this.vy = 0;
      this.jumping = false;
      this.jumpCut = false;
      this.superJump = false;
      this.hovering = false;
      this.hoverLeft = PHYS.hoverTicks;
      this.coyote = PHYS.coyoteTicks;
      this.doubleJumped = false;
    } else if (this.coyote > 0) {
      this.coyote--;
    }
  }

  // Measured knockback: vx = ±4, vy -= 4.
  hurt(game, fromX, { spikes = false } = {}) {
    if (this.invuln > 0 || this.dead || this.rush > 0) return;
    if (game.party) { game.party.hit(game, fromX); return; }
    if (this.shield > 0) {
      // Manual: a shield soaks the hit but loses 5 seconds.
      this.shield = Math.max(0, this.shield - PLAYER.shieldHitCost);
      this.invuln = 60;
      game.audio.play('hit');
      game.ring(this.cx, this.cy, '#ff9a3a');
      return;
    }
    this.health--;
    this.invuln = PHYS.hurtInvulnTicks;
    this.knock = 20;
    this.special = 0;
    this.pole = null;
    this.stomping = false;
    const away = this.cx < fromX ? -1 : 1;
    this.vx = away * PHYS.hurtKnockX;
    this.vy = Math.min(this.vy, 0) + PHYS.hurtKnockY + (spikes ? -5 : 0);
    this.hovering = false;
    this.onGround = false;
    game.audio.play('hurt');
    game.shake(6);
    game.flash('#ff2a4a', 6);
    if (this.health <= 0) game.killPlayer();
  }

  // Measured stomp bounce: vy = -8 - vy/2 with jump held, -4 - vy/2 without.
  bounce(jumpHeld) {
    const base = jumpHeld ? PHYS.stompBounceHeld : PHYS.stompBounce;
    this.vy = base - Math.min(this.vy, 12) / 2;
    this.jumping = jumpHeld;
    this.jumpCut = false;
    this.stomping = false;
    this.hoverLeft = PHYS.hoverTicks;
  }
}

// Accelerate toward `dir * max` without ever pushing past the cap. Speed that
// is already above the cap (e.g. after releasing run) bleeds off by `decel`.
function accelerate(vx, dir, accel, max, decel) {
  const along = vx * dir;
  if (along > max) return approach(vx, dir * max, decel);
  return dir * Math.min(along + accel, max);
}

function approach(value, target, step) {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}
