# Kip's Gem Rush (prototype)

A fast 2D platformer starring **Kip**, a fox with hover-boots and a blaster.
Its movement and world rules are modelled on Jazz Jackrabbit 2: mechanics
measured from the game in IDA, plus the rules in its manual (see
[SPEC.md](SPEC.md)). The hero, item, enemy and effect sprites and five of the
tilesets are cut from JJ2 sprite sheets the project owner supplied (`new/`,
built by `tools/`), for personal use, as is the soundtrack in `Soundtracks/`.
Code and levels are this project's own.

## Play

Double-click **`play.bat`**. It starts a local web server and opens the game in
your browser. To run it by hand:

```bash
python serve.py 8770
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

## Party mode (2 players)

Double-click **`party.bat`** (or `python serve.py 8870 --lan`) on one computer.
It prints the address the second player opens in their browser on the same
network. In the menu choose **PARTY**: one player hosts and gets a 4-letter
room code, the other joins with it, and the host picks the level.

Both hunt the same gems. Shoot your rival to make them drop up to 5 gems'
worth, which either of you can grab. A player hit with no gems is knocked out
and returns after 10 seconds. The first to reach the exit holding 100 gems
wins. Your rival is drawn in red; enemies are left out so both see the same
world. Esc leaves the game.

(It needs both computers on one network, or the server on a machine both can
reach; playing over the internet means hosting `serve.py` somewhere public.)

## What's in the game

Nine big levels, each built for exploring in every direction rather than
running straight to the right:

1. **Shipwreck Shores** (night beach): three layers of ground with caves between them,
   sky islands linked by swinging poles, and an exit plateau reached by a blue
   spring from the bottom of the canyon.
2. **Dungeon Escape** (castle): climb nine floors through holes in the
   ceilings, past countdown, switch and speed-block walls and a spike pit.
3. **Carrotus Town** (town): houses you can enter and climb, rooftops, a sky
   garden and sewers. The clock tower exit is locked by switch blocks.
4. **Frostfall Ridge** (winter): a mountain climb with ice caves inside.
5. **Firefly Grove** (night jungle): climb glowing trees, swing between their
   canopies, explore root caves. Coloured lighting and fireflies.
6. **Candy Clouds** (candy sky): islands over a bottomless drop, with a faster
   cloud route above and gem rainbows over the gaps.
7. **Tubelectric** (tube): a maze of rooms joined by doors, holes, springs and
   warp tubes. The exit is in the farthest room.
8. **Lava Forge** (volcano): descend four chambers past lava pits, a lava river
   and a lava lake, lit by the lava itself.
9. **Crystal Caverns** (cave): a dark maze of irregular caves.

Levels 5, 6 and 8 recolour existing tilesets with gradient maps (`tilesets.js`).

Every level has three stars to earn (reach the exit, collect 75% of the gems,
find every secret), two secret areas, a Coin Warp to a bonus room,
checkpoints, food for a sugar rush (about 100 per level, placed in small
groups), gems (100 gems = an extra life) and hint signs. Stars, best score
and best time are saved in the browser, and the menu shows your star total.
Chaining kills and gems quickly builds a combo (up to x4 score).

- **Blocks** (manual): blast blocks, countdown blocks (shoot as often as
  the number), butt-stomp blocks, speed blocks (run into them at full speed),
  and switch crates that flip switch blocks and ghost blocks level-wide.
- **Things to use**: red, green and blue springs, side springs, swinging poles
  (measured: held up to 70 ticks, flung at up to 20 px/tick), warps and coin
  warps (they show `xN` when you are N coins short), lava (burns).
- **Pickups**: silver/gold coins, 4 gem colours, 38 foods, carrot, super carrot,
  1-up, Fastfire (fire delay -3, down to 6), fire-shield monitor (30 s, each hit
  costs 5 s), spread-shot crates.
- **Enemies**: turtle (stomp it and kick the shell into others), lizard
  (lunges), demon (fast), frog (hops), bat (sleeps until you come near),
  dragonfly (hovers above you, then dives), monkey (throws bananas at you) and
  bomb lizard (lobs bombs). Shoot thrown things out of the air.
- **Music**: your recorded tracks for the intro, menu, beach, castle, town and
  jungle levels (`Soundtracks/`, at background volume with fades); the other
  levels use the synthesized chiptunes. Volume is in OPTIONS.
- **Physics**: the original's values (see SPEC.md): floaty 0.125 fall, 0.375
  rise, 8 px/tick movement cap, dash with grace, copter glide 4:1.

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
src/levels.js           the level list; designs in src/levels/ (kit.js: helpers, room maze)
src/party.js            party mode: relay connection, rival, sync and rules
src/save.js             saved progress, stars and options
src/screens.js          splash intro, menus, level select, lobby, tally
serve.py                web server + party relay (WebSocket /ws)
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
- Loading the original `.j2l` levels, if you supply them from your copy.
- Weapon blocks and the other weapons (bouncer, frostbiter, missiles, toaster, TNT).
- Water/swimming (a free-move branch was found), moving platforms, hanging vines.
- A save file for high scores.
- Gamepad support and touch controls.
- Tune gravity and terminal speed further against the original's feel.
