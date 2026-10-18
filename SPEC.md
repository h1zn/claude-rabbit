# Mechanics spec

This prototype is an **original** fast-platformer. Its *feel* is based on
gameplay mechanics measured from a legitimately owned copy of a 1999 platformer
(Jazz Jackrabbit 2: Christmas Chronicles '99, `Jazz2.exe`) in IDA Pro.

Mechanics come from IDA and from the game's manual (`new/Jazz_Jackrabbit_2_Manual.pdf`,
English section pp. 11-18). Sprites and tilesets are cut from sprite sheets the
project owner supplied (`new/`), sound effects are JJ2 samples (`assets/sfx/`) and
music comes from `Soundtracks/` and the levels' tracker files, all for personal
use. The built-in levels and the code are this project's own.

## How the numbers were found

The original stores physics in 16.16 fixed point (`0x10000` = 1.0 pixel), one
step per *game tick*. Values below are converted to pixels per tick.

| Mechanic | Value | Where it was found | Status |
| --- | --- | --- | --- |
| Tick rate | 1 tick = 14 ms (~71.4 Hz) | timer: `timeGetTime() / 14` (`sub_48DE60`) | measured |
| Fixed-step loop | one physics step per elapsed tick, resync if >35 behind | main loop `sub_43F5D0` | measured |
| Tile size | 32 px | position / `0x200000` = tile index | measured |
| Jump launch | `vy = -(10 + abs(vx) / 4)`; the launch tick moves at full speed | `sub_435800`, `sub_42F5D0`; Jazz2 Resurrection | measured |
| Rise gravity | 0.375 with jump held; after release 0.875, then 0.625 once rising slower than 1 px/tick | Jazz2 Resurrection | measured |
| Fall gravity | 0.125 (the floaty JJ2 fall) | Jazz2 Resurrection | measured |
| Movement cap | applied movement is clamped to 8 px/tick on both axes (speed above it is momentum) | Jazz2 Resurrection | measured |
| Walk / dash | caps 4 / 16 (internal); accel 0.183 / 0.366 in the input direction, ground and air alike | `sub_435800` (12000 / 24000); Jazz2 Resurrection | measured |
| Dash grace | the dash outlives the Run key by 16 ticks, then speed snaps to walk speed | Jazz2 Resurrection | measured |
| Coasting decel | 0.122 walk / 0.427 dash with no direction held | `sub_435800` (8000 / 28000) | measured |
| Copter (hover) | each press re-arms 70 ticks; engages once rising slower than 2.4; descends at 129/128 px/tick (wind-up 1/128); horizontal speed capped at walk speed | `sub_435800`; Jazz2 Resurrection | measured |
| Camera | eases 1/4 of the distance per tick; leads 28 px walking, 120 px dashing; drops 60 px for a butt-stomp | `sub_43E440`; Jazz2 Resurrection | measured |
| Terminal fall speed | 12.0 px/tick | player update | measured |
| Springs | red -16, green -24, blue -32 (about 8, 13 and 19 tiles with the rise cap) | `sub_404430` | measured |
| Butt-stomp speed | 10 px/tick | Jazz2 Resurrection | measured |
| Butt-stomp drift | a flat 12000/65536 px/tick sideways while held (doubled with Run), through the pause and the descent | Jazz2 Resurrection | measured |
| Butt-stomp enemy bounce | a flat 13 px/tick, rising at the released rate (0.875) even with jump held | Jazz2 Resurrection | measured |
| Landing allowance | a ledge up to 20 px above falling feet is landed on (the original clears a 2-tile walk-off and a 5-tile dash, not a 3-tile walk or a 6-tile dash); 24 px in JJ2 levels and 22 in ours reproduce that with our narrower feet | Jazz2 Resurrection | measured / fitted |
| Spaz double jump | a straight 8 px/tick launch, open for 30 ticks after jump is released; a spring hands it back for when its rise is over | Jazz2 Resurrection | measured |
| Uppercut | -7.5 px/tick decaying by 0.03125 a tick for 30 ticks | Jazz2 Resurrection | measured |
| RF blast | an RF missile going off within ~36 px throws the player away at 8 px/tick for 30 ticks (in the air also up at 12) | Jazz2 Resurrection | measured |

