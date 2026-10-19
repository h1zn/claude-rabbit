// Kip, the player. Movement follows SPEC.md: measured values for jump launch,
// variable jump, friction, hover, stomp bounce, knockback and the special-move
// (uppercut) timing; tuned gravity, caps and buttstomp speed.

import { PHYS, PLAYER, TILE } from './config.js';
import { eventFields } from './jj2/files.js';
import { EV } from './jj2/level.js';
import { AMMO_MAX, fire, fireDelay, WEAPONS } from './weapons.js';

const HANG = 14;         // px from a vine down to the top of a hanging body
const KICK_WINDUP = 8;   // tuned: Spaz's and Lori's kicks
const KICK_END = 30;
// Airboard speeds (tuned): across, across holding Run, and up or down.
const BOARD = { walk: 5, run: 7, climb: 3 };

export class Player {
  constructor(x, y) {
    this.w = PLAYER.w;
    this.h = PLAYER.h;
    this.spawn(x, y);
    this.health = PLAYER.maxHealth;
    this.shotDelay = PLAYER.shotDelay;
    // Weapons 1-9 (src/weapons.js): the blaster never runs out.
    this.weapon = 1;
    this.ammo = new Array(WEAPONS.length).fill(0);
    this.powered = new Array(WEAPONS.length).fill(false);
    this.toast = 0;
  }

  // Ammo from a pickup or crate. Switches to the weapon when it is new and
  // only the blaster was in hand.
  addAmmo(n, amount) {
    const fresh = this.ammo[n] <= 0;
    this.ammo[n] = Math.min(AMMO_MAX, this.ammo[n] + amount);
    if (fresh && this.weapon === 1 && n !== 1) this.weapon = n;
  }

  // Next (dir 1) or previous (dir -1) weapon that has ammo.
  nextWeapon(dir = 1) {
    const count = WEAPONS.length - 1;
    for (let k = 1; k <= count; k++) {
      const n = ((this.weapon - 1 + dir * k + count * 2) % count) + 1;
      if (n === 1 || this.ammo[n] > 0) { this.weapon = n; this.weaponShown = 70; return; }
    }
  }

  selectWeapon(n) {
    if (n === 1 || this.ammo[n] > 0) { this.weapon = n; this.weaponShown = 70; return true; }
    return false;
  }

