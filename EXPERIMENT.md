# The experiment: building a Jazz Jackrabbit 2–style game with Claude Code

This file records how this game was built: what was asked for, in what order,
how each part works and how it was made, how it was tested, and what went
wrong along the way. It is written for someone who wants to understand (or
repeat) the process, not just play the result.

## 1. The setup

**Who did what.** The project owner directed everything from chat: they
described what they wanted in plain sentences ("player can move inside the
map, not forward pass", "reaudit all twice", "bosses guarding some exits"),
uploaded material to the repository's `main` branch, and played the builds.
Claude Code, running in a cloud container with a clone of the repository,
wrote all the code, tools and levels, tested them, and committed to a feature
branch (`claude/relaxed-fermat-09a2ra`). It merged into `main` only when the
owner said so.

**What the owner supplied** (all in the repository):

| Material | Used for |
| --- | --- |
| IDA Pro findings from `Jazz2.exe` (Christmas Chronicles '99) | the first physics and world rules (`SPEC.md`) |
| The JJ2 manual (`new/Jazz_Jackrabbit_2_Manual.pdf`, since removed) | rules for blocks, weapons, bosses, special moves, controls |
| Sprite sheets ripped by Dolphman (`new/`, `new/New Tilesets/`, `new/Bosses/`; removed once cut) | every character, item, enemy, effect, boss, font and menu picture |
| `Soundtracks/` (intro, menu, beach, castle, town, jungle) | the music |
| `Levels/` (Xenobiotic Xeranthemum 2, Episode 2, BL18, Overgrown, Threed Realms) | original JJ2 levels the game can play |
| Screenshots and complaints ("wtf is this level one") | the most useful bug reports |

**Constraints that shaped the code.**

- *No build step.* The game is plain JavaScript ES modules in `src/`, a
  `<canvas>` of 640×360 and a tiny Python server (`serve.py`, standard
  library only). Double-click `play.bat` and it runs.
- *A cloud sandbox without a screen.* Claude can't watch the game. Every
  feature was checked by driving the real game in headless Chromium
  (Playwright), by plain Node simulations of the physics, and by looking at
  screenshots it took itself (section 8).
- *One long session, many context windows.* The conversation ran out of
  context several times; each time a written summary carried the state
  forward. Commit messages and this file are the durable record.

Sizes at the end: about 12,000 lines of game and tool code in 23 commits by
Claude (47 in the history at the merge into main, plus the final audit
commits), 17 sprite atlases, 9 hand-built levels and 33 original JJ2 levels
the game can open (39 `.j2l` files, 6 of them MLLE extra-layer data).

## 2. Timeline

Each phase below is one request from the owner, with the commit(s) that
answered it.

### Phase 0: a prototype becomes JJ2-shaped (`4a95e7e`)

The repository began as a small original platformer ("Kip's Gem Rush", a fox
with hover-boots) with procedural art. The owner added JJ2 sprite sheets, the
manual and IDA notes, and asked for three things: use IDA to understand the
player and level objectives, make levels you explore in every direction
instead of running right, and use the manual.

- Six big levels built from a level *builder* (section 4.3), each with
  secrets, a coin-warp bonus room, checkpoints and hint signs.
- Mechanics from IDA and the manual: fall cap 12, springs, side springs,
  swinging poles, warps and coin warps, the super jump, countdown,
  butt-stomp, speed and switch blocks, shields, coins, 1-ups.
- `tools/build_sprites.py` and `tools/slice.py`: cut the supplied sheets into
  atlases (section 5).
- `tools/check_levels.mjs`: a reachability search that proves every exit,
  secret and pickup can be reached (section 8.4).

### Phase 1: the eleven-point request (`f2e903c`)

One message asked for: the soundtracks (intro on the splash, a menu track, a
quiet looping track per level), a better splash and menu, a re-examination
of the level designs against real JJ2 levels, something addictive (colours,
missions), **two-player network party mode** (host/join lobby, the rival in
red, shooting makes the rival drop gems, 0 gems = knocked out for 10 s, race
to 100 gems and the exit), a physics re-audit, three new levels with vivid
colours and lighting, enemies that shoot, more solid graphics, and "audit
everything twice".

What made it work:

- **Physics from Jazz2 Resurrection.** Resurrection
  (github.com/deathkiller/jazz2-native) is an open-source reimplementation
  whose `Player.h` documents the original's per-tick values from traces of
  the real game. Its numbers agreed with the IDA reads where both existed
  (rise gravity 0.375 held, 0.875 released, fall 0.125, an 8 px/tick movement
  cap, the dash grace, copter rules). It became the reference for feel.
- **Party mode with no extra software.** `serve.py` gained a WebSocket relay
  written with the standard library. Each side simulates its own player and
  sends its state 20 times a second; the host owns the pickups (the guest
  asks before taking one); each side decides hits on its own player, so
  neither can be hit unfairly by lag.
- **Missions and saving.** Three stars per level (exit, 75% of the gems,
  every secret), best score and time in `localStorage`.
- Three recoloured levels (grove, candy, forge) made by gradient-mapping
  existing tilesets, plus coloured lighting.

The owner said "go merge" and `main` was fast-forwarded.

### Phase 2: "this is level one, wtf" (`0ee3188`)

The owner's screenshot showed a frozen first frame with no hero and no HUD.
Cause: a frog enemy read a timer before setting it, which threw on the first
frame and stopped drawing. Fix: initialise it, and wrap rendering so one bad
frame shows an error overlay instead of a frozen picture. Level 1 also got a
night-beach look.

### Phase 3: playing the real JJ2 levels (`41c8063`, `c9bdb17`, `cb7acb6`)

The owner uploaded original level packs to `Levels/`. The game learned to
read them directly (section 6): `.j2l` levels and `.j2t` tilesets
(zlib-compressed streams, unpacked with the browser's `DecompressionStream`),
all eight layers with parallax and animated tiles, per-pixel collision from
the tile masks, and the level's events turned into this game's objects.
Tracker music (`.it`, `.s3m`, `.xm`) plays through a vendored libopenmpt build
(`vendor/chiptune3`). Packs dropped into `Levels/` are discovered by
`serve.py` and appear in the menu.

### Phase 4: three heroes, JJ2 menus, more packs (`c07e08f`, `6cbd09d`, `5b98a90`)

New sheets for Spaz and Lori, the character select, the episode select,
JJ2's fonts and title screens:

- **Jazz** (copter ears, uppercut), **Spaz** (double jump, side kick),
  **Lori** (copter ears, flying kick).
- JJ2's own title, loading and continue screens; text in JJ2's fonts
  (`tools/build_font.py`).
- Episode 2 and BL18 needed **JJ2+ (MLLE) support**: extra tilesets appended
  to the base set, palette changes, extra layers stored in
  `-MLLE-Data-N.j2l` files, and tiles the level edited.
- Original-level features: triggers (trigger crates, zones and scenery),
  moving platforms (chain platforms circling or swinging, after
  Resurrection's formulas), water blocks, lava and collapsing scenery.

### Phase 5: "reaudit all … twice" (`2d30202`, `69fef1d`, `27f43de`)

The first formal audit (section 8.5). Pass 1: three parallel code reviews
(file parsers, physics and characters, menus and party), then runtime checks.
Pass 2 re-verified every pass-1 fix and reviewed the new diff. Pass 2 caught
a regression that pass 1's fix had introduced: you could fall through
one-way slopes (228 fall-throughs in a simulation before, 0 after).

### Phase 6: weapons (`5ea64ee`)

From the manual: weapon blocks, and the bouncer, frostbiter, missiles,
toaster and TNT. All nine JJ2 guns were built, since the levels use pepper
spray and electro-blaster ammo heavily. Details in section 4.5.

### Phase 7: bosses, physics traces, water in our levels (`ffdebe2`, `d8a6101`, `5cce7c4`)

- **Bosses.** The manual names the Queen and Schwartzenguard; mid-task the
  owner added sheets for Bilsy, the Robot, Uterus and more. Behaviour was
  ported from Resurrection's boss source (section 4.6).
- **Physics against traces.** Resurrection's newer "legacy" model includes
  measured trajectories. Our jump already matched exactly (held jump 132 px,
  a jump released on tick 5 77.1 px, both the original's), and the remaining
  differences were fixed: the landing allowance, butt-stomp drift and enemy
  bounce, Spaz's double-jump window, and the RF blast knockback.
- **Water, vines, moving platforms** in our own levels, by giving them the
  same "area" grid the JJ2 levels use.

### Phase 8: the unused animations (`fac77a3`)

The owner added the sheet of the original's *unused* Jazz and Spaz
animations: shooting up and diagonally, fidgets, dizzy, knocked down, and
beta items. One design decision was the owner's: aiming up needed Up + Fire,
which the uppercut used. They chose "aim up, move the uppercut", so the
uppercut and kicks moved to the original's real input (crouch, then Jump).
Speed shoes, the freeze hourglass and the stopwatch became pickups, matching
JJ2 events the levels already used.

### Phase 9: this document, the merge, two more audits

This file was written and the branch merged into main (`bf2ce1d`, by the
project owner); the two final audits came after and were merged the same
way. Section 9 records them.

## 3. How a frame runs

```
main.js   requestAnimationFrame
  ├─ fixed-step loop: one tick = 14 ms (the original's 71.4 Hz), catching up
  │  at most 35 ticks, then resyncing (measured in IDA)
  │    input.sample()  →  game.update(input)  (or the menu/screens)
  ├─ render.world(game, alpha)   interpolated between the last two ticks
  └─ render.hud(game) / screens
```

- `game.update` runs, in order: moving platforms → player → platform riders →
  party sync → enemies (skipped while frozen) → shots → pickups → props →
  effects → `interact()` (all collisions between kinds of thing) → clean-up →
  JJ2 per-tick rules → camera.
- Every moving thing keeps `prevX/prevY`, so drawing at 60 Hz or 144 Hz stays
  smooth while the simulation stays at exactly 71.4 Hz.

## 4. The pieces

### 4.1 Player (`src/player.js`)

One `update()` handles input, the dash, the horizontal table (ground and air
alike, as in the original), specials, jump and copter, the gravity branch,
collision, shooting, hazards and the animation state. Other modes take over
first when active: dead, celebrating, swinging on a pole, JJ2 tubes and
vines, swimming.

- **Movement is momentum, travel is capped.** `vx` can read 16 while
  dashing, but applied movement is clamped to 8 px/tick; the extra still
  boosts the jump launch `-(10 + |vx|/4)`.
- **Variable jump.** Releasing jump makes the rest of the rise heavier
  instead of cutting speed, so a tap hop has its own arc.
- **Landing allowance.** Coming down onto a ledge's edge lifts you onto it.
  It is calibrated so the same gaps clear as in the original (section 7).
- **Specials.** Crouch, standing still, then Jump: Jazz's uppercut
  (−7.5 px/tick decaying by 0.03125 a tick) or Spaz's/Lori's kick. The same
  while sliding is the super jump.
- **Aiming.** Up + Fire aims straight up (standing still) or diagonally
  (moving); `weapons.js` rotates every weapon's shot pattern to the aim.

### 4.2 World and collision (`src/level.js`, `src/jj2/level.js`)

There are two kinds of level, with one interface (`move`, `solidAt`,
`areaAt`, `breakTile`, …):

- **Our levels** are tile grids of characters (`#` ground, `-` one-way,
  `/` slopes, `x` blast block, `W` weapon block…). Collision is per tile.
- **Original levels** collide per pixel against the tileset's 32×32 masks.
  Bodies move one pixel at a time, feet climb lips and slopes, and one-way
  tiles only catch feet coming from above.

Both carry an `areas` grid of JJ2 event numbers (water, vine, hook, tube,
wind, belt, float-up…), which is why swimming and vines work the same in
both.

### 4.3 Building levels (`src/levels/*.js`, `src/levels/kit.js`)

Levels are code, written with a `Builder` (an illustrative mix of calls from
several levels):

```js
const L = new Builder(200, 56);
L.profile([[0, 22], [26, 22], [30, 18], [40, 18]], 4);   // ground with slopes
L.carve(115, 46, 11, 4).pool(115, 46, 11, 4);            // a rock pool
L.weaponBlock(34, 43, 1, 3, 2);                          // bouncer-only door
L.vine(48, 39, 11).movingPlatform(72, 29, { length: 3 });
L.put(75, 9, 'Z');                                       // a boss (the Queen)
return L.build({ name: 'Shipwreck Shores', theme: 'meadow', music: 'beach' });
```

`kit.js` adds item shapes (arcs, rings, arrows of gems), scenery dressing,
ladders of one-way ledges, weapon vaults, and `roomMaze`: a seeded spanning
tree of rooms joined by doors, holes with springs, blocks to smash and warp
tubes (Tubelectric and Crystal Caverns are mazes).

### 4.4 Things in the world (`src/entities.js`)

- **Enemies** share a base class (walking with ledge turns, damage, flash,
  freeze) with eight kinds plus shells.
- **Pickups** are one class with a `kind`.
- **Props:** springs, poles, checkpoints, warps, secret zones, hint signs, and
  the exit sign, which spins faster the faster you hit it (measured).

### 4.5 Weapons (`src/weapons.js`)

- **One `Bullet` class, nine behaviours:**
  - straight shots: blaster, frostbiter, pepper, electro;
  - gravity and bounce: bouncer;
  - homing: seeker, which turns toward the nearest target in front;
  - accelerating V-pairs: RF;
  - drifting flames: toaster, whose flames stick to walls when powered up;
  - TNT: falls, arms, and goes off on a nearby enemy, a shot or its fuse,
    setting off other TNT.
- **`game.blast()`** is the shared explosion. It damages enemies, breaks
  blocks and crates, chains TNT, and in party mode hurts the rival.
- **Ammo** comes in pickups (+3), crates (+15) and power-up monitors (+25 and
  the powered-up shot). It carries over between levels.
- **Weapon blocks** break only to their pictured gun; TNT blocks to any
  explosion. In original levels, a block whose gun the level never hands out
  breaks with any shot, so no level is left impassable. (The original let you
  bring ammo from earlier levels; ours resets per level pack.)

### 4.6 Bosses (`src/bosses.js`)

Behaviour is ported from Resurrection's boss source. Its timings are in
60 fps frames, so they were converted to our 70 Hz ticks (×70/60).

- **The Queen.** A wall you can't pass. Hits only count while she screams
  (the scream pushes you back) or teeters. Two hits during a scream and she
  steps back; one hit at a ledge and she falls. Her stomps drop bricks.
- **Schwartzenguard.** Walks toward you, throws a flailerang that flies to
  where you stood and swings back, and is stuck waiting for it to return.
- **Bilsy.** Vanishes in dust, reappears nearby, and throws homing fireballs.
- **The Robot.** Copters in, runs at you, and fires spike balls.
- **Uterus.** Floats above you behind six orbiting shield parts and opens and
  closes. She can only be hurt open with the shields gone, and spawns crabs.

A boss locks its level's exit until beaten, and dying resets the fight. In
an original level that ends with its boss, beating it ends the level.

### 4.7 Party mode (`src/party.js`, `serve.py`)

- `serve.py` serves the game and relays WebSocket messages between the two
  players in a room (a 4-letter code).
- **Messages:**
  - state, 20×/s;
  - shots, with weapon and power;
  - gem drops;
  - pickup take/grant/deny/gone;
  - broken tiles, with weapon and blast;
  - win and leave.
- Each side runs the rival's shots locally but only checks them against its
  own player.

### 4.8 Sound and music (`src/audio.js`)

- **Sound effects** are 25 short samples where they fit, otherwise
  synthesized on the fly (tone and noise generators).
- **Music:**
  - the owner's MP3s, through a media element at background volume with
    1.2 s fades;
  - tracker modules through libopenmpt;
  - a small synthesized chiptune sequencer for levels without a track.

## 5. The art pipeline (`tools/`)

The supplied sheets are screenshots: many frames on a flat background, with
text labels. `tools/build_sprites.py SPEC.json OUT` turns one sheet into an
atlas PNG and a JSON file of frames and named animations. Each animation can
be cut four ways:

1. `"frames": [a, b]`: indices from the automatic slicer (`slice.py`). It
   finds connected shapes of non-background pixels, drops text labels, and
   attaches small loose bits (sparks) to the nearest big shape.
2. `"region": [x0, y0, x1, y1]`: every sliced frame centred in a rectangle,
   in reading order.
3. `"boxes": [[…], …]`: exact rectangles, for sprites too small or too
   crowded for the slicer.
4. `"cols": [x0, y0, x1, y1]`: cut a strip at empty columns (`boxes.py`).
   This handles sprites made of loose pieces (electro rings, dust clouds,
   dizzy stars), which the shape slicer would break into many frames.

Each frame gets an anchor (body centre, feet), so frames from different
sheets line up, as long as the box holds only the body: the final audit
caught two Spaz animations whose boxes picked up stray pixels from the row
below (or dizzy stars), which floated him off the ground. That is how the
extra Jazz/Spaz poses from the unused-animation sheet merge into the main
character atlases. Builds are deterministic: rebuilding an unchanged spec
gives identical pixels, checked for every spec in the final audit (which
also repointed Jazz's spec at the copy of his sheet inside the repo).

Other tools: `build_font.py` (JJ2's fonts into glyph atlases),
`build_blocks.py` (the shared block tiles), and gradient-map recolouring
(`gradientMap` in `src/art.js`, colour stops in `tilesets.js`) for the three
themes without their own tileset.

## 6. Reading original JJ2 levels (`src/jj2/`)

- **`files.js`** reads the binary formats. A `.j2l` is a header plus four
  zlib streams: info, events, the layers' tile dictionary and the layer
  maps. A `.j2t` is a header plus four streams: info, images, transparency
  masks and collision masks.
  - It handles 1.20/1.23/TSF/JJ2+ versions.
  - MLLE data: extra tilesets remapped onto the base set, palettes, extra
    layers from separate files, and edited tiles.
  - Bounds checks reject damaged files.
- **`level.js`** converts a level:
  - The sprite layer's tiles become per-pixel collision.
  - Each event becomes one of: an entity (gems, enemies by movement type,
    springs, poles, warps, signs, bosses, ammo, crates, items); an area (vine,
    hook, tube, water, wind, belt, float-up, light, triggers); or a block
    (destructible, stomp, speed, collapse, weapon, bomb).
- **`view.js`** draws the eight layers with their parallax, animated tiles
  (pre-rendered into an atlas) and the warp-horizon sky.
- **`play.js`** runs per-tick rules: light zones, water level changes,
  collapsing platforms, trigger zones and boss areas.
- **`catalog.js`** lists the packs, follows each level's "next level" link,
  and loads files lazily with a menu card while they download.

## 7. Where the physics numbers come from

`SPEC.md` lists every value with its source and status (measured, tuned, or
fitted):

1. **IDA reads** of `Jazz2.exe`: tick rate, catch-up limit, tile size, jump
   launch, terminal fall speed, springs, object gravity, enemy behaviours,
   scoring.
2. **Jazz2 Resurrection's `Player.h`**, whose constants come from traces of
   the original game: gravities, caps, dash, copter, uppercut, double jump,
   landing allowance, stomp drift and bounce, RF blast.
3. **Trace checks.** A Node simulation reproduces three measured
   trajectories:

   | Test | Original | This game |
   | --- | --- | --- |
   | Held standing jump | 132 px | 132 px |
   | Jump released on tick 5 | 77.1 px | 77.1 px |
   | Spaz's double jump | about +80 px | +84 px |

   It also checks the gap pattern: 2-tile walk-off and 5-tile dash land,
   3-tile walk-off and 6-tile dash fall short.
4. **The manual** for rules: block types, the 60% super jump, weapons,
   bosses.

Our player's feet are narrower than the original's collision box, so the
landing allowance (20 px in the original) is 24 px in JJ2 levels and 22 in
ours. That is the value that reproduces the original's gap results, not
its constant.

## 8. How it was tested without seeing the screen

### 8.1 Driving the real game

`window.kip` exposes the live game. A Playwright script opens the page in
headless Chromium (pre-installed in the container), starts a level, places
the player, and steps `game.update(input)` with a scripted input object
(held / pressed / released per tick). It then reads the state back:

```js
const g = window.kip.game; const p = g.player;
p.x = boss.x - 150; p.weapon = 2; p.ammo[2] = 20;
for (let i = 0; i < 160; i++) g.update(shootInput);
return { bossHp: boss.hp, blockBroken: g.level.tiles[ty][tx] === '.' };
```

About a hundred such scripts were written during the session. Each covered
one subject: blocks and mechanics, shells, shooting enemies, character
moves, weapons, bosses, the boss exit lock, party mode with two browsers on
the relay, menus and party lobbies, JJ2 level loading, and fuzzing (random
input across every level, counting page errors).

### 8.2 Simulating physics in Node

Level and player classes import cleanly in Node, so small fake levels test
movement precisely: one-way slopes, dropping through platforms, vines,
swimming, platform riding and ceilings, jump traces, gap tests and the
super jump. These run in milliseconds and caught several bugs that a
screenshot never would.

### 8.3 Looking at the result

Screenshots, contact sheets of every cut animation, and gridded crops of the
source sheets (to read coordinates) were the "eyes". Contact sheets showed,
for example, that Bilsy's last throw frame also caught a fireball from the
row below.

### 8.4 Reachability

`tools/check_levels.mjs` explores every spot the player can reach (walking,
jumps, running jumps, super jumps, springs, poles, warps, copter glide) and
lists anything unreachable. It caught that the first weapon vaults were one
tile tall inside, too low for the player to step into.

### 8.5 Audits

Each "audit twice" request was handled the same way:

1. Independent reviewers (sub-agents) each read one area of the code with a
   checklist, and report findings with concrete failure scenarios.
2. Every finding is reproduced or reasoned through before fixing. A finding
   that doesn't reproduce is recorded as such.
3. The second pass re-verifies each first-pass fix and reviews the new diff,
   because fixes create bugs too.
4. The full regression set runs before each commit.

## 9. The final audit (this phase)

Two passes, each with independent reviewers (subagents given one area and
told to trace a real path from input to failure before reporting) plus the
full regression set: the scripted mechanics tests, the stepped fuzz over
all 32 playable levels with every hero, the boss fights, the physics
reference traces and `check_levels`.

**Pass 1** (`8d900ef`), four reviewers: weapons, physics, bosses, app.

- Weapons: explosive shots hit twice (direct plus blast); the frostbiter
  froze bosses that were meant to be immune; missiles homed on hidden
  bosses; TNT ignored the party rival and went off on one screen only;
  blaster-only weapon blocks in JJ2 levels never broke.
- Physics: the landing allowance could lift a falling hero into a
  ceiling over a ledge; stale super-jump state survived springs, poles
  and bounces; a special could start while swimming.
- Bosses: an uppercut overlapping a boss for several ticks counted every
  tick; the Queen could stall mid-fall; Bilsy could teleport over a
  bottomless drop; the boss-end countdown ran while the player was dead.
- App: a slow level load could overwrite a newer level card; the relay
  server trusted frame lengths and message shapes; the character select
  still named the old special-move input; docs had drifted.

**Pass 2** (`6005843`, `b057152`, `813fd6e`), three reviewers: one
re-verified every pass 1 fix, one re-read the gameplay code, one the art,
levels and docs.

- One pass 1 fix was itself a bug: letting the Queen wake from either
  side turned her away from her pit when the player jumped beneath her,
  so she could never be pushed in and Dungeon Escape's exit stayed
  locked. She wakes only from in front again.
- Robot and Bilsy stayed "visible" to shots after a reset; Dungeon
  Escape's spring was buried inside rock.
- A JJ2 moving platform sinking past a wall could bury the player
  (found by riding every platform in every level from 6-12 boarding
  points); checkpoints and secrets triggered on the dead player's fall;
  the surface leap failed one press in five; Restart Level let lives and
  ammo be farmed.
- Art: Jazz's sprite spec pointed outside the repo; two Spaz animations
  had anchors on stray pixels; the Uterus frames caught pieces of the row
  above. Docs: counts, examples and a few numbers corrected.

After pass 2 the whole regression set runs clean: no page errors or NaN
in any level, all five bosses beaten by the scripted fights with the exit
locking and unlocking correctly, and the physics traces still matching
the original (132 px jump, 77.1 px early release, the walk/dash gap
pattern).

## 10. Bugs worth remembering

| Bug | Lesson |
| --- | --- |
| Level 1 froze on the first frame (a frog read a timer before setting it) | One exception in a draw loop freezes the game; render behind a try/catch that shows the error |
| The Queen fix that made her unbeatable | Re-verify fixes as hard as the original code: a "more forgiving" wake rule broke the one geometry her fight depends on |
| A platform buried the player in rock | Anything that moves the player must go through collision, both ways; a sweep of every platform from many boarding points found the one case |
| Boss timers never fired | Durations converted from 60 fps were fractional, so `st === 0` was never true; clamp at zero |
| The Robot spawned inside rock | The built-in level's `move()` doesn't sweep large steps, so a 300 px move went straight through the ceiling |
| Some level files "weren't JJ2 levels" in a test | Node's small Buffers share a pool; `buf.buffer` needs `byteOffset` |
| Falling through one-way slopes | The "already inside a one-way tile" check ran after the horizontal step had lifted the feet |
| A rider was carried into ceilings | The platform's catch logic re-landed the player inside the ceiling it had just been knocked off |
| A party level could start twice | Loading state belonged to the screen, not to the connection |
| The first weapon vaults couldn't be entered | One tile is 32 px; the player is 38 px tall |
| A boss event repeated 87 times in one level | JJ2+ scripts reuse events as markers; only plausible counts are taken as real |
| Weapon blocks without their gun | Original levels assume you brought ammo; a fallback keeps every level passable |

## 11. Credits and licences

- Jazz Jackrabbit 2 and its characters belong to Epic Games. Sprites were
  ripped by Dolphman and used here for personal, non-commercial play, as
  their sheets ask.
- The level packs in `Levels/` belong to their authors: Blade, KingofKoopas,
  Laro B. and others.
- libopenmpt (`vendor/chiptune3`, BSD) plays tracker music.
- Jazz2 Resurrection (deathkiller) was read as a reference for the original's
  behaviour; no code was copied, its behaviour was re-expressed in this code
  base.
- Everything else (code, tools, levels, synthesized sounds) was written in
  this session.

## 12. Running and extending

- **Play:** `play.bat`, or `python serve.py 8770` and open
  http://localhost:8770/. **Party:** `party.bat` (`serve.py 8870 --lan`).
- **A new level:** write `src/levels/name.js` with a `Builder`, add it to
  `LEVELS` in `src/levels.js`, and run `node tools/check_levels.mjs`.
- **A new JJ2 pack:** drop its folder (levels, tilesets, music) into
  `Levels/`.
- **New sprites:** put the sheet in `new/`, describe the animations in a
  `tools/*_anims.json`, and run `python3 tools/build_sprites.py
  tools/x_anims.json assets/x`.
