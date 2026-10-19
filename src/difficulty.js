// Difficulty for this game's own levels (original JJ2 levels mark their
// enemies Easy / Hard themselves). The manual: "the higher the difficulty,
// the more baddies you'll face". Easy leaves out every third enemy; Hard
// adds a second one beside every other enemy, where there is room.

import { TILE } from './config.js';

const WALKERS = 'wknhJG';   // turtle, lizard, demon, frog, monkey, bomb lizard
const FLYERS = 'fd';        // bat, dragonfly

// The level's entities for a difficulty (bosses are kept as they are; on
// Hard the player's start stays clear).
export function entitiesFor(level, difficulty) {
  const list = level.entities;
  if (level.jj2 || difficulty === 'medium' || !difficulty) return list;
  const isEnemy = (e) => WALKERS.includes(e.ch) || FLYERS.includes(e.ch);
  let n = 0;
  if (difficulty === 'easy') return list.filter((e) => !isEnemy(e) || n++ % 3 !== 2);
  const start = list.find((e) => e.ch === 'P');
  const taken = new Set(list.map((e) => `${e.tx},${e.ty}`));
  const out = [...list];
  for (const e of list) {
    if (!isEnemy(e) || n++ % 2 !== 1) continue;
    const spot = spotNear(level, e, taken, start);
    if (!spot) continue;
    taken.add(`${spot.tx},${spot.ty}`);
    out.push({ ch: e.ch, tx: spot.tx, ty: spot.ty, extra: true });
  }
  return out;
}

// A free cell a few tiles to either side: on the same floor for walkers,
// open air (under a ceiling, for a hanging bat) for flyers.
function spotNear(level, e, taken, start) {
  const free = (tx, ty) => level.at(tx, ty) === '.' && !level.areaAt(tx * TILE + 16, ty * TILE + 16);
  const ceiling = e.ch === 'f' && level.solid(e.tx, e.ty - 1);
  for (const dx of [3, -3, 4, -4, 2, -2, 5, -5]) {
    const tx = e.tx + dx; const ty = e.ty;
    if (taken.has(`${tx},${ty}`) || !free(tx, ty)) continue;
    if (start && Math.abs(tx - start.tx) < 10 && Math.abs(ty - start.ty) < 6) continue;
    // Nothing solid in between, so it isn't walled off from its partner.
    let clear = true;
    for (let x = Math.min(tx, e.tx); x <= Math.max(tx, e.tx); x++) if (level.solid(x, ty)) clear = false;
    if (!clear) continue;
    if (WALKERS.includes(e.ch) && !(level.groundish(tx, ty + 1) && free(tx, ty - 1))) continue;
    if (ceiling && !level.solid(tx, ty - 1)) continue;
    return { tx, ty };
  }
  return null;
}
