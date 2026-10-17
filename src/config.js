// Physics in pixels per tick. See SPEC.md for which values were measured from
// the reference game and which are tuned.

export const TICK_MS = 14;            // measured: one game tick is 14 ms (~71.4 Hz)
export const MAX_CATCHUP_TICKS = 35;  // measured: resync instead of running more than this
export const TILE = 32;               // measured
export const VIEW_W = 640;
export const VIEW_H = 360;

export const PHYS = {
  walkAccel: 12000 / 65536,       // measured 0.183
  runAccel: 24000 / 65536,        // measured 0.366
  walkMax: 4.0,                   // tuned
  runMax: 8.0,                    // tuned
  groundFriction: 16000 / 65536,  // measured 0.244 per tick toward zero
  airDrag: 31 / 32,               // measured coasting factor
  airAccelScale: 0.6,             // tuned: air control relative to ground
  gravity: 0.30,                  // tuned (see SPEC.md)
  maxFall: 10.0,                  // tuned
  jumpBase: -10.0,                // measured (-655360 / 65536)
  jumpRunBonusDivisor: 4,         // measured: vy = jumpBase - |vx| / 4
  // Measured variable-jump damping when the button is released while rising.
  jumpCut: [
    { below: -1.0, add: 0.5 },
    { below: -0.25, add: 0.25 },
  ],
  hoverFallGravity: 512 / 65536,     // measured
  hoverRiseDecel: 24576 / 65536,     // measured
  hoverMaxFall: 1.0,                 // measured
  hoverTicks: 140,                   // tuned: 2 s of hover per airtime
  stompBounceHeld: -8.0,             // measured: vy = -8 - vy/2
  stompBounce: -4.0,                 // measured: vy = -4 - vy/2
  hurtKnockX: 4.0,                   // measured
  hurtKnockY: -4.0,                  // measured
  hurtInvulnTicks: 105,              // tuned: 1.5 s
  springLaunch: -16.0,               // measured: red spring sets vy = -16
  uppercutWindup: 16,                // measured: special move freezes 16 ticks
  uppercutEnd: 45,                   // measured: rises while tick <= 45
  stompAccel: 0.9,                   // tuned buttstomp
  stompFall: 12.0,                   // tuned buttstomp speed
  rushTicks: 1400,                   // measured: sugar rush lasts 1400 ticks (20 s)
  rushSpeedScale: 1.3,               // tuned
  foodForRush: 100,                  // measured: every 100th food starts a rush
  coyoteTicks: 6,                    // tuned: grace after leaving a ledge
  jumpBufferTicks: 6,                // tuned
};

export const CAMERA = {
  ease: 1 / 4,          // measured: camera closes 1/4 of the gap per tick
  lookAhead: 14,        // tuned: px of look-ahead per px/tick of speed
  maxLookAhead: 110,
  verticalBias: -24,
};

export const PLAYER = {
  w: 18,
  h: 38,
  maxHealth: 5,
  shotDelay: 35,       // measured: one shot per 35 ticks while fire is held
  tapDelay: 5,         // measured: releasing fire lets a tap refire 5 ticks later
  shotSpeed: 6,        // measured blaster speed (plus the player's own speed)
  shotAccel: 0.125,    // measured: shots speed up along their direction
  shotLife: 35,        // measured
  carrotInvuln: 70,    // measured: invulnerability after eating a carrot
};

// Enemy physics, measured (see SPEC.md "World rules").
export const ENEMY = {
  gravity: 0x2000 / 65536,  // 0.125
  maxFall: 4.0,
  chaseRange: 256,
  chaseAccel: 4096 / 65536, // 0.0625 per axis
  chaseMax: 3.0,            // difficulty (normal = 1) + 2
  lungeRange: 96,
  lungeVx: 3.0,
  lungeVy: -4.0,
  lungeCooldown: 140,
  hopRange: 362,
  hopCloseRange: 160,
  hopSmall: -2.0,
  hopBig: -5.0,
};
