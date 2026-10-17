// Kip, the player. Movement follows SPEC.md: measured values for jump launch,
// variable jump, friction, hover, stomp bounce, knockback and the special-move
// (uppercut) timing; tuned gravity, caps and buttstomp speed.

import { PHYS, PLAYER, TILE } from './config.js';

export class Player {
  constructor(x, y) {
    this.w = PLAYER.w;
    this.h = PLAYER.h;
    this.spawn(x, y);
    this.health = PLAYER.maxHealth;
    this.spreadAmmo = 0;
  }

  spawn(x, y) {
    Object.assign(this, {
      x, y, prevX: x, prevY: y, vx: 0, vy: 0, facing: 1, onGround: false, onSlope: false,
      coyote: 0, jumpBuffer: 0, jumping: false, hovering: false, hoverLeft: PHYS.hoverTicks,
      invuln: 0, knock: 0, dropThrough: 0, shotCooldown: 0, shootPose: 0,
      stomping: false, special: 0, rush: 0, celebrate: false,
      dead: false, deadTimer: 0, anim: 'idle', animTime: 0, skid: 0, idleTime: 0,
    });
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  // True while Kip destroys whatever he touches.
  get attacking() { return this.rush > 0 || this.stomping || this.special > 0; }

  update(game, input) {
    const { level, audio } = game;
    this.prevX = this.x;
    this.prevY = this.y;
    this.animTime++;
    for (const k of ['invuln', 'knock', 'shotCooldown', 'shootPose', 'dropThrough', 'skid']) if (this[k] > 0) this[k]--;
    if (this.rush > 0 && --this.rush === 0) game.endRush();

    if (this.dead) {
      this.deadTimer++;
      this.vy = Math.min(this.vy + PHYS.gravity, PHYS.maxFall);
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

    const controlled = this.knock === 0 && this.special === 0;
    const dir = controlled ? (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0) : 0;
    const running = input.held('run') || this.rush > 0;
    const boost = this.rush > 0 ? PHYS.rushSpeedScale : 1;
    const accel = (running ? PHYS.runAccel : PHYS.walkAccel) * boost;
    const max = (running ? PHYS.runMax : PHYS.walkMax) * boost;
    const crouching = controlled && this.onGround && input.held('down') && !dir;
    if (dir) {
      if (this.onGround && Math.sign(this.vx) === -dir && Math.abs(this.vx) > 3) {
        this.skid = 10;
        if (this.animTime % 3 === 0) game.dust(this.cx, this.y + this.h, 1);
      }
      this.facing = dir;
    }

    // ---- horizontal
    if (this.onGround) {
      if (dir) {
        if (Math.sign(this.vx) === -dir) this.vx += dir * PHYS.groundFriction;
        this.vx = accelerate(this.vx, dir, accel, max, PHYS.groundFriction);
      } else {
        this.vx = approach(this.vx, 0, PHYS.groundFriction);
      }
    } else if (dir) {
      this.vx = accelerate(this.vx, dir, accel * PHYS.airAccelScale, max, accel * PHYS.airAccelScale);
    } else if (this.knock === 0) {
      this.vx *= PHYS.airDrag;
    }

    // ---- special: uppercut (hold Up + Shoot). Measured timing: 16-tick
    // wind-up, then rise with vy = (t - 256) * 2048 / 65536 until tick 45.
    if (this.special === 0 && this.knock === 0 && input.held('up') && input.pressed('shoot')) {
      this.special = 1;
      this.stomping = false;
      this.hovering = false;
      audio.play('uppercutCharge');
    }
    if (this.special > 0) {
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
    if (this.special === 0) {
      if (this.jumpBuffer > 0 && input.held('down') && onPlatform) {
        this.dropThrough = 10;
        this.jumpBuffer = 0;
        this.onGround = false;
      } else if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        // Measured: vy = jumpBase - |vx| / 4 (running jumps go higher).
        this.vy = PHYS.jumpBase - Math.abs(this.vx) / PHYS.jumpRunBonusDivisor;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.jumping = true;
        audio.play('jump');
        game.dust(this.cx, this.y + this.h, 4);
      } else if (controlled && input.pressed('jump') && !this.onGround && this.coyote === 0 && this.hoverLeft > 0 && !this.stomping) {
        this.hovering = true;
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
      // Measured variable jump: releasing while rising damps the climb.
      if (this.jumping && this.vy < 0 && !input.held('jump')) {
        const cut = PHYS.jumpCut.find((c) => this.vy < c.below);
        this.vy = cut ? this.vy + cut.add : 0;
      }
      this.vy = Math.min(this.vy + PHYS.gravity, PHYS.maxFall);
    }
    audio.hover(this.hovering);

    this.collide(game);

    // ---- shooting. Measured timing: holding fire shoots every 35 ticks, but
    // releasing the button cuts the wait to 5 ticks, so tapping fires faster.
    if (input.released('shoot')) this.shotCooldown = Math.min(this.shotCooldown, PLAYER.tapDelay);
    if (controlled && !input.held('up') && input.held('shoot') && this.shotCooldown === 0 && !this.stomping) {
      this.shotCooldown = PLAYER.shotDelay;
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

  fall(game) {
    this.vy = Math.min(this.vy + PHYS.gravity, PHYS.maxFall);
    this.collide(game);
  }

  collide(game) {
    const { level, audio } = game;
    const wasAir = !this.onGround;
    const impact = this.vy;
    const grounded = this.onGround;
    const hit = level.move(this, this.vx, this.vy, { dropThrough: this.dropThrough > 0, climb: grounded });
    if (hit.left || hit.right) this.vx = 0;
    if (hit.top) {
      // An uppercut or stomp breaks blocks it runs into.
      if (this.special > 0) game.breakAround(this.cx, this.y - 4);
      this.vy = Math.max(this.vy, 0.5);
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
      this.hovering = false;
      this.hoverLeft = PHYS.hoverTicks;
      this.coyote = PHYS.coyoteTicks;
    } else if (this.coyote > 0) {
      this.coyote--;
    }
  }

  // Measured knockback: vx = ±4, vy -= 4.
  hurt(game, fromX, { spikes = false } = {}) {
    if (this.invuln > 0 || this.dead || this.rush > 0) return;
    this.health--;
    this.invuln = PHYS.hurtInvulnTicks;
    this.knock = 20;
    this.special = 0;
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
