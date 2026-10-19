# Kip's Gem Rush (prototype)

A fast 2D platformer in the style of Jazz Jackrabbit 2, starring Jazz, Spaz
and Lori. Its movement and world rules are modelled on the original:
mechanics measured from the game in IDA and from Jazz2 Resurrection's traces,
plus the rules in its manual (see [SPEC.md](SPEC.md)). How it was built is
written up in [EXPERIMENT.md](EXPERIMENT.md). The hero, item, enemy and effect sprites and five of the
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
| Jump | Space / Z / K (hold for a higher jump) |
| Copter ears (Jazz, Lori) / double jump (Spaz) | Press jump again in the air (hold to keep the copter going) |
| Fire | X / J / Ctrl (hold Up to aim up; diagonally while moving) |
| Change weapon | C / Tab (next with ammo), or 1-9 |
| Run | Shift / L (hold) |
| Drop through a platform | Down + Jump |
| Uppercut (Jazz) / kick (Spaz, Lori) | Hold Down until crouched, standing still, then Jump (the original's input) |
| Super jump | The same while still sliding (60% higher, smashes blocks above) |
| Butt-stomp | Down in the air |
| Let go of a swinging pole | Jump |
| Pause / Mute | P or Esc / M |
| Help | F1 |
| Screen smaller / bigger | F3 / F4 |
| Load / save a game | F5 / F6 (the manual's keys) |
| Fullscreen | Alt+Enter (or F11) |

**Gamepads** work too (the standard layout): d-pad or left stick to move,
A jump, X or RT fire, B, LB or LT run, Y or RB next weapon, START pause; in
the menus A chooses and B goes back.

All play keys can be changed in **OPTIONS > CONTROLS** (up to three keys per
action; a key already in use swaps over): **Keyboard 1** for playing alone,
**Keyboard 2** for the second player in split screen (the manual's: WASD,
G jump, H fire, J run, F next weapon), and a page showing the gamepad
buttons and which pads are connected. **OPTIONS > VIDEO** has fullscreen,
fit-window or pixel-perfect scaling, sharp or smooth filtering, the screen
size (F3 / F4) and switches for screen shake and flashes. **OPTIONS >
LANGUAGE** switches the on-screen text between the manual's six languages:
English, German, French, Spanish, Italian and Dutch. (Level names, hint
signs and story text stay as their levels have them; the JJ2 fonts have no
accents, so the menus drop them, while in-game messages keep them.)

## Saving, high scores and difficulty

- **Save / load** (manual): in the pause menu choose **SAVE GAME** (or press
  F6) and name the game in one of eight slots; **LOAD GAME** in the main menu
  or the pause menu (or F5) lists them. A saved game starts again at the
  beginning of the level it was saved in, with the score, lives, weapons and
  continues it had when that level began (so it can't collect a level's
  gems twice). CLEAR (Backspace) twice erases a slot.
- **High scores**: the main menu's **High Scores** shows the top ten (name,
  score, the level reached and the difficulty); RIGHT shows the best score,
  time and stars of each of this game's levels. A game that ends with a
  good enough score (game over, the last level, or quitting) asks for a
  name.
- **Difficulty** (manual: "the higher the difficulty, the more baddies"):
  after the character select choose **Easy, Medium or Hard**. Original JJ2
  levels use the Easy-only and Hard-only marks their makers put on enemies
  and items (7 of the 33 levels have them); this game's levels leave out
  every third enemy on Easy and add one beside every other enemy on Hard.
- **Continues** (manual): three per game. YES on the **Continue?** screen
  starts the level again with fresh lives but without your score and
  weapons; with none left the game is over.

## Party mode (up to 5 players)

In **PARTY** choose **HOST A GAME**, **JOIN A GAME** or **SAME COMPUTER**
(split screen for two), and set **NAME** to the name the others see over
your head.

**Players and characters**: up to five per room. Slot 1 (the host) plays
Jazz, 2 Spaz, 3 Lori, 4 purple Jazz and 5 blue Spaz. In team games odd slots
are blue and even slots red.

**The host picks** the mode, the level, the goal and how long nobody can
fight at the start (2:00 by default; 0, 1:00 or 3:00), and can lock the room
with a password. Everyone in the lobby sees the settings change.

**Modes** (the manual's multiplayer games):

- **Treasure Hunt**: collect 100 gems (or 50/150/200), then reach the exit.
  Red gems count 1; there are 10 green gems worth 3, 8 purple worth 5 and
  one gold worth 10. Taken gems come back after 45 seconds.
- **Battle**: the first to roast the others 10 times (5/15/20) wins.
- **Capture the Flag**: take the other team's flag from its base and bring
  it home to yours while your own flag is there.
- **Race**: the first to run the laps (3/5/10) through the level's lap
  warp or the exit wins.

**Hearts**: everybody has 5. Each hit costs a heart and drops up to 5 of
your gems for anyone to grab. Losing the last heart knocks you out for 10
seconds; you come back with full hearts and the gems you still had, at the
spawn spot farthest from the other players (never near the exit). During
the opening truce shots pass through players; the clock counts down and
**FIGHT!** is announced when it ends. The HUD shows your gems (or roasts,
laps, flags), the clock, the standings and a feed of who roasted whom.

**Party items**: "?" boxes on the map hand out a random item; FIRE uses it
instead of shooting. Banana peel (dropped: whoever steps on it spins out),
spring mine (launches whoever steps on it), boomerang (flies out and back,
a heart off whoever it hits), bubble trap (floats them away), swap ray
(you swap places), cream pie (splats their screen), shrink ray (small and
slow for a while) and gem magnet (pulls loose gems to you).

**Party levels**: for Treasure Hunt and Battle the game's own Shipwreck
Shores, Carrotus Town, Candy Clouds and Tubelectric; then Overgrown and the
multiplayer packs in `Levels/`: Return of Blackraptor (treasure, battle, CTF
and race levels), Astolfo (SEast, battle) and ScreenShut Race. Packs can
stay zipped: the game reads the `.zip` files itself, and each level is
offered only in the modes it was made for. Team Race needs
`jazz1Medivo.j2t` and xlmlots `Carrot1N.j2t` added to their zips.

### Playing on a network or online

The game and the party relay are one program, `serve.py` (Python 3,
standard library only):

- **On your network (LAN)**: double-click **`party.bat`** or run
  `python serve.py 8870 --lan` on one computer. It prints the addresses the
  other players open in their browsers (for example
  `http://192.168.1.20:8870/`); the host's lobby shows the same address.
  Allow Python through the computer's firewall when asked.
- **Over the internet**: run `python serve.py --public` (the port comes
  from the first argument, or from `$PORT` as hosting services set it) on a
  machine the players can reach: a small cloud server, or your own computer
  with that TCP port forwarded on the router to it. Players open
  `http://<public address>:<port>/`. Behind an HTTPS proxy (Caddy, nginx,
  a platform's TLS front end) the page connects with `wss://` to `/ws` on
  the same host, so forward WebSocket upgrades on `/ws` too.

Then one player hosts: they get a 4-letter room code. The others pick the
room from **JOIN A GAME**'s list of open games (it shows the mode, the
number of players and whether it is locked or already playing) or type the
code; a locked room asks for its password. Rooms close when the host leaves.
The level, the gems and the items are shared; each player's game decides
what hits them, and the host's game hands out the pickups, so two players
can never take the same gem.

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

Levels 5, 6 and 8 recolour existing tilesets with gradient maps (`gradientMap`
in `src/art.js`, colour stops in `tilesets.js`).

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
- **Water, vines and moving platforms** in our own levels too: a rock pool to
  dive into in Shipwreck Shores (Up / Down swim, Jump at the surface leaps
  out), vines through Firefly Grove's canopy, and moving platforms between
  Candy Clouds' islands. Builder: `pool`, `vine`, `updraft`, `movingPlatform`.
- **Things to use**: red, green and blue springs, side springs, swinging poles
  (measured: held up to 70 ticks, flung at up to 20 px/tick), warps and coin
  warps (they show `xN` when you are N coins short), lava (burns).
- **Extra moves** from the original's unused animations (new/sprites other
  movements.png): Jazz and Spaz aim up and diagonally (Lori uses her own
  poses), fidget when left standing, spin dizzy in the Queen's scream and get
  knocked down when they lose a life.
- **Pickups**: speed shoes (15 s faster), the freeze hourglass (freezes the
  enemies around) and the stopwatch (+10 s of shield), as JJ2's Fast Feet,
  Freeze and Shield Time events; silver/gold coins, 4 gem colours, 38 foods, carrot, super carrot,
  1-up, Fastfire (fire delay -3, down to 6; also dropped at random by beaten
  enemies), ammo, ammo crates, power-up monitors.
- **Shields** (manual): fire, bubble and plasma monitors. Each shield lasts
  30 s, soaks hits (5 s off per hit) and gives the Blaster its Whammo Ammo:
  wobbling bubbles that bounce off walls, flaming missiles, or a three-way
  plasma spray that goes through enemies. The fire shield also scorches
  enemies that touch you.
- **Quick Change monitor**: shoot it to switch hero on the spot (Jazz, Spaz,
  Lori, and round again).
- **Pushable boxes and rocks**: walk into one to push it (the heroes have
  their pushing animation), stand on it to reach higher, drop it on enemies.
  JJ2 levels' pushable boxes and rocks (events 231/232) work too.
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
  levels use the synthesized chiptunes. Volume is in OPTIONS. A sugar rush
  plays its own rush tune.
- **Sounds** (`assets/sfx/`): the Blaster (louder when powered up or
  shielded), the Robot boss's gun and the gem pickup, plus Jazz's voice:
  "hey" at level start, "watch out" when a boss wakes, a cry when hurt,
  "look out" on the last heart, and "balanced" when teetering on a ledge
  (with the wobble pose). The voice is Jazz's only.
- **Physics**: the original's values (see SPEC.md): floaty 0.125 fall, 0.375
  rise, 8 px/tick movement cap, dash with grace, copter glide 4:1.

## Characters and menus

**New Game** opens JJ2's character select: **Jazz** (copter ears, uppercut),
**Spaz** (double jump, side kick) or **Lori** (copter ears, flying kick);
crouch (standing still) then JUMP is the special move, JUMP in the air the
second ability, UP + FIRE aims up. The pick
is saved; in party mode the slot decides the character (see above). Then the
**episode select** shows JJ2's episode pictures for this game's nine levels
and every level pack. The menus use JJ2's own fonts and title screen, the
level card is JJ2's loading screen and game over asks **Continue?**. The main
menu has the manual's items: New Game, Load Game, Party, High Scores, Help
and Options.
(Art from `new/New Tilesets/`, cut by `tools/build_sprites.py` with
`tools/spaz_anims.json`, `lori_anims.json`, `charsel_anims.json`, and by
`tools/build_font.py`.)

## Classic JJ2 levels

The episode select also plays original Jazz Jackrabbit 2 levels straight
from `Levels/`: each folder holds `.j2l` levels with their `.j2t` tile sets
(and music). Levels whose tile sets aren't in their folder are left out of
the menus (adding the missing `.j2t` brings them back). Included now:

- **Xenobiotic Xeranthemum 2** (Blade): Oasis, Islands in the Sapphire Sea,
  Twilight Park, Space and Aztec, played in order.
- **Episode 2** (KingofKoopas): 14 of its 17 levels in story order; Downtown
  Chaos (both parts) and Fight Night Street need the retail tile sets
  `Colon1.j2t` and `Colon2.j2t`, and the story skips them.
- **Overgrown** (Laro B.): a battle arena, also in PARTY mode.
- **Vault of Ceramicus** and the multiplayer packs (see Party mode), read
  straight from their `.zip` files.
- **BL18**: a JJ2+ pack built on scripts and extra tile sets. Valen Village
  and Thermal R.7 play (with small gaps where missing extra sets go); the
  other seven need tile sets that aren't in the folder.
- **Threed Realms**: hidden until the retail tile sets `Jungle1`, `Town1` and
  `Diam1` are copied into its folder.

The game reads the files itself (1.20 to TSF/JJ2+): all layers with their
parallax, animated tiles and the warp-horizon sky; JJ2+ (MLLE) levels' extra
tile sets, palettes and extra layers; collision from the tile masks, pixel
for pixel; and the events turned into this game's things: gems, coins, food,
carrots, springs, poles, checkpoints, warps and coin warps, text signs,
exits, destructible/stomp/speed/collapsing scenery and enemies (each JJ2
enemy moves like the closest one we have; fencers, fat chicks, fish, lab
rats, Doggy Dogg, skeletons, ravens, bees, crabs and the Mad Hatter keep
their own JJ2 art, cut from the enemies sheet in `Levels/`). Vines, hooks, tubes, water
(swimming), wind, belts, float-up columns, bridges and light zones work as in
the original. Tracker music (.xm/.mod/.it/.s3m) plays through libopenmpt
(`vendor/chiptune3`); .ogg/.mp3 play as they are.

Drop another pack folder into `Levels/` and it appears in the episode select
when you run `serve.py`. Weapons, ammo, ammo crates, power-up monitors,
bomb crates, TNT and weapon blocks work as in the original; a weapon block
whose gun the level never hands out (the original let you bring ammo from
earlier levels) breaks with any shot, so no level is left impassable. The
Queen, Schwartzenguard (Tuf Boss), Bilsy, the Robot and Uterus fight as in the
original, and so does Devan Shell (from `Levels/Devan Shell.png`): he runs,
leaps and fires along the floor, and at half health flies into a rage with
triple shots and bombs. A level that ends with its boss ends when you beat
it. Not supported yet: Bubba, Bolly and Tweedle (they stay ordinary
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
src/input.js            keyboard and gamepads sampled once per tick (held / pressed)
src/player.js           the hero's movement and abilities
src/entities.js         enemies, pickups, springs, poles, warps, hints, shots, effects
src/weapons.js          the nine weapons: shots, aiming, explosions, TNT
src/bosses.js           Queen, Schwartzenguard, Bilsy, Robot, Uterus, Devan Shell
src/level.js            tile map, collision and the level builder
src/levels.js           the level list; designs in src/levels/ (kit.js: helpers, room maze)
src/party.js            party mode: relay connection, players, sync, modes and rules
src/partyitems.js       party items: "?" boxes, peels, mines, boomerangs, pies...
src/save.js             saved progress, stars, high scores, save slots and options
src/lang.js             on-screen text in six languages
src/difficulty.js       Easy / Hard enemies in this game's own levels
src/jj2/                original JJ2 levels: files.js (.j2l/.j2t reader), level.js
                        (masks -> collision, events -> entities), view.js (layers), zip.js (packs in .zip),
                        play.js (light/water/collapse), catalog.js (packs), preview.js,
                        platforms.js (moving platforms on chains)
vendor/chiptune3/       libopenmpt player for tracker music (MIT / BSD)
src/screens.js          splash intro, menus, level select, lobby, tally
serve.py                web server + party relay (WebSocket /ws, rooms of 5, room list)
tools/check_levels.mjs  reachability check for all levels
tools/build_sprites.py  cuts sprite sheets in new/ into assets/*.png + .json
tools/build_blocks.py   packs the special block tiles into assets/blocks.png
tools/build_font.py     cuts the JJ2 menu fonts into assets/font_*.png
tools/slice.py, boxes.py, tilegrid.py   helpers for finding frames and tiles in sheets
src/art.js              loads the sprite sheets and tilesets; arcade text
src/sheets.js           sprite-sheet atlases and animation frames
src/sprites.js, paint.js  the few procedural sprites and their painting toolkit
src/tilesets.js, terrain.js, backdrop.js, sky.js   built-in levels' ground, backdrops, skies, weather
src/audio.js            JJ2 sound samples, tracker and recorded music, synthesized fallbacks
src/sfxmap.js           game event -> sound sample number
src/render.js           world drawing and the in-game HUD
dev/                    sheet.html (frame viewer), sounds.html (sample listener)
SPEC.md                 the measured mechanics and where they came from
```

## Ideas for the next pass

- More of JJ2 in the classic levels: the remaining bosses and the frog/bird morphs.
- Touch controls.
