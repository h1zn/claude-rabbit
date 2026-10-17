import { Builder, ladder, over, shape } from './kit.js';

// Descent into a volcano: from the crater rim down through four chambers to
// the forge heart. Lava sits at the bottom of pits (it burns and throws you
// out, like spikes). Each chamber's way down is at the opposite end.
export function lavaForge() {
  const W = 150;
  const L = new Builder(W, 90);
  L.fill(0, 12, W, 78, '#');
  L.wall(0, 12, W, 78);
  // Lava in a pit: carve the pit `depth` rows deep and fill its bottom row.
  const pit = (x, y, w, depth = 2) => L.carve(x, y, w, depth).lavaPool(x, y + depth - 1, w);

  // ---- Crater rim (open sky, floor row 12).
  L.put(3, 11, 'P');
  L.hint(6, 11, 'Into the volcano! Lava burns, so keep moving.\nEach chamber’s way down is at the far end.');
  over(L, 12, 0, 'arc', 'o', 2);
  over(L, 30, 0, 'hump', 'o', 2);
  L.on(40, 'w', 0).on(52, 'J', 0);
  // A high ledge over the rim, reached with a red spring: a secret.
  L.put(20, 11, 'S');
  L.mass(24, 5, 6, 1);
  shape(L, 24, 3, 'line5', 'v');
  L.put(27, 4, 'X');
  L.carve(70, 12, 4, 2);                        // crater hole down
  shape(L, 70, 6, 'arrowUp', '*');

  // ---- Chamber 1 (rows 14-26, floor 27): two lava pits, a pole over the
  // second, the Coin Warp, and the way down at the east end.
  L.carve(2, 14, 146, 13);
  pit(20, 27, 14);
  pit(88, 27, 22);
  L.put(94, 23, 'H');
  shape(L, 97, 23, 'line5', '*').put(105, 23, 'b');
  for (const [x, n] of [[8, 'hump'], [40, 'arc'], [60, 'line5'], [76, 'hump'], [116, 'arc']]) over(L, x, 14, n, 'o', 2);
  L.on(44, 'G', 14).on(64, 'n', 14).on(120, 'w', 14).put(84, 16, 'f');
  L.plat(36, 22, 6).put(38, 21, '$').put(39, 21, '$');
  L.plat(52, 20, 5).row(53, 19, 3, '$');
  L.put(76, 26, 'C');
  L.warp(79, 26, 'back9');
  L.warp(124, 26, 'coin9', 'bonus9', { cost: 20, label: 'COIN WARP!' });
  L.hint(120, 26, 'Coin Warp: 20 coins.');
  L.carve(134, 27, 4, 3);                       // down to chamber 2
  L.deco('torch', 10, 22).deco('torch', 60, 22).deco('torch', 112, 22);

  // ---- Chamber 2 (rows 30-43, floor 44): a lava river with stepping
  // stones, a ledge chain above it, the switch crate on the middle stone,
  // and the way down at the west end.
  L.carve(2, 30, 146, 14);
  L.carve(16, 44, 104, 1).lavaPool(16, 45, 104);
  for (let x = 22; x < 118; x += 9) L.fill(x, 44, 3, 1, '#');
  for (let x = 30; x < 112; x += 18) L.plat(x, 38, 5);
  L.put(76, 43, 'Y');
  L.hint(72, 43, 'The ! crate builds a bridge\nover the lava lake below.');
  for (const [x, n] of [[34, 'line3'], [52, 'hump'], [88, 'line3'], [106, 'hump']]) shape(L, x, 34, n, 'o');
  shape(L, 66, 34, 'line5', '$');
  L.on(128, 'k', 30).on(10, 'G', 30).put(60, 33, 'd').put(100, 33, 'f');
  over(L, 128, 30, 'arc', 'o', 2);
  // Pocket behind a crack in the west wall.
  L.carve(0, 40, 2, 4).breakable(2, 40, 1, 4);
  L.put(0, 43, 'X').put(1, 43, '1');
  L.carve(6, 44, 4, 4);                         // down to chamber 3
  L.on(130, 'Q', 30);
  L.deco('torch', 130, 38).deco('torch', 20, 38);

  // ---- Chamber 3 (rows 48-61, floor 62): a lava lake. Poles fling Kip to
  // stone pillars; after the switch, a ghost bridge spans the lake.
  L.carve(2, 48, 146, 14);
  L.carve(14, 62, 114, 1).lavaPool(14, 63, 114);
  for (const x of [40, 70, 100]) L.fill(x, 58, 3, 4, '#');
  for (const x of [24, 50, 80, 110]) L.put(x, 56, 'H');
  L.fill(14, 58, 26, 1, 'i').fill(43, 58, 27, 1, 'i').fill(73, 58, 27, 1, 'i').fill(103, 58, 25, 1, 'i');
  for (const x of [40, 70, 100]) shape(L, x, 54, 'line3', 'g');
  shape(L, 26, 52, 'line5', '$');
  shape(L, 84, 52, 'line5', 'o');
  L.put(55, 50, 'd').put(90, 50, 'f');
  for (const [x, n] of [[4, 'hump'], [134, 'arc']]) over(L, x, 48, n, 'o', 2);
  L.put(134, 61, 'C');
  L.on(144, 'G', 48);
  L.carve(140, 62, 4, 4);                       // down to the forge
  L.deco('torch', 6, 56).deco('torch', 138, 56);

  // ---- Chamber 4, the forge heart (rows 66-81, floor 82): lava channels,
  // forge guards, a countdown gate, and the exit in the far west.
  L.carve(2, 66, 146, 16);
  for (const x of [120, 96, 72]) pit(x, 82, 3);
  L.countdown(46, 76, 1, 6, 2);
  for (const [x, n] of [[130, 'arc'], [108, 'hump'], [84, 'arc'], [60, 'line5'], [30, 'hump']]) over(L, x, 66, n, 'o', 2);
  L.on(126, 'n', 66).on(104, 'G', 66).on(80, 'n', 66).on(56, 'w', 66).put(90, 70, 'd');
  L.plat(100, 76, 6).put(102, 75, '@');
  shape(L, 62, 78, 'line5', '$');
  L.put(20, 81, 'E');
  L.hint(26, 81, 'The forge heart - you made it!');
  shape(L, 10, 76, 'ring', 'b');
  for (const x of [10, 40, 70, 100, 130]) L.deco('torch', x, 76);

  // ---- Bonus room sealed below the forge.
  L.carve(50, 84, 40, 4);
  L.warp(52, 87, 'bonus9');
  L.warp(88, 87, 'out9', 'back9');
  shape(L, 56, 84, 'ring', '*');
  shape(L, 66, 84, 'ring', 'g');
  shape(L, 76, 84, 'ring', 'b');
  L.floorRow(54, 87, 87, 'o', 3);
  L.put(71, 87, '1');

  return L.build({ name: 'Lava Forge', theme: 'forge', music: 'castle', horizon: 12, dark: { color: '22,4,2', amount: 0.55 } });
}
lavaForge.title = 'Lava Forge';
lavaForge.tip = 'Down into the volcano. Lava burns - poles and pillars cross it.';
