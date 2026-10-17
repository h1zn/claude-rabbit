# Kip's Gem Rush (prototype)

A fast 2D platformer starring **Kip**, a fox with hover-boots and a blaster.
It is an original game whose *movement feel* is modelled on mechanics measured
from a 1999 platformer (see [SPEC.md](SPEC.md)). Every sprite, tile, sound,
song, level and line of code here is new.

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
| Pause / Mute | P / M |

## What's in the prototype

- Two levels: **Sunny Spires** (meadow) and **Crystal Caverns** (cave).
- Measured feel: 14 ms fixed tick, running jumps that go higher, the
  release-to-cut variable jump, ground friction, hover slow-fall, stomp bounce,
  hurt knockback and an easing camera with look-ahead.
- Enemies: Bugbot (patrols, turns at ledges), Blobble (hops toward you),
  Buzzwing (sine patrol, dives at you).
- Pickups: four gem colours, health berries, spread-shot crates. Springs,
  spikes, checkpoints, lives, score, time bonus and a level-clear screen.
- Procedural pixel art, synthesized sound effects and two original chiptunes.

## Project layout

```
index.html, style.css   page and crisp pixel scaling
src/config.js           physics and camera constants (measured vs tuned)
src/main.js             fixed-step loop and screen flow
src/game.js             world state, interactions, camera
src/player.js           Kip's movement and abilities
src/entities.js         enemies, pickups, springs, checkpoints, shots, particles
src/level.js            tile map, collision and the level builder
src/levels.js           the two level designs
src/art.js              procedural sprites, tiles and backdrops
src/audio.js            synthesized sound effects and music sequencer
src/render.js           drawing, HUD and screens
SPEC.md                 the measured mechanics and where they came from
```

## Ideas for the next pass

- More levels and a level editor (levels are built with a small API in `levels.js`).
- Slopes, moving platforms, water/swimming (a free-move branch was found).
- Boss fight, more weapons, a save file for high scores.
- Gamepad support and touch controls.
- Tune gravity and terminal speed further against the original's feel.
