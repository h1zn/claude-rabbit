// Physics in pixels per tick. See SPEC.md for which values were measured from
// the reference game and which are tuned.

export const TICK_MS = 14;            // measured: one game tick is 14 ms (~71.4 Hz)
export const MAX_CATCHUP_TICKS = 35;  // measured: resync instead of running more than this
export const TILE = 32;               // measured
export const VIEW_W = 640;
export const VIEW_H = 360;

export const PHYS = {
  // Horizontal (original JJ2 values via Jazz2 Resurrection's measurements,
  // which agree with the IDA reads: 12000/24000 accel, 8000/28000 decel).
  walkAccel: 12000 / 65536,       // 0.183, input direction, ground and air alike
  runAccel: 24000 / 65536,        // 0.366 while the dash is active
  walkDecel: 8000 / 65536,        // 0.122 with no direction held
  dashDecel: 28000 / 65536,       // 0.427 with no direction held while dashing
  walkMax: 4.0,                   // walk speed cap
  runMax: 16.0,                   // dash speed cap (internal speed)
  moveCap: 8.0,                   // applied movement is clamped to 8 px/tick on both axes
  dashGrace: 16,                  // the dash outlives the Run key by 16 ticks, then snaps to walk speed
  // Vertical.
  riseGravity: 0.375,             // rising with jump held
  riseGravityCut: 0.875,          // rising after jump was released...
  riseGravityCutApex: 0.625,      // ...once the rise is slower than 1 px/tick
  fallGravity: 0.125,             // falling
  maxFall: 12.0,                  // fall speed cap
  jumpBase: -10.0,                // jump launch: vy = -(10 + |vx| / 4)
  jumpRunBonusDivisor: 4,
  hoverFallGravity: 512 / 65536,     // copter: 1/128 while falling
  hoverRiseDecel: 24576 / 65536,     // copter: 0.375 while still rising
  hoverMaxFall: 129 / 128,           // copter descent speed
  hoverTicks: 70,                    // original: each jump press re-arms 70 ticks of copter
  hoverEngage: 2.40625,              // original: the copter engages once rising slower than this
  stompBounceHeld: -8.0,             // measured: vy = -8 - vy/2
  stompBounce: -4.0,                 // measured: vy = -4 - vy/2
  hurtKnockX: 4.0,                   // measured
  hurtKnockY: -4.0,                  // measured
  hurtInvulnTicks: 105,              // tuned: 1.5 s
  springs: { red: -16.0, green: -24.0, blue: -32.0 },  // measured (about 8, 13 and 19 tiles high)
  springSide: 16.0,                  // measured: sideways red spring sets vx = 16
  poleHoldTicks: 70,                 // measured: a swinging pole holds Kip up to 70 ticks
  poleMaxFling: 20.0,                // measured: fling speed is capped at 20 px/tick
  poleMinFling: 10.0,                // tuned
  uppercutWindup: 16,                // measured: special move freezes 16 ticks
  uppercutEnd: 45,                   // measured: rises while tick <= 45
  stompAccel: 0.9,                   // tuned buttstomp wind-down
  stompFall: 10.0,                   // buttstomp speed 10 px/tick
  rushTicks: 1400,                   // measured: sugar rush lasts 1400 ticks (20 s)
  rushSpeedScale: 1.25,              // tuned
  fastFeetScale: 1.3,                // tuned: speed shoes (JJ2 "Fast Feet")...
  fastFeetTicks: 1050,               // ...for 15 s
  foodForRush: 100,                  // measured: every 100th food starts a rush
  superJumpScale: 1.39,              // manual: 60% higher (with the 8 px/tick rise cap)
  superJumpCoil: 10,                 // tuned: ticks crouched before it is ready
  specialStillSpeed: 0.5,            // crouched + Jump below this speed is the special move, above it the super jump
  coyoteTicks: 6,                    // tuned: grace after leaving a ledge
  // Measured 20 px on the original's wider body. Ours leaves ledges at a
  // different point (JJ2 levels: feet centre; our levels: whole body), so
  // 24 / 22 px reproduce the original's gaps: a 2-tile walk-off and a 5-tile
  // dash land, a 3-tile walk-off and a 6-tile dash fall short.
  landingTolerance: { jj2: 24, ours: 22 },
  stompEnemyBounce: -13.0,           // measured: a buttstomp leaves an enemy at a flat 13 px/tick
  stompDrift: 12000 / 65536,         // measured: sideways drift during a buttstomp (doubled with Run)
  doubleJump: -8.0,                  // measured: Spaz's double jump launch
  doubleJumpWindow: 30,              // measured: ticks after releasing jump that it stays available
  rfBlastSpeed: 8.0,                 // measured: an RF blast within 32 px throws the player at 8 px/tick...
  rfBlastTicks: 30,                  // ...held for 30 ticks
  rfBlastRise: -12.0,                // measured: rise when blasted in the air
  jumpBufferTicks: 6,                // tuned
};

export const CAMERA = {
  ease: 1 / 4,          // measured: camera closes 1/4 of the gap per tick
  walkLead: 28,         // original: leads 28 px while walking...
  dashLead: 120,        // ...and 120 px while dashing
  leadStep: 2,          // px per tick the lead moves toward its target
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
  fastfireStep: 3,     // measured: each Fastfire pickup cuts the fire delay by 3
  minShotDelay: 6,     // measured
  shieldTicks: 2100,   // measured: shields last 30 s
  shieldHitCost: 350,  // manual: each hit takes 5 s off the shield
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
  shotSpeed: 2.0,           // measured shooter projectile: 2 px/tick...
  shotAccel: 0.125,         // ...speeding up by 0.125 px/tick² along its line
  shotCooldown: 70,         // measured: 70 ticks between shots
  shooterRange: 224,        // measured 128; tuned up so shooters matter
};
