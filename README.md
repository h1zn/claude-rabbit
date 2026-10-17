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
| Fire | X / J / Ctrl |
| Change weapon | C / Tab (next with ammo), or 1-9 |
| Run | Shift (hold) |
| Drop through a platform | Down + Jump |
| Super jump | Hold Down until crouched, then Jump (60% higher, smashes blocks above) |
| Butt-stomp | Down in the air |
| Uppercut | Up + Fire |
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
  switch crates that flip switch blocks and ghost blocks level-wide, and
  weapon blocks that only the gun pictured on them breaks (TNT blocks: any
  explosion). Every level has a weapon vault.
- **Weapons** (manual, all nine): blaster (never runs out), bouncer (bounces
  off floors and walls), frostbiter (freezes enemies; frozen ones shatter at a
  touch), missiles (home in), RF missiles (two in a V, three powered up),
  toaster (flamethrower; Fastfire lengthens the flame), TNT (drop it; goes off
  when an enemy comes near, when shot, or after 4 s, and sets off other TNT),
  pepper spray (short range) and electro-blaster (goes through enemies).
  Ammo pickups give +3, ammo crates +15, and power-up monitors +25 and the
  powered-up shot. Ammo carries over between levels.
- **Things to use**: red, green and blue springs, side springs, swinging poles
  (measured: held up to 70 ticks, flung at up to 20 px/tick), warps and coin
  warps (they show `xN` when you are N coins short), lava (burns).
- **Pickups**: silver/gold coins, 4 gem colours, 38 foods, carrot, super carrot,
  1-up, Fastfire (fire delay -3, down to 6), fire-shield monitor (30 s, each hit
  costs 5 s), ammo, ammo crates, power-up monitors.
- **Bosses** guard the exits of five levels; the exit stays locked until the
  boss is beaten, and dying starts the fight over. The Queen (Dungeon Escape:
  she can't be hurt; shoot her while she screams to push her back, then off
  her ledge; her stomps drop bricks), Schwartzenguard (Carrotus Town: throws
  his flailerang and waits for it to come back), Bilsy (Lava Forge: vanishes
  and throws homing fireballs), the Robot (Tubelectric: copters in, fires
  spike balls) and Uterus (Crystal Caverns: only open, shieldless, can it be
  hurt; spawns crabs). Behaviour follows Jazz2 Resurrection's bosses.
- **Enemies**: turtle (stomp it and kick the shell into others), lizard
  (lunges), demon (fast), frog (hops), bat (sleeps until you come near),
  dragonfly (hovers above you, then dives), monkey (throws bananas at you) and
  bomb lizard (lobs bombs). Shoot thrown things out of the air.
- **Music**: your recorded tracks for the intro, menu, beach, castle, town and
  jungle levels (`Soundtracks/`, at background volume with fades); the other
  levels use the synthesized chiptunes. Volume is in OPTIONS.
- **Physics**: the original's values (see SPEC.md): floaty 0.125 fall, 0.375
  rise, 8 px/tick movement cap, dash with grace, copter glide 4:1.

## Characters and menus

**New Game** opens JJ2's character select: **Jazz** (copter ears, uppercut),
**Spaz** (double jump, side kick) or **Lori** (copter ears, flying kick);
UP + FIRE is the special move, JUMP in the air the second ability. The pick
is saved, and in party mode your rival sees your character in red. Then the
**episode select** shows JJ2's episode pictures for this game's nine levels
and every level pack. The menus use JJ2's own fonts and title screen, the
level card is JJ2's loading screen and game over asks **Continue?**.
(Art from `new/New Tilesets/`, cut by `tools/build_sprites.py` with
`tools/spaz_anims.json`, `lori_anims.json`, `charsel_anims.json`, and by
`tools/build_font.py`.)

## Classic JJ2 levels

The episode select also plays original Jazz Jackrabbit 2 levels straight
from `Levels/`: each folder holds `.j2l` levels with their `.j2t` tile sets
(and music). Included now:

- **Xenobiotic Xeranthemum 2** (Blade): Oasis, Islands in the Sapphire Sea,
  Twilight Park, Space and Aztec, played in order.
- **Episode 2** (KingofKoopas): 17 levels in story order. Downtown Chaos (both
  parts) and Fight Night Street need the retail tile sets `Colon1.j2t` and
  `Colon2.j2t`; the other 14 play.
- **Overgrown** (Laro B.): a battle arena, also in PARTY mode.
- **BL18**: a JJ2+ pack built on scripts and extra tile sets. Valen Village,
  Chips Challenge and Thermal R.7 load, with gaps where their missing tile
  sets go; the rest need tile sets that aren't in the folder.
- **Threed Realms**: needs the retail tile sets `Jungle1`, `Town1` and
  `Diam1` copied into its folder.

The game reads the files itself (1.20 to TSF/JJ2+): all layers with their
parallax, animated tiles and the warp-horizon sky; JJ2+ (MLLE) levels' extra
tile sets, palettes and extra layers; collision from the tile masks, pixel
for pixel; and the events turned into this game's things: gems, coins, food,
carrots, springs, poles, checkpoints, warps and coin warps, text signs,
exits, destructible/stomp/speed/collapsing scenery and enemies (each JJ2
enemy becomes the closest one we have). Vines, hooks, tubes, water
(swimming), wind, belts, float-up columns, bridges and light zones work as in
the original. Tracker music (.xm/.mod/.it/.s3m) plays through libopenmpt
(`vendor/chiptune3`); .ogg/.mp3 play as they are.

Drop another pack folder into `Levels/` and it appears in the episode select
when you run `serve.py`. Weapons, ammo, ammo crates, power-up monitors,
bomb crates, TNT and weapon blocks work as in the original; a weapon block
whose gun the level never hands out (the original let you bring ammo from
earlier levels) breaks with any shot, so no level is left impassable. The
Queen, Schwartzenguard (Tuf Boss), Bilsy, the Robot and Uterus fight as in the
original; a level that ends with its boss ends when you beat it. Not supported
yet: the other bosses (Bubba, Devan, Bolly, Tweedle; they stay ordinary
enemies), the frog/bird morphs, and JJ2+ scripts.

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
src/jj2/                original JJ2 levels: files.js (.j2l/.j2t reader), level.js
                        (masks -> collision, events -> entities), view.js (layers),
                        play.js (light/water/collapse), catalog.js (packs), preview.js
vendor/chiptune3/       libopenmpt player for tracker music (MIT / BSD)
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

- More of JJ2 in the classic levels: the remaining bosses and the frog/bird morphs.
- Water, vines and moving platforms in our own levels too.
- A save file for high scores.
- Gamepad support and touch controls.
