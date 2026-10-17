// Original level designs built from slope profiles. Coordinates are tiles
// (32 px). Profile points are [column, surfaceRow]; entities sit in the cell
// above the ground they stand on (see Builder.above).

import { Builder } from './level.js';
import { rng } from './paint.js';

// Scatter scenery along the ground between two columns.
function scenery(L, kinds, from, to, seed, every = 5, opts = {}) {
  const r = rng(seed);
  for (let c = from; c < to; c += every + Math.floor(r() * 3)) {
    if (L.tops[c] === null || L.tops[c - 1] === null || L.tops[c + 1] === null) continue;
    L.decoAt(kinds[Math.floor(r() * kinds.length)], c, { v: Math.floor(r() * 3), ...opts });
  }
}

function sunnySpires() {
  const L = new Builder(200, 24);
  // A: start meadow and a gentle hill
  L.profile([[0, 18], [12, 18], [16, 16], [20, 16], [24, 18], [30, 18]]);
  L.put(3, 17, 'P');
  L.arc(6, 15, 6, 'o', 1);
  L.row(16, 13, 4, '*');
  L.put(18, 11, '$');
  L.put(26, 17, 'w');
  // B: first pit with a gem arc
  L.arc(30, 15, 4, '*', 2);
  // C: 45° climb, gentle ramp to a plateau, spring to a sky loft (secret)
  L.profile([[34, 18], [40, 18], [42, 16], [48, 16], [54, 13], [60, 13], [63, 16], [70, 16]]);
  L.plat(43, 12, 4).row(43, 11, 4, 'g');
  L.put(46, 15, 'h');
  L.row(54, 11, 6, 'o');
  L.put(58, 12, 'S');
  L.plat(54, 4, 9).row(55, 3, 7, 'b');
  L.put(61, 3, 'X');
  L.put(62, 3, '$');
  L.put(66, 9, 'f');
  L.put(68, 15, 'C');
  // D: breakable wall (blast through), floating stepping stones
  L.profile([[70, 16], [84, 16]]);
  L.breakable(76, 13, 2, 3);
  L.row(78, 15, 4, '*');
  L.put(82, 15, 'w');
  L.plat(85, 13, 2).arc(84, 11, 4, '*', 1);
  L.profile([[88, 15], [96, 15], [100, 13], [110, 13]]);
  L.put(90, 14, 'A');
  L.arc(91, 12, 6, 'o', 1);
  L.put(98, 13, 'h');
  L.plat(102, 8, 4).put(103, 7, 'v').put(104, 7, 'X');
  L.row(100, 11, 2, '$');
  // E: valley with spikes, flyers, checkpoint
  L.profile([[110, 13], [116, 16], [130, 16], [134, 14], [140, 14], [146, 17], [150, 17]]);
  L.spikes(120, 15, 2);
  L.row(117, 13, 10, 'o');
  L.put(124, 15, 'w');
  L.put(128, 10, 'f');
  L.row(135, 11, 3, '$');
  L.put(142, 13, 'C');
  // F: last pit and the goal
  L.arc(150, 14, 4, 'g', 2);
  L.profile([[154, 17], [164, 17], [168, 15], [200, 15]]);
  L.put(160, 16, 'h');
  L.arc(171, 12, 9, 'o', 2);
  L.put(176, 14, 'w');
  L.breakable(182, 12, 1, 2).row(182, 11, 1, 'b');
  L.row(184, 12, 5, '*');
  L.put(192, 14, 'E');
  // Food trails along the ground: the reference levels are packed with food
  // (a sugar rush needs 100).
  for (const c of [58, 118, 166]) L.onGround(c, '+');
  L.trail(6, 186, 2);
  scenery(L, ['tree', 'pine', 'bush', 'flowers', 'rock', 'mushroom'], 1, 198, 11, 4);
  scenery(L, ['bush'], 8, 190, 23, 22, { front: true, sink: 10 });
  L.decoAt('sign', 5);
  return L.build({ name: 'Sunny Spires', theme: 'meadow', music: 'meadow' });
}
sunnySpires.title = 'Sunny Spires';
sunnySpires.tip = 'Run downhill to build speed - running jumps go higher!';