Measured in game with these values: standing jump 4.1 tiles, running jump 6.7
tiles high and about 19 across, super jump 6.7. Checked against the original's
traces as documented in Jazz2 Resurrection: a held standing jump rises 132 px
(original 132), a jump released on tick 5 rises 77.1 px (original 77.1), and
Spaz's double jump adds 84 px (original about 80). Falling is not capped by
the 8 px/tick movement cap, only rising and running are, so terminal speed is
the full 12 px/tick, as in the original. Jazz2 Resurrection
(github.com/deathkiller/jazz2-native, `Player.h`) documents the original's
per-tick values from traces of the real game; they agree with the IDA reads
where both exist.

## First prototype scope

What the first loop built; the game has grown well past it (see README.md and
EXPERIMENT.md).

- Fixed 71.4 Hz simulation with interpolated rendering.
- Run, walk, variable-height jump with running bonus, hover boots, stomp,
  blaster, hurt knockback and invincibility.
- 32 px tile world with solid blocks, one-way platforms, springs, spikes,
  checkpoints and an exit.
- Enemies: walker, hopper, flyer. Pickups: gems, health berries, ammo.
- Sprite-sheet art, JJ2 sound samples and recorded or tracker music (the
  first prototype's procedural art and synthesized sounds remain as fallbacks).

## World rules (loop 3)

Found by dumping the object table. Each level object (event) gets a 128-byte
record filled in at startup by `sub_41A9B0`, `sub_41D8F0` and `sub_419EC0`.
Records start at `0x5F6D40` (record = base + id * 0x80). Useful fields: `+0x00`
behaviour routine, `+0x14` start x-speed, `+0x3E` hit points, `+0x42` points.
Only rules and numbers are used here; no art, names or level data.

### Scoring and pickups (`sub_439B00`, the player/object interaction)

| Thing | Value | Status |
| --- | --- | --- |
| Gem points | red 100, green 500, blue 1000 | measured |
| Gem count value | red 1, green 5, blue 10 | measured |
| Coin | silver: 1 coin, 500 pts; gold: 5 coins, 1000 pts | measured |
| Food | 42 kinds, 50 pts each, +1 food counter | measured |
| Sugar rush | every 100th food; lasts 1400 ticks (20 s); can't be hurt; kills on touch; HUD shows a seconds countdown that blinks in the last 140 ticks | measured |
| Carrot (health) | +1 heart (max 5) and 70 ticks of invulnerability; full carrot: full health and 350 ticks | measured |
| Extra life | +1 life | measured |
| Invincibility pickup | 1050 ticks | measured |
| Shields | 2100 ticks (30 s) | measured |
| Crates / barrels | broken only by an attack (shot, stomp, special); stomping one bounces the player `vy = -4 - vy/2`; 300 pts for ammo crates | measured |
| Ammo pickup | +3 ammo (cap 99); weapon power-up crate +25 | measured |
| End-of-level sign | spins faster the faster the player is moving when within 64 px; 1000 pts | measured (`sub_4108F0`) |
| Springs | set player `vy` to -16 / -24 / -32 (red/green/blue); sideways springs set `vx` to 16/24/32 | measured (`sub_404430`) |

### Weapons (`sub_419EC0` records, `sub_435800` fire timing)

| Thing | Value | Status |
| --- | --- | --- |
| Fire delay while holding | 35 ticks (0.5 s) | measured (player init `+0x13C = 35`) |
| Tap fire | releasing the button sets the counter to `delay - 5`, so tapping can fire again 5 ticks later | measured |
| Fast-fire pickup | delay -3 per pickup, minimum 6 | measured |
| Blaster shot | 6 px/tick, +0.125 px/tick² along its direction, 35-tick life, 1 damage | measured |
| Powered blaster | 7 px/tick, +0.1875, 30-tick life, 2 damage | measured |
| Bouncer | 5 px/tick, 105-tick life | measured |
| Seeker | 2 px/tick, homing, 140-tick life, 2 damage | measured |
| Ice, RF, toaster, TNT, pepper, electro | speeds, lives and damage in `src/weapons.js` follow the manual's descriptions (frostbiter freezes 210 ticks, 350 powered; TNT 72 px blast, 280-tick fuse) | tuned |

### Enemies (behaviour routines named by address)

| Thing | Value | Status |
| --- | --- | --- |
| Object gravity | 0.125 px/tick² (`dword_5F3700 = 0x2000`, set in `sub_41E510`) | measured |
| Walker caps | x ±6, falling ≤ 4 px/tick; underwater: a quarter of the acceleration, half the caps | measured (`sub_4011E0`) |
| Basic walker | 1 px/tick; turns at walls *and* ledges; animation frame every 8 ticks; 1 HP, 100 pts | measured |
| Lurching walker | speed = `(sin(phase) + 1) / 2` px/tick; lunges `vx = 3*dir, vy = -4` when the player is within 96 px | measured (`sub_40B710`, `sub_40C5E0`) |
| Chasing flier | within 256 px, steers toward the player at 0.0625 px/tick² per axis; top speed = difficulty + 2 (3 on normal) | measured (`sub_413D80`, `sub_40B390`) |
| Hover-and-dive flier | hangs about 64 px above the player with a sine bob, then dives at difficulty + 4 | measured (`sub_40D0F0`, `sub_410310`) |
| Hopper | within 362 px hops toward the player: small hop `vy = -2`, big hop `vy = -5` when close | measured (`sub_40C130`) |
| Shooter | projectile 2 px/tick + 0.125 px/tick², fires when the player is within 128 px, 70-tick cooldown | measured (`sub_4071F0`) |
| Hit points and points | regular 1–4 HP, 100–500 pts; bosses 100–120 HP, 2000–10000 pts | measured |
| Detection range | `sub_42AAF0(obj, r²)` finds the nearest player within a squared pixel distance | measured |
| Frozen state | every enemy has one (ice weapon) | measured |

### Environment

- Dark levels use a lighting grid of 8 px cells, brightened around the player
  and objects (`sub_463A20`, `sub_463C50`). The clone lights its caves the same
  way, with its own renderer.
- Background layer speeds are stored per level in the level files, not in the
  exe, so they are **not** measured; the clone's parallax speeds are its own.

## Level objects and rules (loop 4)

From IDA (the level event handlers) and the manual.

| Thing | Value | Source |
| --- | --- | --- |
| Swinging pole | holds the player up to 70 ticks, then flings at up to 20 px/tick | IDA |
| Warp | can cost coins; when short it shows "x N", the coins still needed | IDA |
| Coin Warp | warps to a bonus area once you have enough coins | IDA, manual |
| Exit | reach the exit sign; some exits are guarded by a boss | manual |
| Gems | end-of-level bonus and extra lives (the clone: one per 100 gems) | manual (the 100 is tuned) |
| Super jump | from a full crouch, 60% higher (launch x1.39 with the rise cap); smashes blocks above | manual |
| Blast / countdown / speed / butt-stomp blocks | shoot / shoot N times / run through at full speed / butt-stomp | manual |
| Switch blocks | breaking a switch crate removes solid switch blocks and makes ghost ones solid | manual |
| Fastfire | each one cuts the fire delay by 3 ticks, down to 6 | IDA |
| Shields | last 2100 ticks (30 s); each hit takes 5 s off instead of a heart | IDA, manual |
| Super carrot | full health, 350 ticks of invulnerability | IDA |

## Shooters (loop 5)

| Thing | Value | Status |
| --- | --- | --- |
| Projectile | 2 px/tick, +0.125 px/tick² along its line | measured (`sub_4071F0`) |
| Cooldown | 70 ticks | measured |
| Range | measured 128 px; the clone uses 224 so shooters matter | tuned |
| Bomb lizard | lobs a bomb that bounces once and explodes (44 px radius) | clone design |
