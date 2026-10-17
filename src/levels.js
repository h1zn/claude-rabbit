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

// An item or enemy standing on the surface at a column.
function on(L, x, ch) { return L.put(x, L.above(x), ch); }

// One-way ledges up a shaft, every `step` rows, alternating sides, so Kip can
// hop up a tall shaft (he jumps through one-way ledges from below).
function ladder(L, x, w, top, bottom, step = 4) {
  for (let r = bottom - step, i = 0; r > top; r -= step, i++) L.plat(i % 2 ? x : x + w - 3, r, 3);
  return L;
}

function sunnySpires() {
  const L = new Builder(200, 56);
  // Three ground layers with open caves between them (back wall below row
  // 26), sky islands above, and the exit plateau in the east reached with a
  // blue spring from the bottom of the canyon.
  L.wall(0, 26, 186, 30);
  L.profile([[0, 22], [26, 22], [30, 18], [40, 18], [44, 22], [70, 22]], 4);
  L.profile([[76, 22], [100, 22], [104, 20], [118, 20], [122, 22], [150, 22]], 4);
  L.profile([[10, 32], [28, 32]], 4);
  L.profile([[35, 32], [60, 32], [64, 30], [80, 30], [84, 32], [120, 32]], 4);
  L.profile([[127, 32], [165, 32]], 4);
  L.profile([[0, 46], [50, 46], [54, 42], [90, 42], [94, 46], [140, 46], [144, 42], [186, 42]]);
  L.ground(186, 200, 14);

  // Start.
  L.put(3, 21, 'P');
  L.hint(6, 21, 'Explore everywhere! Three layers of ground,\nsky islands, secrets and a Coin Warp.');
  L.arc(8, 19, 6, 'o', 1);
  L.row(14, 19, 4, '*');
  L.on(20, 'A');
  L.on(26, 'w');
  // Hill spring up to the sky islands.
  L.put(38, 17, 'S');
  L.on(44, 'h');

  // Sky islands, poles between them.
  L.mass(40, 8, 7, 2).row(41, 7, 5, '*');
  L.mass(51, 9, 5, 2).row(51, 8, 5, 'o');
  L.put(60, 8, 'H');
  L.mass(66, 10, 5, 2).row(66, 9, 5, '$');
  L.put(68, 4, 'd');
  L.plat(74, 7, 4).row(74, 6, 4, 'g');
  L.put(81, 6, 'H');
  L.mass(88, 8, 7, 2).row(89, 7, 5, 'o');
  L.plat(99, 10, 4).put(100, 9, '@');
  L.put(108, 5, 'H');
  L.mass(115, 7, 10, 3).row(116, 6, 4, 'b').put(121, 6, 'X').put(123, 6, '1');

  // Upper ground east.
  L.on(60, 'k');
  L.on(84, 'w');
  L.on(120, 'h');
  // Stash on the hilltop: stone roof and back wall, speed blocks in front.
  L.block(107, 15, 8, 1).block(114, 16, 1, 4).speedBlocks(107, 16, 1, 4);
  L.put(109, 19, '@').put(110, 19, 'F').put(111, 19, '@').put(112, 19, 'g');
  L.hint(92, 21, 'Speed blocks break when you\nRUN into them at full speed.');
  L.plat(97, 22, 3); // a one-way lid over a shaft down
  L.carve(97, 23, 3, 3);
  L.plat(95, 27, 5);
  L.put(124, 21, 'C');
  L.stomp(132, 22, 2, 1).carve(132, 23, 2, 3);
  L.hint(130, 21, 'Cracked floor: JUMP, then DOWN to butt-stomp.');
  L.on(140, 'n');
  L.put(144, 16, 'f');

  // Middle band.
  L.put(5, 45, 'S');      // spring from the bottom up past the band's west end
  // A stomp-block lid over a secret pocket inside the band.
  L.carve(14, 33, 8, 2).stomp(17, 32, 2, 1);
  L.row(15, 34, 6, 'g').put(18, 33, 'X');
  L.line(36, 120, 30);
  L.on(40, 'w', 30).on(70, 'h', 28).on(90, 'k', 30).on(112, 'w', 30);
  L.row(64, 27, 5, 'g').row(66, 25, 3, 'b');
  L.on(77, '+', 28);
  L.put(52, 27, 'f');
  L.line(128, 165, 30, 'o', 3);
  L.on(135, 'n', 30);
  L.warp(150, 31, 'coin1', 'bonus1', { cost: 20, label: 'COIN WARP!' });
  L.hint(146, 31, 'Coin Warp: 20 coins opens it.');
  L.on(160, 'Q', 30);

  // Bottom.
  L.line(1, 186, 40, 'o', 3);
  L.row(12, 43, 5, '$');
  L.on(30, 'h', 40).on(70, 'w', 40).on(100, 'k', 40).on(130, 'n', 40).on(160, 'w', 40);
  L.put(60, 41, 'Y');
  L.hint(63, 41, 'Shoot the ! crate to flip\nthe switch blocks.');
  // Switch-block vault and a ghost-block stair to a high ledge.
  L.fill(107, 38, 7, 1, 'u').fill(107, 39, 1, 3, 'u').fill(113, 39, 1, 3, 'u');
  L.row(108, 41, 5, 'g').put(110, 40, '1');
  L.fill(74, 40, 2, 1, 'i').fill(78, 38, 2, 1, 'i').fill(82, 36, 2, 1, 'i');
  L.row(84, 36, 1, '@');
  L.put(118, 38, 'H');
  L.countdown(150, 39, 1, 3, 3);
  L.carve(151, 39, 4, 3).put(152, 41, '@').put(153, 41, '%');
  L.put(172, 41, 'C');
  L.warp(174, 41, 'back1');
  L.put(181, 41, 'U');
  L.hint(175, 41, 'A blue spring! It throws you\nhigher than anything else.');
  L.put(181, 30, 'g').put(181, 24, 'g').put(181, 18, 'b');
  L.put(196, 13, 'E');

  // Bonus room inside the plateau, only reachable through the Coin Warp.
  L.carve(187, 22, 12, 6);
  L.warp(188, 27, 'bonus1');
  L.warp(197, 27, 'out1', 'back1');
  L.row(189, 24, 8, '*').row(189, 23, 8, 'g');
  L.floorRow(189, 197, 27, 'o', 1);
  L.put(192, 27, '1').put(193, 27, '@');

  for (const c of [8, 60, 128]) L.onGround(c, '+');
  L.line(50, 150, 0, 'o', 3);
  scenery(L, ['tree', 'rock'], 1, 150, 11, 6);
  return L.build({ name: 'Sunny Spires', theme: 'meadow', music: 'meadow', horizon: 22 });
}
sunnySpires.title = 'Sunny Spires';
sunnySpires.tip = 'Explore! Three layers of ground, sky islands and a Coin Warp.';

