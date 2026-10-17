# Mechanics spec

This prototype is an **original** fast-platformer. Its *feel* is based on
gameplay mechanics measured from a legitimately owned copy of a 1999 platformer
(Jazz Jackrabbit 2: Christmas Chronicles '99, `Jazz2.exe`) in IDA Pro.

Game mechanics (speeds, timings, rules) are not copyrightable expression. Nothing
else was taken: **no art, sprites, tiles, sounds, music, levels, text, names or
code** from the original are used. All assets in this project are made from
scratch, procedurally, in code. The hero, enemies, world and title are original.

## How the numbers were found

The original stores physics in 16.16 fixed point (`0x10000` = 1.0 pixel), one
step per *game tick*. Values below are converted to pixels per tick.

| Mechanic | Value | Where it was found | Status |
| --- | --- | --- | --- |
| Tick rate | 1 tick = 14 ms (~71.4 Hz) | timer: `timeGetTime() / 14` (`sub_48DE60`) | measured |
| Fixed-step loop | one physics step per elapsed tick, resync if >35 behind | main loop `sub_43F5D0` | measured |
| Tile size | 32 px | position / `0x200000` = tile index | measured |
| Jump launch | `vy = -10.0 - abs(vx) / 4` | player update `sub_435800`; default `-655360` set in player init `sub_42F5D0` | measured |
| Variable jump (button released while rising) | if `vy < -1.0`: `vy += 0.5`; else if `vy < -0.25`: `vy += 0.25`; else `vy = 0` | `sub_435800` | measured |
| Ground friction (no input) | speed moves toward 0 by 0.244 px/tick each tick | `sub_435800` (16000) | measured |
| Walk acceleration | 0.183 px/tick² | `sub_435800` (12000) | measured |
| Run acceleration (run held) | 0.366 px/tick² | `sub_435800` (24000) | measured |
| Coasting decel | 0.122 walk / 0.427 run, and speed × 31/32 per tick | `sub_435800` (8000 / 28000) | measured |
| Hover (slow-fall ability) | gravity 0.0078 while falling, 0.375 while rising, fall speed capped at 1.0 | `sub_435800` copter branch | measured |
| Stomp bounce off an enemy | `vy = -8 - vy / 2` (jump held) or `-4 - vy / 2` | interaction `sub_439B00` | measured |
| Hurt knockback | `vx = ±4.0`, `vy -= 4.0` | `sub_4305A0` | measured |
| Power-up timers | 2100 / 1050 ticks (30 s / 15 s) | `sub_439B00` | measured |
| Camera | eases 1/4 of the distance per tick, with a look-ahead in the run direction | camera `sub_43E440` | measured |
| Gravity | 0.30 px/tick² | not located (applied through pointer-relative code) | **tuned** to give a ~5-tile standing jump |
| Ground speed caps | 4.0 walk / 8.0 run | caps of 2 / 4 were found only in the free-move branch | **tuned** for the fast feel |
| Terminal fall speed | 10.0 px/tick | not located | **tuned** |
| Spring launch | -15.0 px/tick | not located | **tuned** |

## Prototype scope

- Fixed 71.4 Hz simulation with interpolated rendering.
- Run, walk, variable-height jump with running bonus, hover boots, stomp,
  blaster, hurt knockback and invincibility.
- 32 px tile world with solid blocks, one-way platforms, springs, spikes,
  checkpoints and an exit.
- Enemies: walker, hopper, flyer. Pickups: gems, health berries, ammo.
- Original procedural art, synthesized sound effects and an original chiptune.

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
