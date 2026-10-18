import { Builder, over, shape, weaponVault } from './kit.js';

// Night jungle. Giant trees whose trunks are back-wall columns, climbed by
// one-way branches that spiral up both sides; canopies on top, linked by
// swinging poles; rope bridges in the middle tier; glowing root caves below
// the forest floor. The exit waits on the highest canopy at the far end.
export function fireflyGrove() {
  const W = 200;
  const L = new Builder(W, 68);
  L.profile([[0, 50], [22, 50], [26, 48], [58, 48], [62, 50], [98, 50], [102, 46], [136, 46], [140, 50], [200, 50]]);
  const trees = [[14, 20], [46, 18], [80, 21], [118, 18], [156, 16], [188, 13]];  // [trunk x, canopy top row]
  const floorAt = trees.map(([x]) => L.surface(x + 1, 0));
  trees.forEach(([x, c], i) => {
    const f = floorAt[i];
    L.wall(x, c + 3, 3, f - c - 3);
    // Branches every 4 rows, alternating sides but overlapping the trunk so
    // Kip can also hop straight up; the top one is 4 below the canopy top.
    // The exit tree has only its top branches: it is reached by the pole
    // from the canopy before it, not climbed from the forest floor.
    const last = i === trees.length - 1;
    let lowest = c + 4;
    for (let r = c + 4, k = 0; r <= (last ? c + 12 : f - 2); r += 4, k++) { L.plat(k % 2 ? x - 4 : x + 1, r, 6); lowest = r; }
    if (!last && f - lowest > 4) L.plat(x - 1, f - 3, 5);
    // Canopy with a one-way hatch above the trunk.
    L.mass(x - 6, c, 15, 3).carve(x, c, 3, 3).plat(x, c, 3);
    L.deco('glowshroom', x + 5, f, { v: i % 3 });
  });
  // Poles between canopies: just above the lower of the two canopy tops.
  for (let i = 0; i + 1 < trees.length; i++) {
    const [x, c] = trees[i]; const [, c2] = trees[i + 1];
    L.put(x + 13, Math.min(c, c2) - 3, 'H');
  }
  // Rope bridges between trunks in the middle tier.
  for (let i = 0; i + 1 < trees.length; i++) {
    const x0 = trees[i][0] + 7; const x1 = trees[i + 1][0] - 5;
    const row = 36 - (i % 2) * 4;
    L.plat(x0, row, x1 - x0);
    shape(L, Math.floor((x0 + x1) / 2) - 2, row - 3, 'hump', i % 2 ? 'g' : '*');
  }

  // ---- Forest floor.
  L.put(3, 49, 'P');
  L.hint(6, 49, 'Climb the glowing trees: branches spiral up their\ntrunks. Poles link the canopies; roots hide secrets.');
  for (const [x, n] of [[8, 'arc'], [30, 'hump'], [52, 'arc'], [66, 'line5'], [90, 'hump'], [106, 'arc'], [128, 'hump'], [146, 'arc'], [170, 'line5']]) over(L, x, 40, n, 'o', 2);
  L.on(24, 'h', 40).on(56, 'w', 40).on(92, 'G', 40).on(110, 'k', 40).on(132, 'w', 40).on(166, 'n', 40);
  L.put(60, 47, 'C');
  L.warp(63, 47, 'back7');
  for (const x of [4, 36, 70, 100, 140, 176]) L.deco('glowshroom', x, L.surface(x, 40), { v: x % 3 });
  L.on(20, '+', 40).on(150, '+', 40);

  // ---- Branches and canopies.
  shape(L, 84, 15, 'line5', '$');
  shape(L, 160, 10, 'line5', '$');
  L.put(30, 30, 'f').put(64, 26, 'd').put(100, 28, 'f').put(138, 24, 'd').put(172, 22, 'f');
  L.on(44, 'J', 0).on(122, 'J', 0);
  trees.forEach(([x, c], i) => shape(L, x - 4, c - 3, i % 2 ? 'line5' : 'arc', i === 4 ? 'b' : 'o'));
  // Secret pocket inside the second canopy, under a butt-stomp lid.
  // (One column in from the canopy's edge, so the pocket is closed.)
  L.carve(50, 19, 4, 2).stomp(51, 18, 2, 1);
  L.put(51, 20, 'X').put(52, 20, '1');
  // Switch-block cage around an extra life on the fourth canopy.
  L.fill(122, 14, 5, 1, 'u').fill(122, 15, 1, 2, 'u').fill(126, 15, 1, 2, 'u');
  L.put(124, 16, '1').put(123, 16, 'g').put(125, 16, 'g');
  L.put(150, 15, 'C');
  L.put(192, 12, 'E');
  L.hint(186, 12, 'The highest canopy - the way out!');

  // ---- Glowing root caves under the floor: drop in through two holes,
  // springs carry you back up through two shafts.
  L.carve(4, 55, 190, 4);
  L.carve(36, L.surface(36, 40), 2, 55 - L.surface(36, 40));
  L.carve(128, L.surface(128, 40), 2, 55 - L.surface(128, 40));
  for (const x of [72, 172]) L.carve(x, L.surface(x, 40), 2, 55 - L.surface(x, 40)).put(x, 58, 'T');
  for (const x of [12, 46, 88, 112, 150, 184]) L.deco('glowshroom', x, 59, { v: x % 3 });
  for (const [x, n] of [[18, 'line5'], [56, 'hump'], [96, 'arc'], [140, 'hump'], [180, 'line5']]) over(L, x, 55, n, 'o', 2);
  shape(L, 24, 55, 'line5', '$').put(60, 58, '@');
  shape(L, 100, 55, 'line5', '$').put(160, 58, '@');
  L.on(50, 'G', 55).on(104, 'h', 55).on(146, 'k', 55);
  L.put(80, 55, 'f');
  L.put(116, 58, 'Y');
  L.hint(112, 58, 'The ! crate opens a cage\nhigh in the canopy.');
  L.on(30, 'Q', 55);
  // Root chamber behind a crack at the west end.
  L.breakable(8, 55, 1, 4);
  shape(L, 5, 56, 'line3', 'v');
  L.put(6, 58, 'X').put(5, 58, '%');
  L.warp(166, 58, 'coin7', 'bonus7', { cost: 20, label: 'COIN WARP!' });
  L.hint(162, 58, 'Coin Warp: 20 coins.');

  // ---- Bonus room sealed below the roots.
  L.carve(40, 62, 40, 4);
  L.warp(42, 65, 'bonus7');
  L.warp(78, 65, 'out7', 'back7');
  shape(L, 46, 62, 'ring', 'g');
  shape(L, 56, 62, 'ring', 'b');
  shape(L, 66, 62, 'ring', '*');
  L.floorRow(44, 77, 65, 'o', 3);
  L.put(61, 65, '1');

  // Pepper spray: ammo by the start, a crate, and a vault under the canopy.
  L.ammo(9, 49, 8).ammo(11, 49, 8).ammoCrate(14, 49, 8);
  weaponVault(L, 84, 49, 8, { loot: 'b' });
  // Vines through the canopy: hang on (jump into one) and climb hand over
  // hand, Run to go faster, Down to drop, Jump to leap off.
  L.vine(48, 39, 11);
  shape(L, 49, 40, 'line5', 'b');
  shape(L, 54, 40, 'line5', 'b');
  L.vine(88, 41, 9);
  L.hint(44, 41, 'VINES: jump up to grab one, then move along.\nDOWN lets go, JUMP leaps off.');
  return L.build({ name: 'Firefly Grove', theme: 'grove', music: 'jungle', horizon: 50, dark: { color: '8,4,32', amount: 0.5 } });
}
fireflyGrove.title = 'Firefly Grove';
fireflyGrove.tip = 'Climb the glowing trees and swing between their canopies.';