// Castle tower: nine floors, each a corridor between two-tile stone bands.
// Holes alternate ends, with a ledge under each, so the climb zigzags; springs,
// poles and a pole lift give shortcuts, and blocks bar some corridors.
function dungeonEscape() {
  const W = 140;
  const L = new Builder(W, 78);
  L.wall(0, 0, W, 78);
  L.ground(0, W, 74);
  const floors = [66, 58, 50, 42, 34, 26, 18, 10];
  floors.forEach((t, k) => {
    L.fill(0, t, W, 2, '#');
    const hx = k % 2 ? 12 : 122;           // climb hole
    L.carve(hx, t, 6, 2).plat(hx, t + 4, 6);
  });
  // Step-ups with sloped sides along each corridor (t = band above).
  const humps = { 66: [35, 85], 58: [40, 95], 50: [45, 95], 42: [30, 80], 34: [100], 26: [95], 18: [30, 85], 10: [30, 70] };
  for (const [t, xs] of Object.entries(humps)) {
    for (const x of xs) L.profile([[x, +t + 8], [x + 3, +t + 5], [x + 9, +t + 5], [x + 12, +t + 8]], 3);
  }
  const deco = rng(7);
  for (const t of [66, 58, 50, 42, 34, 26, 18, 10]) {
    for (let x = 24; x < 118; x += 18 + Math.floor(deco() * 10)) L.deco(deco() < 0.6 ? 'window' : 'knight', x, L.surface(x, t + 2));
  }
  // Corridor content helper: `t` is the band above, Kip stands on row t + 7.
  const corridor = (t, x0, x1, step = 3) => L.line(x0, x1, t + 2, 'o', step);

  // Dungeon (stand row 73).
  L.put(4, 73, 'P');
  L.hint(7, 73, 'Thrown in the dungeon! Climb out of the castle.\nHoles in the ceiling lead up a floor.');
  corridor(66, 8, 120);
  L.on(30, 'w', 68).on(60, 'h', 68).on(95, 'w', 68).put(80, 68, 'f');
  L.row(40, 70, 4, '*').row(70, 70, 4, '*');
  L.on(110, 'A', 68);
  // Pole lift: a vertical pole under a shaft through two floors.
  L.carve(66, 66, 3, 2).carve(66, 58, 3, 2).put(67, 70, 'I');
  L.put(67, 62, '$').put(67, 56, '$');

  // Floor 66 corridor (stand 65): countdown wall.
  corridor(58, 20, 122);
  L.countdown(80, 60, 1, 6, 2);
  L.hint(84, 65, 'Countdown blocks: the number is\nhow many hits each one needs.');
  L.on(100, 'k', 60).on(50, 'w', 60).put(40, 60, 'f');
  L.row(86, 62, 5, 'g');
  L.on(30, '+', 60);

  // Floor 58 corridor (stand 57): the switch crate.
  corridor(50, 20, 120);
  L.put(30, 57, 'Y');
  L.hint(26, 57, 'Shoot the ! crate. Somewhere above,\na switch wall will open.');
  L.on(60, 'h', 52).on(90, 'n', 52);
  L.row(70, 54, 6, '*').put(110, 57, '@');

  // Floor 50 corridor (stand 49): switch wall, secret room behind a crack.
  corridor(42, 8, 120);
  L.put(118, 49, 'C');
  L.fill(60, 44, 1, 6, 'u');
  L.fill(6, 44, 1, 6, 'x');
  L.row(1, 49, 4, 'g').put(2, 47, 'X').put(3, 46, '1');
  L.on(90, 'w', 44).on(40, 'k', 44).put(75, 44, 'f');
  L.row(64, 46, 4, 'b');

  // Floor 42 corridor (stand 41): spring shortcut, secret room east.
  corridor(34, 20, 130);
  L.carve(89, 34, 3, 2).put(90, 41, 'S');
  L.fill(133, 36, 1, 6, 'x');
  L.row(134, 41, 5, '@').put(136, 39, 'X').put(137, 41, '%');
  L.on(50, 'h', 36).on(105, 'w', 36);
  L.put(60, 37, 'd');
  L.on(30, '+', 36);

  // Floor 34 corridor (stand 33): spikes crossed with a pole.
  corridor(26, 20, 52);
  corridor(26, 70, 120);
  L.spikes(56, 33, 12);
  L.put(72, 29, 'H');
  L.row(56, 29, 12, '*');
  L.hint(78, 33, 'Swinging poles: touch one to spin,\nthen fly off. Jump lets go early.');
  L.on(90, 'n', 28).on(110, 'k', 28);

  // Floor 26 corridor (stand 25): checkpoint, speed blocks, coin warp.
  corridor(18, 20, 120);
  L.put(20, 25, 'C');
  L.warp(22, 25, 'back2');
  L.speedBlocks(70, 20, 1, 6);
  L.hint(60, 25, 'Speed blocks: RUN into them\nat full speed to smash them.');
  L.warp(110, 25, 'coin2', 'bonus2', { cost: 20, label: 'COIN WARP!' });
  L.on(40, 'w', 20).on(90, 'h', 20).put(100, 20, 'f');
  L.row(74, 22, 6, 'g');

  // Floor 18 corridor (stand 17): butt-stomp floor to a vault in floor 26.
  corridor(10, 8, 120);
  L.on(50, 'k', 12).on(80, 'n', 12).put(65, 12, 'd');
  L.row(30, 14, 6, '$');
  L.on(100, 'Q', 12);

  // Top of the castle (stand 9) and the exit.
  L.line(20, 80, 0, 'o', 3);
  L.on(40, 'w', 0).on(60, 'h', 0);
  L.row(30, 5, 10, 'b');
  L.put(84, 9, 'E');
  L.block(88, 0, 52, 10);

  // Bonus room sealed inside the stone above the top floor.
  L.carve(92, 2, 40, 6);
  L.warp(94, 7, 'bonus2');
  L.warp(130, 7, 'out2', 'back2');
  L.row(97, 4, 30, '*').row(97, 3, 30, 'g');
  L.floorRow(96, 129, 7, 'o', 1);
  L.put(110, 7, '1').put(111, 7, '@').put(112, 7, '@');

  for (let y = 10; y < 74; y += 16) L.deco('candles', 70, y + 2);
  return L.build({ name: 'Dungeon Escape', theme: 'castle', music: 'crystal' });
}
dungeonEscape.title = 'Dungeon Escape';
dungeonEscape.tip = 'Climb the castle: holes in each ceiling lead up a floor.';