function frostfallRidge() {
  const L = new Builder(212, 26);
  // A: snowy start, rolling hill, then a big 45° climb
  L.profile([[0, 20], [14, 20], [20, 17], [28, 17], [34, 20], [44, 20], [50, 14], [58, 14]]);
  L.put(3, 19, 'P');
  L.arc(6, 17, 7, 'o', 1);
  L.row(21, 15, 6, 'o');
  L.put(24, 16, 'k');
  L.row(36, 18, 6, '*');
  L.put(40, 19, 'w');
  L.row(52, 12, 5, 'g');
  L.put(55, 13, 'S');
  L.plat(50, 5, 9).row(51, 4, 7, 'b');
  L.put(57, 4, 'X');
  // gap with an ice ledge
  L.plat(59, 12, 3).row(59, 11, 3, '$');
  // B: valley run
  L.profile([[63, 16], [70, 16], [76, 19], [90, 19], [96, 16], [104, 16]]);
  L.put(66, 15, 'C');
  L.arc(72, 15, 6, 'o', 1);
  L.put(80, 18, 'k');
  L.put(86, 18, 'k');
  L.put(84, 12, 'f');
  L.row(82, 16, 6, '*');
  L.breakable(98, 13, 2, 3);
  L.row(100, 15, 3, 'g');
  // C: hill with a hidden cache under a breakable cap
  L.profile([[104, 16], [110, 13], [118, 13], [124, 16], [136, 16]]);
  L.put(113, 12, 'A');
  L.row(110, 10, 8, 'o');
  L.put(116, 7, 'f');
  L.put(128, 15, 'C');
  L.put(131, 15, 'k');
  // gap with ice platforms
  L.plat(137, 13, 2).plat(140, 11, 2);
  L.row(137, 12, 2, '*').row(140, 10, 2, 'b');
  // D: final ridge and the goal
  L.profile([[142, 17], [150, 17], [156, 14], [166, 14], [172, 17], [212, 17]]);
  L.row(151, 13, 5, 'o');
  L.put(160, 13, 'w');
  L.put(162, 8, 'f');
  L.row(167, 12, 5, '$');
  L.put(178, 16, 'k');
  L.arc(180, 14, 10, 'o', 2);
  L.breakable(188, 14, 1, 3).breakable(189, 14, 1, 3);
  L.row(190, 16, 2, 'v').put(190, 15, 'X');
  L.row(194, 15, 4, '*');
  L.put(204, 16, 'E');
  for (const c of [68, 128, 176]) L.onGround(c, '+');
  L.trail(6, 200, 2);
  scenery(L, ['snowPine', 'snowPine', 'snowBush', 'rock'], 1, 210, 31, 4);
  scenery(L, ['snowBush'], 10, 200, 37, 24, { front: true, sink: 10 });
  return L.build({ name: 'Frostfall Ridge', theme: 'winter', music: 'winter' });
}
frostfallRidge.title = 'Frostfall Ridge';
frostfallRidge.tip = 'Frostmites lunge when you get close - stomp them first!';

function crystalCaverns() {
  const L = new Builder(190, 26);
  L.block(0, 0, 190, 2);
  // Stalactites stay clear of the pillar crossing (cols 91-108) so a full
  // running jump there never clips the ceiling.
  for (const x of [14, 33, 70, 118, 132, 160]) L.block(x, 2, 2, 3);
  // A: cave mouth
  L.profile([[0, 19], [12, 19], [18, 16], [36, 16]]);
  L.put(3, 18, 'P');
  L.row(6, 17, 6, 'o');
  L.put(10, 18, 'h');
  L.plat(24, 12, 4).row(24, 11, 4, 'g');
  L.put(28, 15, 'w');
  L.put(32, 9, 'f');
  // B: spike gulf crossed on floating ledges
  L.profile([[36, 19], [62, 19]]);
  L.spikes(36, 18, 26);
  L.plat(38, 15, 3).row(38, 14, 3, '*');
  L.plat(44, 13, 3).row(44, 12, 3, 'b');
  L.plat(50, 15, 3).row(50, 14, 3, '*');
  L.plat(56, 13, 3).row(56, 12, 3, 'g');
  L.put(47, 8, 'f');
  // C: checkpoint hall, spring to the crystal loft (secret)
  L.profile([[62, 16], [72, 16], [78, 13], [92, 13]]);
  L.put(64, 15, 'C');
  L.row(66, 14, 5, 'o');
  L.put(70, 15, 'w');
  L.put(82, 12, 'h');
  L.put(88, 12, 'S');
  L.plat(84, 5, 8).row(85, 4, 6, 'v').put(90, 4, 'X');
  // D: pillars over the abyss
  L.block(95, 15, 2, 11).row(95, 14, 2, '*');
  L.block(100, 13, 2, 13).row(100, 12, 2, 'b');
  L.block(105, 15, 2, 11).row(105, 14, 2, '*');
  L.put(101, 7, 'f');
  // E: gauntlet with a breakable vault
  L.profile([[109, 16], [120, 16], [124, 18], [140, 18], [146, 15], [156, 15]]);
  L.put(113, 15, 'w');
  L.spikes(126, 17, 3);
  L.row(125, 15, 6, 'o');
  L.put(134, 17, 'h');
  L.put(138, 17, 'w');
  L.breakable(148, 11, 3, 4);
  L.row(148, 14, 3, 'v');
  L.put(149, 13, 'X');
  L.put(152, 14, 'C');
  // F: exit hall
  L.profile([[156, 15], [190, 15]]);
  L.put(162, 10, 'f');
  L.put(170, 10, 'f');
  L.row(160, 13, 10, '*');
  L.row(172, 13, 6, 'o');
  L.put(182, 14, 'E');
  for (const c of [67, 112, 158]) L.onGround(c, '+');
  L.trail(5, 178);
  scenery(L, ['crystals', 'crystals', 'rock', 'mushroom'], 1, 188, 51, 5);
  return L.build({ name: 'Crystal Caverns', theme: 'crystal', music: 'crystal' });
}
crystalCaverns.title = 'Crystal Caverns';
crystalCaverns.tip = 'Buttstomp (DOWN in the air) smashes cracked blocks.';

export const LEVELS = [sunnySpires, frostfallRidge, crystalCaverns];
