# Kip's Gem Rush (prototype)

A fast 2D platformer starring **Kip**, a fox with hover-boots and a blaster.
Its movement and world rules are modelled on Jazz Jackrabbit 2: mechanics
measured from the game in IDA, plus the rules in its manual (see
[SPEC.md](SPEC.md)). The hero, item, enemy and effect sprites and five of the
tilesets are cut from JJ2 sprite sheets the project owner supplied (`new/`,
built by `tools/`), for personal use. Code, levels, sound effects and music are
this project's own.

## Play

Double-click **`play.bat`**. It starts a local web server and opens the game in
your browser. To run it by hand:

```bash
python -m http.server 8770 --bind 127.0.0.1
```

Then open <http://localhost:8770/>. (Opening `index.html` directly from disk will
not work, because browsers block JavaScript modules on `file://`.)

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys / WASD |
| Jump | Space / Z (hold for a higher jump) |
| Hover-boots | Press jump again in the air and hold |
| Blast | X / J / Ctrl |
| Run | Shift (hold) |
| Drop through a platform | Down + Jump |
| Super jump | Hold Down until crouched, then Jump (60% higher, smashes blocks above) |
| Butt-stomp | Down in the air |
| Uppercut | Up + Blast |
| Let go of a swinging pole | Jump |
| Pause / Mute | P / M |

## What's in the game

Six big levels, each built for exploring in every direction rather than
running straight to the right:

1. **Sunny Spires** (beach): three layers of ground with caves between them,
   sky islands linked by swinging poles, and an exit plateau reached by a blue
   spring from the bottom of the canyon.
2. **Dungeon Escape** (castle): climb nine floors through holes in the
   ceilings, past countdown, switch and speed-block walls and a spike pit.
3. **Carrotus Town** (town): houses you can enter and climb, rooftops, a sky
   garden and sewers. The clock tower exit is locked by switch blocks.
4. **Frostfall Ridge** (winter): a mountain climb with ice caves inside.
5. **Tubelectric** (tube): a maze of rooms joined by doors, holes, springs and
   warp tubes. The exit is in the farthest room.
6. **Crystal Caverns** (cave): a dark maze of irregular caves.

Every level has two secret areas, a Coin Warp to a bonus room, checkpoints,
food for a sugar rush, gems (100 gems = an extra life) and hint signs.

- **Blocks** (manual): blast blocks, countdown blocks (shoot as often as
  the number), butt-stomp blocks, speed blocks (run into them at full speed),
  and switch crates that flip switch blocks and ghost blocks level-wide.
- **Things to use**: red, green and blue springs, side springs, swinging poles
  (measured: held up to 70 ticks, flung at up to 20 px/tick), warps and coin
  warps (they show `xN` when you are N coins short).
- **Pickups**: silver/gold coins, 4 gem colours, 38 foods, carrot, super carrot,
  1-up, Fastfire (fire delay -3, down to 6), fire-shield monitor (30 s, each hit
  costs 5 s), spread-shot crates.
- **Enemies**: turtle (stomp it and kick the shell into others), lizard
  (lunges), demon (fast), frog (hops), bat (sleeps until you come near),
  dragonfly (hovers above you, then dives).

`node tools/check_levels.mjs` checks every level: it searches the spots Kip
can reach (jumps, super jumps, springs, poles, warps) and lists anything left
unreachable: exit, checkpoints, secrets, pickups, or a coin warp the level
doesn't have enough coins for.

## Project layout

```
index.html, style.css   page and crisp pixel scaling
src/config.js           physics and camera constants (measured vs tuned)
src/main.js             fixed-step loop and screen flow
src/game.js             world state, interactions, camera
src/player.js           Kip's movement and abilities
src/entities.js         enemies, pickups, springs, poles, warps, hints, shots, effects
src/level.js            tile map, collision and the level builder
src/levels.js           the level designs (and the room-maze builder)
tools/check_levels.mjs  reachability check for all levels
tools/build_sprites.py  cuts sprite sheets in new/ into assets/*.png + .json
tools/build_blocks.py   packs the special block tiles into assets/blocks.png
src/art.js              loads the sprite sheets and tilesets; arcade text
src/audio.js            synthesized sound effects and music sequencer
src/render.js           drawing, HUD and screens
SPEC.md                 the measured mechanics and where they came from
```

## Ideas for the next pass

- Bosses guarding some exits (manual: the Queen, Schwartzenguard).
- Weapon blocks and the other weapons (bouncer, frostbiter, missiles, toaster, TNT).
- Water/swimming (a free-move branch was found), moving platforms, hanging vines.
- A save file for high scores.
- Gamepad support and touch controls.
- Tune gravity and terminal speed further against the original's feel.