// Town: a street of houses you can enter and climb, rooftops above, a sky
// garden over the tallest roof, sewers under the street, and the clock tower
// at the east end, whose door is held shut by switch blocks.
function carrotusTown() {
  const W = 220;
  const L = new Builder(W, 56);
  const STREET = 36;
  L.ground(0, W, STREET);
  // Houses: [x, width, roof row]. Each is hollow, with doors on both sides,
  // ledges up the inside and a one-way hatch in the roof.
  const houses = [[12, 10, 26], [26, 12, 22], [42, 8, 28], [54, 14, 20], [72, 10, 24], [86, 12, 18],
    [104, 8, 26], [118, 12, 22], [134, 10, 28], [148, 12, 20], [166, 10, 24], [180, 8, 26]];
  houses.forEach(([x, w, roof], k) => {
    L.block(x, roof, w, STREET - roof);
    L.room(x + 1, roof + 1, w - 2, STREET - roof - 1);
    L.carve(x, STREET - 3, 1, 3).carve(x + w - 1, STREET - 3, 1, 3);
    let side = k % 2;
    for (let r = STREET - 4; r > roof + 2; r -= 4) L.plat(side++ % 2 ? x + 1 : x + w - 4, r, 3);
    L.plat(x + Math.floor(w / 2) - 1, roof, 2);
    L.line(x + 1, x + w - 1, roof - 1, 'o', 2);
  });
  // Clock tower.
  L.block(196, 8, 8, STREET - 8);
  L.room(197, 9, 6, STREET - 9);
  L.fill(196, STREET - 3, 1, 3, 'u');
  for (let r = STREET - 4, side = 0; r > 10; r -= 4) L.plat(side++ % 2 ? 197 : 200, r, 3);
  L.plat(199, 8, 2);
  L.put(201, 7, 'E');
  L.hint(192, STREET - 1, 'The clock tower door is held by switch blocks.\nFind the ! crate somewhere below the street.');

  // Street.
  L.put(3, STREET - 1, 'P');
  L.hint(6, STREET - 1, 'Houses can be entered and climbed. Roofs, sewers\nand the sky all hide treasure. Exit: the clock tower.');
  L.line(1, 195, STREET - 6, 'o', 3);
  for (const x of [24, 52, 84, 115, 146, 178]) L.on(x, 'w', 30);
  for (const x of [40, 100, 162]) L.on(x, 'k', 30);
  for (const x of [70, 131, 190]) L.on(x, 'n', 30);
  L.put(70, STREET - 1, 'C');
  L.put(160, STREET - 1, 'C');
  L.warp(112, STREET - 1, 'back3');
  L.on(10, 'A', 30);
  // Alleys: springs and poles up to the roofs.
  L.put(39, STREET - 1, 'S').put(69, STREET - 1, 'S').put(132, STREET - 1, 'S').put(177, STREET - 1, 'S');
  L.put(101, 22, 'H').put(163, 22, 'H');
  L.plat(98, 23, 4).plat(161, 25, 3);
  // Gem lines over the roofs.
  for (const [x, w, roof] of houses) L.row(x + 1, roof - 3, w - 2, roof <= 20 ? 'g' : '*');
  L.put(60, 15, 'f').put(124, 17, 'f').put(152, 15, 'd').put(30, 17, 'd');
  // A locked house: countdown blocks in its door.
  L.countdown(148, STREET - 3, 1, 3, 3).countdown(159, STREET - 3, 1, 3, 3);
  L.put(152, STREET - 1, '1').put(154, STREET - 1, '@').put(155, STREET - 1, '@');
  // Cellar under the street, behind a butt-stomp lid.
  L.stomp(113, STREET, 2, 1).carve(110, STREET + 1, 7, 3);
  L.row(111, STREET + 3, 5, 'g').put(113, STREET + 2, 'X').put(115, STREET + 3, 'F');
  L.hint(108, STREET - 1, 'Cracked street? Butt-stomp it!');

  // Sky garden over the tallest roof.
  L.put(91, 17, 'S');
  L.mass(84, 7, 6, 2).row(84, 6, 6, '$');
  L.plat(93, 5, 4).row(93, 4, 4, 'b');
  L.put(102, 4, 'H');
  L.mass(110, 7, 10, 2).row(111, 6, 6, 'g').put(117, 6, 'X').put(118, 6, '1');
  L.plat(124, 9, 4).put(125, 8, '@');
  L.put(100, 2, 'd');

  // Sewers, through manholes in the alleys; springs bring you back up.
  L.carve(0, 42, W, 5);
  for (const x of [8, 50, 100, 160]) L.carve(x, STREET, 2, 6).put(x, 46, 'S');
  L.line(2, 216, 42, 'o', 3);
  for (const x of [30, 75, 130, 190]) L.on(x, 'h', 42);
  for (const x of [60, 145]) L.on(x, 'w', 42);
  L.put(90, 42, 'f').put(170, 42, 'f');
  L.row(20, 43, 6, '$').row(140, 43, 5, '$');
  L.put(205, 46, 'Y');
  L.hint(200, 46, 'The ! crate! Shoot it to open the clock tower.');
  L.warp(120, 46, 'coin3', 'bonus3', { cost: 25, label: 'COIN WARP!' });
  L.hint(116, 46, 'Coin Warp: 25 coins.');
  L.on(176, 'Q', 42);
  L.on(64, '%', 42);
  // Bonus room under the sewers.
  L.carve(60, 50, 40, 5);
  L.warp(62, 54, 'bonus3');
  L.warp(98, 54, 'out3', 'back3');
  L.row(64, 52, 32, '*').row(64, 51, 32, 'g');
  L.floorRow(63, 97, 54, 'o', 1);
  L.put(80, 54, '1').put(81, 54, '@');

  for (const c of [20, 64, 140]) L.on(c, '+', 30);
  return L.build({ name: 'Carrotus Town', theme: 'town', music: 'meadow', horizon: STREET });
}
carrotusTown.title = 'Carrotus Town';
carrotusTown.tip = 'Enter the houses, run the rooftops, explore the sewers.';