  spawn(x, y) {
    Object.assign(this, {
      x, y, prevX: x, prevY: y, vx: 0, vy: 0, facing: 1, onGround: false, onSlope: false,
      coyote: 0, jumpBuffer: 0, jumping: false, hovering: false, hoverLeft: PHYS.hoverTicks,
      invuln: 0, knock: 0, dropThrough: 0, shotCooldown: 0, shootPose: 0,
      stomping: false, special: 0, rush: 0, celebrate: false,
      pole: null, poleT: 0, poleCool: 0, springLock: 0, warpLock: null,
      crouchT: 0, superJump: false, shield: 0, shieldType: 'fire', pushing: 0, dash: 0, jumpCut: false,
      hang: null, hangCool: 0, board: false, swimming: false, floatUp: false, inTube: 0, doubleJumped: false, platform: null, launched: false,
      dead: false, deadTimer: 0, anim: 'idle', animTime: 0, skid: 0, idleTime: 0, weaponShown: 0, djWindow: 0, rfBlast: 0, rfDir: 0, dizzy: 0, aim: null, fastFeet: 0,
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
    for (const k of ['invuln', 'knock', 'shotCooldown', 'shootPose', 'dropThrough', 'skid', 'poleCool', 'springLock', 'hangCool', 'inTube', 'weaponShown', 'djWindow', 'rfBlast', 'dizzy', 'fastFeet']) if (this[k] > 0) this[k]--;
    if (this.rush > 0 && --this.rush === 0) game.endRush();
    if (this.shield > 0) this.shield--;
    if (this.pushing > 0) this.pushing--;

    if (this.dead) {
      this.deadTimer++;
      this.vy = Math.min(this.vy + PHYS.riseGravity, PHYS.maxFall);
      this.y += this.vy;
      this.anim = 'hurt';
      return;
    }
    if (input.pressed('weapon')) { this.nextWeapon(1); game.audio.play('weapon'); }
    for (let n = 1; n < WEAPONS.length; n++) {
      if (input.pressed(`w${n}`)) game.audio.play(this.selectWeapon(n) ? 'weapon' : 'denied');
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
    if (this.board && (this.swimming || this.hang || this.inTube)) this.loseBoard(game);

    const controlled = this.knock === 0 && this.special === 0 && this.springLock === 0;
    const dir = controlled ? (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0) : 0;
    // Dash: holding Run (or a sugar rush) keeps it active; it outlives the
    // key by 16 ticks and then the speed snaps straight back to walk speed.
    if (input.held('run') || this.rush > 0) this.dash = PHYS.dashGrace;
    else if (this.dash > 0 && --this.dash === 0 && Math.abs(this.vx) > PHYS.walkMax) this.vx = Math.sign(this.vx) * PHYS.walkMax;
    const dashing = this.dash > 0;
    const boost = this.rush > 0 ? PHYS.rushSpeedScale : this.fastFeet > 0 ? PHYS.fastFeetScale : 1;
    const accel = (dashing ? PHYS.runAccel : PHYS.walkAccel) * boost;
    const max = this.board ? (dashing ? BOARD.run : BOARD.walk) : this.swimming ? (dashing ? 4 : 2.5) : (dashing && !this.hovering ? PHYS.runMax : PHYS.walkMax) * boost;
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
    if (this.rfBlast > 0) {
      // Thrown by an RF blast: a flat speed held for its 30 ticks.
      this.vx = this.rfDir * PHYS.rfBlastSpeed;
    } else if (dir) {
      this.vx = accelerate(this.vx, dir, accel, max, PHYS.walkDecel);
    } else if (this.knock === 0 && this.springLock === 0) {
      this.vx = approach(this.vx, 0, dashing ? PHYS.dashDecel : PHYS.walkDecel);
    }

    // ---- special: uppercut (Jazz) or kick (Spaz, Lori). The original's
    // input: crouch first, standing still, then Jump (Down and Jump together,
    // or a crouch still sliding, give a jump instead). Measured timing:
    // 16-tick wind-up, then rise with vy = (t - 256) * 2048 / 65536 until tick 45.
    if (this.special === 0 && this.knock === 0 && controlled && this.onGround && !this.swimming && !this.board && input.pressed('jump')
      && this.crouchT >= PHYS.superJumpCoil && Math.abs(this.vx) < PHYS.specialStillSpeed
      && !level.platform(Math.floor(this.cx / TILE), Math.floor((this.y + this.h + 1) / TILE))) {   // one-way: drop through instead
      this.special = 1;
      this.stomping = false;
      this.hovering = false;
      this.jumpBuffer = 0;
      this.crouchT = 0;
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
    // Original: Spaz's double jump is open for 30 ticks after jump is let go.
    if (input.released('jump') && !this.onGround) this.djWindow = PHYS.doubleJumpWindow;
    if (this.springDj && this.vy >= 0) { this.springDj = false; this.djWindow = PHYS.doubleJumpWindow; }
    if (this.onGround) this.springDj = false;
    if (controlled && this.special === 0 && input.pressed('jump')) this.jumpBuffer = PHYS.jumpBufferTicks;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.surfaceGrace > 0 && !this.swimming) this.surfaceGrace--;
    const onPlatform = this.onGround && level.platform(Math.floor(this.cx / TILE), Math.floor((this.y + this.h + 1) / TILE));
    if (this.special === 0 && !this.swimming && !this.board) {
      if (this.jumpBuffer > 0 && input.held('down') && onPlatform) {
        this.dropThrough = 10;
        this.jumpBuffer = 0;
        this.onGround = false;
      } else if (controlled && input.pressed('jump') && this.surfaceGrace > 0 && !this.onGround) {
        // Bobbing just above the surface still counts as at the surface.
        this.surfaceLeap(audio);
      } else if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        // Measured: vy = jumpBase - |vx| / 4 (running jumps go higher). From a
        // full crouch it is a super jump (manual: 60% higher, smashes blocks).
        // A crouched jump while still sliding is the super jump.
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
      } else if (this.character === 'spaz' && controlled && input.pressed('jump') && !this.onGround && this.coyote === 0 && !this.stomping && !this.launched) {
        // Spaz: one extra jump in the air instead of the copter ears
        // (measured: a straight 8 px/tick launch, within the window).
        if (!this.doubleJumped && this.djWindow > 0) {
          this.doubleJumped = true;
          this.vy = PHYS.doubleJump;
          this.jumping = true; this.jumpCut = false; this.launched = true;
          this.jumpBuffer = 0;
          audio.play('jump');
          game.ring(this.cx, this.y + this.h, '#ffffff');
        }
      } else if (controlled && input.pressed('jump') && !this.onGround && this.coyote === 0 && !this.stomping && !this.launched && this.vy > -PHYS.hoverEngage) {
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
    } else if (this.board) {
      // Airboard: UP (or JUMP) rises, DOWN sinks, nothing held hovers with
      // a gentle bob.
      const vdir = controlled ? (input.held('down') ? 1 : 0) - (input.held('up') || input.held('jump') ? 1 : 0) : 0;
      const target = vdir ? vdir * BOARD.climb : Math.sin(this.animTime / 14) * 0.35;
      this.vy = approach(this.vy, target, vdir ? 0.25 : 0.12);
      this.hovering = false; this.stomping = false; this.jumping = false;
      if (this.animTime % 3 === 0) game.trail(this.cx + (Math.random() * 10 - 5), this.y + this.h + 3, '#ffb02e');
    } else if (this.swimming) {
      // Original swimming: weak gravity, Up/Down (or Jump) push 1/8 px/tick²
      // up to 2 px/tick (doubled while running); Jump at the surface leaps out.
      const vdir = (input.held('down') ? 1 : 0) - (input.held('up') || input.held('jump') ? 1 : 0);
      let accel = 1024 / 65536;
      let cap = 2;
      if (vdir) { const k = this.dash > 0 ? 2 : 1; accel += 0.125 * k * vdir; cap *= k; }
      cap += Math.abs(accel);
      this.vy = Math.max(-cap, Math.min(cap, this.vy + accel));
      this.stomping = false; this.hovering = false; this.jumping = false;
      // Near the surface: of the water line, or the top of a water block.
      const surf = level.areaAt(this.cx, this.cy) === EV.WATER_BLOCK
        ? level.areaAt(this.cx, this.cy - 20) !== EV.WATER_BLOCK
        : this.cy - level.water < 20;
      if (surf) this.surfaceGrace = 10;
      if (input.pressed('jump') && surf) this.surfaceLeap(audio);
    } else if (this.floatUp) {
      // Updraft: carried up to 8 px/tick (original float-up speed).
      this.vy = Math.max(this.vy - 0.5, -8);
      this.stomping = false;
    } else if (this.stomping) {
      // Measured: a stomp drops its speed, then drifts at a flat rate the way
      // you hold (doubled with Run), through the pause and the descent.
      const drift = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
      this.vx = drift * PHYS.stompDrift * (input.held('run') ? 2 : 1);
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
    // Only the gravity branch spends the launch tick; any other mode ends it.
    if (this.special > 0 || this.swimming || this.floatUp || this.stomping || this.hovering) this.launched = false;

    this.collide(game);
    if (level.areas) this.areaPush(level);

    // ---- shooting. Measured timing: holding fire shoots every 35 ticks, but
    // releasing the button cuts the wait to 5 ticks, so tapping fires faster.
    if (input.released('shoot')) this.shotCooldown = Math.min(this.shotCooldown, PLAYER.tapDelay);
    if (controlled && input.held('shoot') && this.shotCooldown === 0 && !this.stomping) {
      if (this.weapon !== 1 && this.ammo[this.weapon] <= 0) this.nextWeapon(-1);
      this.shotCooldown = fireDelay(this);
      this.shootPose = 8;
      // Up aims: straight up standing still (or in the air with no direction
      // held), diagonally up while moving.
      const still = this.onGround ? Math.abs(this.vx) < 0.5 && !dir : !dir;
      this.aim = input.held('up') ? (still ? 'up' : 'diag') : null;
      // A party item held is used instead of a shot.
      if (!(game.party && game.party.items.use(game))) fire(game, this);
    }

    // ---- hazards
    if (level.touchesSpikes(this) && this.rush === 0) this.hurt(game, this.cx - this.facing, { spikes: true });
    if (this.y > level.pixelH + 64) game.killPlayer();
    if (this.rush > 0 && this.animTime % 2 === 0) game.rushTrail(this);

    // ---- animation
    const lookUp = controlled && this.onGround && input.held('up') && !dir;
    if (this.knock > 0) this.anim = 'hurt';
    else if (this.board) this.anim = 'airboard';
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
    // Standing at a ledge with nothing under the middle of the body: teeter
    // (the wobble animation; Jazz says so once in a while).
    const feet = this.y + this.h;
    const tx = Math.floor(this.cx / TILE); const ty = Math.floor((feet + 3) / TILE);
    const edge = this.anim === 'idle' && !this.platform && !this.onSlope && !level.solidAt(this.cx, feet + 3)
      && !(level.platform && level.platform(tx, ty)) && !(level.slopeSurface && level.slopeSurface(this.cx, ty) !== null);
    if (edge && !this.teeter && game.levelTime - (this.teeterSaid || -9999) > 420) { this.teeterSaid = game.levelTime; game.voice('jazzBalance'); }
    this.teeter = edge;
  }

  // Tubes and vines (original JJ2 levels). Returns true when it moved Kip.
  jj2Move(game, input) {
    const level = game.level;
    // In water, unless leaping out of it.
    this.swimming = ((level.water !== Infinity && this.cy > level.water) || level.areaAt(this.cx, this.cy) === EV.WATER_BLOCK)
      && !(this.jumping && this.vy < -3);
    this.floatUp = level.areaAt(this.cx, this.cy) === EV.FLOAT_UP || level.areaAt(this.cx, this.y + this.h - 2) === EV.FLOAT_UP;
    // A tube carries Kip at its own speed, straight through its walls.
    if (level.areaAt(this.cx, this.cy) === EV.TUBE) {
      let [xs, ys] = eventFields(level.areaParam(this.cx, this.cy), [-7, -7]);
      // Original: a tube cell with no speed keeps the speed Kip entered with
      // (story levels ride long zero-speed columns past their text).
      if (!xs && !ys && this.inTube > 0) { xs = this.vx; ys = this.vy; }
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
          this.doubleJumped = false;
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
      this.jumping = true; this.jumpCut = false; this.launched = true; this.superJump = false;
      game.audio.play('jump');
      return false;
    }
    if (input.pressed('down')) { release(4, 8); this.y += 4; this.anim = 'fall'; return true; }
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
    this.hang = null;
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

  // Jump at the water's surface: leap out.
  surfaceLeap(audio) {
    this.vy = PHYS.jumpBase;
    this.jumping = true; this.jumpCut = false;
    this.swimming = false;
    this.surfaceGrace = 0; this.jumpBuffer = 0;
    audio.play('jump');
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
    this.superJump = false;
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
    const cap = PHYS.moveCap * (this.rush > 0 ? PHYS.rushSpeedScale : this.fastFeet > 0 ? PHYS.fastFeetScale : 1);
    const dx = Math.max(-cap, Math.min(cap, this.vx));
    const dy = Math.max(-PHYS.moveCap, this.vy);
    // Original landing allowance: coming down onto a ledge up to 20 px above
    // the feet still lands on top of it (a real descent only, not the apex).
    const land = !grounded && this.vy > 0.5 ? PHYS.landingTolerance[level.jj2 ? 'jj2' : 'ours'] : 0;
    const hit = level.move(this, dx, dy, { dropThrough: this.dropThrough > 0, climb: grounded, land });
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
    if (!this.onGround && grounded && this.vy >= 0 && this.dropThrough === 0 && !this.platform) this.onGround = level.snapDown(this, this.vx);
    // Riding a moving platform: gravity's pull below its top doesn't unground.
    if (!this.onGround && this.platform && this.vy >= 0) { this.y = this.platform.y - this.h; this.vy = 0; this.onGround = true; }
    this.onSlope = hit.slope;
    // Walking off a ledge opens Spaz's double jump as a released jump would.
    if (grounded && !this.onGround && !this.jumping && this.vy >= 0) this.djWindow = PHYS.doubleJumpWindow;
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
    if (this.pole) this.poleCool = 24;
    this.pole = null;
    if (this.hang) { this.hang = null; this.hangCool = 20; }
    this.stomping = false;
    const away = this.cx < fromX ? -1 : 1;
    this.vx = away * PHYS.hurtKnockX;
    this.vy = Math.min(this.vy, 0) + PHYS.hurtKnockY + (spikes ? -5 : 0);
    this.hovering = false;
    this.onGround = false;
    // Jazz cries out (and warns on his last heart); the others get the hit sound.
    if (this.character === 'jazz') game.audio.play(this.health === 1 ? 'jazzLookOut' : 'jazzHurt');
    else game.audio.play('hurt');
    game.shake(6);
    game.flash('#ff2a4a', 6);
    if (this.health <= 0) game.killPlayer();
    this.loseBoard(game);
  }

  // The airboard: picked up, and lost again to a hit or water.
  mountBoard(game) {
    Object.assign(this, { board: true, hovering: false, stomping: false, special: 0, jumping: false });
    this.vy = Math.min(this.vy, -1);
    game.audio.play('spring');
    game.banner('AIRBOARD!', 50);
  }

  loseBoard(game) {
    if (!this.board) return;
    this.board = false;
    game.effect('poof', this.cx, this.y + this.h);
    game.audio.play('bounce');
  }

  // Measured: a buttstomp leaves an enemy at a flat 13 px/tick, its rise
  // decaying at the released rate whatever the jump key does.
  stompBounce() {
    this.vy = PHYS.stompEnemyBounce;
    this.superJump = false;
    this.jumping = true;
    this.jumpCut = true;
    this.stomping = false;
    this.hoverLeft = PHYS.hoverTicks;
  }

  // An RF blast within 36 px throws the player away (measured: 8 px/tick for
  // 30 ticks; in the air also up at 12, on the ground a little, growing with range).
  blast(dir, dist) {
    this.rfDir = dir; this.rfBlast = PHYS.rfBlastTicks;
    this.vy = this.onGround ? -(0.646 + 0.1732 * dist) : PHYS.rfBlastRise;
    this.onGround = false;
    this.jumping = true; this.jumpCut = true; this.stomping = false; this.superJump = false;
  }

  // Measured stomp bounce: vy = -8 - vy/2 with jump held, -4 - vy/2 without.
  bounce(jumpHeld) {
    const base = jumpHeld ? PHYS.stompBounceHeld : PHYS.stompBounce;
    this.vy = base - Math.min(this.vy, 12) / 2;
    this.superJump = false;
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