// Mountain climb: the surface rises in slopes and cliffs to the summit exit;
// ice caves inside the mountain give other ways up.
function frostfallRidge() {
  const L = new Builder(170, 80);
  L.profile([[0, 72], [24, 72], [32, 64], [44, 64], [50, 58], [62, 58]]);
  L.ground(62, 80, 50);
  L.profile([[80, 50], [90, 50], [98, 42], [110, 42]]);
  L.ground(110, 130, 32);
  L.profile([[130, 32], [140, 32], [150, 22], [160, 22]]);
  L.ground(160, 170, 12);

  // Foot of the mountain.
  L.put(3, 71, 'P');
  L.hint(6, 71, 'Climb to the summit! Ice caves inside the\nmountain lead up too, and hide treasure.');
  L.arc(8, 69, 7, 'o', 1);
  L.on(20, 'w').on(36, 'k').on(48, 'h');
  L.row(26, 66, 5, '*');
  L.put(60, 57, 'S');
  L.hint(56, 57, 'Spring up the cliff, or find the cave.');

  // Cave 1 under the foot: hole in, spring and shaft out.
  L.carve(14, 72, 2, 3).carve(4, 75, 44, 4);
  L.line(5, 46, 74, 'o', 2);
  L.on(25, 'h', 74).put(30, 75, 'f');
  L.row(18, 76, 6, '$');
  L.carve(40, 64, 2, 11).put(40, 78, 'S');
  L.breakable(8, 75, 1, 4);
  L.row(4, 78, 3, 'g').put(5, 77, 'X').put(6, 76, '1');

  // Cave 2 inside the first cliff, with a countdown wall and the ! crate.
  L.carve(62, 54, 26, 4);
  L.line(63, 86, 54, 'o', 2);
  L.countdown(75, 54, 1, 4, 2);
  L.put(70, 57, 'Y').on(80, 'k', 54);
  L.hint(66, 57, 'The ! crate opens a switch vault\ndeep inside the mountain.');
  L.carve(86, 50, 3, 4).plat(86, 54, 3);

  // Ridge up to the second cliff and its vertical pole.
  L.on(86, 'C');
  L.on(82, 'w').on(96, 'n');
  L.row(64, 46, 6, '$').row(144, 18, 4, '$');
  L.row(100, 39, 6, 'g');
  L.put(108, 38, 'I');
  L.hint(102, 41, 'Vertical poles fling you upward.');
  L.put(95, 36, 'd');
  // Sky ledges over the ridge.
  L.plat(84, 40, 4).row(84, 39, 4, 'o');
  L.plat(90, 34, 3).put(91, 33, '@');

  // Cave 3: butt-stomp in from the ridge; coin warp, switch vault, shaft up.
  L.stomp(104, 42, 2, 1).carve(104, 43, 2, 3);
  L.carve(100, 46, 40, 5);
  L.line(101, 138, 46, 'o', 3);
  L.on(112, 'h', 46).on(124, 'w', 46).put(118, 46, 'f');
  L.warp(102, 50, 'coin4', 'bonus4', { cost: 20, label: 'COIN WARP!' });
  L.fill(126, 47, 1, 4, 'u').fill(131, 47, 1, 4, 'u');
  L.row(127, 50, 4, 'b').put(128, 48, '1');
  L.carve(134, 32, 3, 14);
  ladder(L, 134, 3, 32, 46, 4);
  L.row(108, 48, 5, '$');

  // Upper slopes to the summit.
  L.put(140, 31, 'C');
  L.warp(138, 31, 'back4');
  L.on(116, 'k').on(146, 'w').on(154, 'n');
  L.row(142, 26, 5, 'g');
  L.put(157, 21, 'T');
  L.hint(153, 21, 'A green spring - higher than red!');
  L.put(166, 11, 'E');
  // Sky secret beyond the summit spring.
  L.plat(150, 8, 5).row(150, 7, 5, 'b').put(154, 7, 'X');
  L.put(147, 12, 'H');
  L.on(124, 'Q');

  // Bonus room sealed inside the second cliff.
  L.carve(112, 60, 16, 5);
  L.warp(113, 64, 'bonus4');
  L.warp(126, 64, 'out4', 'back4');
  L.row(114, 62, 11, '*').row(114, 61, 11, 'g');
  L.floorRow(114, 126, 64, 'o', 1);
  L.put(119, 64, '1').put(120, 64, '@');

  for (const c of [12, 66, 132]) L.onGround(c, '+');
  L.trail(6, 168, 2);
  L.line(63, 86, 54, '$', 6);
  scenery(L, ['snowPine', 'snowPine'], 1, 160, 31, 6);
  return L.build({ name: 'Frostfall Ridge', theme: 'winter', music: 'winter', horizon: 50 });
}
frostfallRidge.title = 'Frostfall Ridge';
frostfallRidge.tip = 'Climb the mountain - the ice caves inside lead up too.';

// Room maze on a grid of cells (cw x ch tiles each). A seeded spanning tree
// links every room: side doors, or a hole in the floor with a spring below to
// come back up. Some doors need blocks smashed (blast, countdown, speed), some
// holes have butt-stomp lids, and a few extra loop doors are switch blocks
// (shortcuts only, so the switch can never lock you out). Warp tubes join
// far rooms, the exit is in the room farthest from the start, two dead ends
// become secret rooms, and one cell is a bonus room reached by Coin Warp.
// `irregular` shrinks rooms at random (caves) and joins them with tunnels.
function roomMaze(L, { cols, rows, cw, ch, seed, start, bonus, irregular = false, enemies, theme }) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  L.fill(0, 0, cols * cw, rows * ch, '#');
  L.wall(0, 0, cols * cw, rows * ch);
  const id = (x, y) => y * cols + x;
  const rooms = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Room interior: x0..x1 columns, top..floor-1 rows (floor = solid row).
      const ox = x * cw; const oy = y * ch;
      let x0 = ox + 1; let x1 = ox + cw - 2; let top = oy + 1;
      if (irregular && !(x === start[0] && y === start[1])) {
        x0 += Math.floor(r() * 3); x1 -= Math.floor(r() * 3); top += Math.floor(r() * 2);
      }
      const floor = oy + ch - 2;
      rooms.push({ x, y, x0, x1, top, floor, links: 0 });
      L.carve(x0, top, x1 - x0 + 1, floor - top);
    }
  }
  const isBonus = (x, y) => x === bonus[0] && y === bonus[1];
  // Spanning tree by depth-first search from the start room.
  const seen = new Set([id(...start)]);
  const stack = [start];
  const edges = [];
  const depth = new Map([[id(...start), 0]]);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen.has(id(nx, ny)) && !isBonus(nx, ny));
    if (!next.length) { stack.pop(); continue; }
    const n = pick(next);
    seen.add(id(...n));
    depth.set(id(...n), depth.get(id(x, y)) + 1);
    edges.push([[x, y], n, true]);
    stack.push(n);
  }
  // Extra loop doors between side-by-side rooms.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x + 1 < cols; x++) {
      if (isBonus(x, y) || isBonus(x + 1, y)) continue;
      const tree = edges.some(([a, b]) => (a[0] === x && a[1] === y && b[0] === x + 1 && b[1] === y) || (b[0] === x && b[1] === y && a[0] === x + 1 && a[1] === y));
      if (!tree && r() < 0.3) edges.push([[x, y], [x + 1, y], false]);
    }
  }
  const room = (x, y) => rooms[id(x, y)];
  const gates = ['x', 'c', 'p', null, null, null];
  for (const [a, b, tree] of edges) {
    const A = room(...a); const B = room(...b);
    A.links++; B.links++;
    if (a[1] === b[1]) {
      // Side door at floor level through the wall between the rooms.
      const [left, right] = a[0] < b[0] ? [A, B] : [B, A];
      const fl = Math.min(left.floor, right.floor);
      L.carve(left.x1 + 1, fl - 3, right.x0 - left.x1 - 1, 3);
      const gx = left.x1 + 1;
      const gate = tree ? pick(gates) : 'u';
      if (gate === 'x') L.breakable(gx, fl - 3, 1, 3);
      else if (gate === 'c') L.countdown(gx, fl - 3, 1, 3, 1 + Math.floor(r() * 3));
      else if (gate === 'p' && left.x1 - left.x0 > 10) L.speedBlocks(gx, fl - 3, 1, 3);
      else if (gate === 'u') L.fill(gx, fl - 3, 1, 3, 'u');
    } else {
      // Hole in the floor of the upper room; spring below it.
      const [up, down] = a[1] < b[1] ? [A, B] : [B, A];
      const hx = Math.max(up.x0, down.x0) + 2 + Math.floor(r() * Math.max(1, Math.min(up.x1, down.x1) - Math.max(up.x0, down.x0) - 6));
      L.carve(hx, up.floor, 3, down.top - up.floor);
      // Stomp lids only where the tree reaches the upper room first, so Kip
      // always meets a lid from above.
      if (tree && up === A && r() < 0.35) L.stomp(hx, up.floor, 3, 1);
      // The spring sits under the hole's edge, so it throws Kip back up.
      L.put(hx + 2, down.floor - 1, 'S');
      down.spring = true;
    }
  }
  // Furnish each room.
  for (const R of rooms) {
    if (isBonus(R.x, R.y)) continue;
    const w = R.x1 - R.x0 + 1;
    L.floorRow(R.x0 + 1, R.x1, R.floor - 1, 'o', 2);
    if (R.floor - R.top >= 7) {
      const px = R.x0 + 2 + Math.floor(r() * Math.max(1, w - 8));
      L.plat(px, R.floor - 4, 4).row(px, R.floor - 5, 4, pick(['*', '*', 'g', '$']));
    }
    if (r() < 0.75) L.put(R.x0 + 3 + Math.floor(r() * (w - 6)), R.floor - 1, pick(enemies));
    if (r() < 0.3) L.put(R.x0 + 2 + Math.floor(r() * (w - 4)), R.top + 1, 'f');
    if (r() < 0.35) L.row(R.x0 + 3, R.top + 2, Math.min(5, w - 6), '$');
  }
  // Warp tube pairs between far-apart rooms.
  const far = rooms.filter((R) => !isBonus(R.x, R.y) && !(R.x === start[0] && R.y === start[1]));
  for (let k = 0; k < 3; k++) {
    const A = pick(far); const B = pick(far.filter((R) => Math.abs(R.x - A.x) + Math.abs(R.y - A.y) >= 4));
    if (!B || A.warped || B.warped) continue;
    A.warped = B.warped = true;
    L.warp(A.x1 - 1, A.floor - 1, `${theme}w${k}a`, `${theme}w${k}b`);
    L.warp(B.x1 - 1, B.floor - 1, `${theme}w${k}b`, `${theme}w${k}a`);
  }
  // Exit in the deepest room; secrets in dead ends.
  const order = [...depth.entries()].sort((p, q) => q[1] - p[1]).map(([k]) => rooms[k]);
  const exit = order[0];
  const deadEnds = order.filter((R) => R.links === 1 && R !== exit && !R.warped).slice(0, 2);
  // A free floor cell in a room at or after column `from` (offset from x0).
  const spot = (R, from = 1, dir = 1) => {
    for (let k = 0; k <= R.x1 - R.x0; k++) {
      const c = dir > 0 ? R.x0 + from + k : R.x1 - from - k;
      if (c < R.x0 || c > R.x1) continue;
      if (L.grid[R.floor - 1][c] === '.' && L.grid[R.floor][c] === '#' && L.grid[R.floor - 2][c] === '.') return c;
    }
    return R.x0 + from;
  };
  return { rooms, exit, deadEnds, room, spot, startRoom: room(...start), bonusRoom: room(...bonus) };
}

function tubelectric() {
  const L = new Builder(160, 66);
  const M = roomMaze(L, { cols: 8, rows: 6, cw: 20, ch: 11, seed: 42, start: [0, 5], bonus: [7, 0], enemies: ['w', 'k', 'n', 'h'], theme: 'tube' });
  const S = M.startRoom;
  const at = (R, ch, from = 1, dir = 1) => L.put(M.spot(R, from, dir), R.floor - 1, ch);
  at(S, 'P');
  L.hint(M.spot(S, 4), S.floor - 1, 'A maze of circuits! Warp tubes join far rooms.\nThe exit is in the room farthest from here.');
  const E = M.exit;
  at(E, 'E', 2, -1);
  for (const R of M.deadEnds) L.put(Math.floor((R.x0 + R.x1) / 2), R.floor - 3, 'X').row(R.x0 + 2, R.floor - 2, 4, 'b').put(M.spot(R, 2, -1), R.floor - 1, '1');
  // Switch crate in the start room, checkpoints along the way.
  at(S, 'Y', 2, -1);
  const mid = M.rooms.filter((R) => !R.warped && R !== S && R !== E && !M.deadEnds.includes(R) && R !== M.bonusRoom);
  const cps = [mid[12], mid[30]];
  for (const R of cps) at(R, 'C', 2);
  L.warp(M.spot(cps[0], 5), cps[0].floor - 1, 'back5');
  at(mid[20], 'Q', 3);
  at(mid[8], 'F', 3);
  at(mid[25], '%', 3);
  L.warp(M.spot(mid[5], 2), mid[5].floor - 1, 'coin5', 'bonus5', { cost: 25, label: 'COIN WARP!' });
  const B = M.bonusRoom;
  L.warp(B.x0 + 1, B.floor - 1, 'bonus5');
  L.warp(B.x1 - 1, B.floor - 1, 'out5', 'back5');
  L.row(B.x0 + 3, B.floor - 3, B.x1 - B.x0 - 5, '*').row(B.x0 + 3, B.floor - 4, B.x1 - B.x0 - 5, 'g');
  L.floorRow(B.x0 + 2, B.x1 - 1, B.floor - 1, 'o', 1);
  L.put(B.x0 + 8, B.floor - 1, '1');
  for (const R of M.rooms) if ((R.x + R.y) % 3 === 0) L.deco(R.x % 2 ? 'column' : 'flame', R.x0 + 1, R.floor);
  return L.build({ name: 'Tubelectric', theme: 'tube', music: 'winter' });
}
tubelectric.title = 'Tubelectric';
tubelectric.tip = 'A maze of rooms and warp tubes. Find the farthest room!';

// Dark caverns: an irregular room maze lit only around Kip and glowing things.
function crystalCaverns() {
  const L = new Builder(198, 72);
  const M = roomMaze(L, { cols: 9, rows: 6, cw: 22, ch: 12, seed: 7, start: [0, 0], bonus: [8, 5], irregular: true, enemies: ['h', 'k', 'w', 'n'], theme: 'cave' });
  const S = M.startRoom;
  const at = (R, ch, from = 1, dir = 1) => L.put(M.spot(R, from, dir), R.floor - 1, ch);
  at(S, 'P');
  L.hint(M.spot(S, 4), S.floor - 1, 'Deep, dark caverns. Glowing crystals light the way.\nThe exit lies in the farthest cave.');
  at(M.exit, 'E', 2, -1);
  for (const R of M.deadEnds) L.put(Math.floor((R.x0 + R.x1) / 2), R.floor - 3, 'X').row(R.x0 + 2, R.floor - 2, 4, 'v').put(M.spot(R, 2, -1), R.floor - 1, '1');
  at(S, 'Y', 2, -1);
  const mid = M.rooms.filter((R) => !R.warped && R !== S && R !== M.exit && !M.deadEnds.includes(R) && R !== M.bonusRoom);
  const cps = [mid[14], mid[32]];
  for (const R of cps) at(R, 'C', 2);
  L.warp(M.spot(cps[0], 5), cps[0].floor - 1, 'back6');
  at(mid[10], 'Q', 3);
  at(mid[22], 'F', 3);
  at(mid[28], '%', 3);
  L.warp(M.spot(mid[6], 2), mid[6].floor - 1, 'coin6', 'bonus6', { cost: 25, label: 'COIN WARP!' });
  const B = M.bonusRoom;
  L.warp(M.spot(B, 1), B.floor - 1, 'bonus6');
  L.warp(M.spot(B, 1, -1), B.floor - 1, 'out6', 'back6');
  L.row(B.x0 + 3, B.floor - 3, B.x1 - B.x0 - 5, 'v').row(B.x0 + 3, B.floor - 4, B.x1 - B.x0 - 5, 'b');
  L.floorRow(B.x0 + 2, B.x1 - 1, B.floor - 1, 'o', 1);
  // Spike patches and glowing crystals.
  const rr = rng(77);
  for (const R of mid) {
    if (rr() < 0.3) {
      const x = R.x0 + 6 + Math.floor(rr() * Math.max(1, R.x1 - R.x0 - 12));
      for (let c = x; c < x + 3; c++) if (L.grid[R.floor - 1][c] === '.' && L.grid[R.floor][c] === '#') L.put(c, R.floor - 1, '^');
    }
    L.deco('crystals', R.x0 + 1 + Math.floor(rr() * (R.x1 - R.x0 - 1)), R.floor, { v: Math.floor(rr() * 3) });
  }
  return L.build({ name: 'Crystal Caverns', theme: 'crystal', music: 'crystal', dark: true });
}
crystalCaverns.title = 'Crystal Caverns';
crystalCaverns.tip = 'It is dark down here - crystals and shots light the way.';

export const LEVELS = [sunnySpires, dungeonEscape, carrotusTown, frostfallRidge, tubelectric, crystalCaverns];
