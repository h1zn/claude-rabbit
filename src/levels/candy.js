import { Builder, over, shape, weaponVault } from './kit.js';

// Sky level over a bottomless drop. A low route hops across frosted islands;
// a faster high route runs along cotton-candy clouds and swinging poles,
// reached by green springs. Gem rainbows arc over the gaps to show the jumps.
export function candyClouds() {
  const W = 250;
  const L = new Builder(W, 50);
  // Low-route islands: [x, top row, width].
  const islands = [[0, 34, 16], [24, 32, 10], [40, 35, 12], [60, 31, 8], [76, 33, 14], [100, 30, 10],
    [118, 34, 12], [140, 31, 10], [158, 33, 16], [182, 30, 10], [200, 32, 12], [220, 29, 30]];
  islands.forEach(([x, top, w]) => L.mass(x, top, w, 3));
  // Rainbow of gems over each gap, from one island's edge to the next.
  const RAINBOW = ['*', 'g', 'b', 'v', 'b', 'g', '*'];
  for (let i = 0; i + 1 < islands.length; i++) {
    const [x, top, w] = islands[i]; const [x2, top2] = islands[i + 1];
    const a = x + w; const n = x2 - a;
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n);
      const y = Math.round(Math.min(top, top2) - 2 - Math.sin(t * Math.PI) * 2);
      if (i % 3 === 1) L.put(a + k, y, RAINBOW[k % RAINBOW.length]);
    }
  }

  // ---- Low route.
  L.put(3, 33, 'P');
  L.hint(7, 33, 'Candy Clouds! Do not fall. Green springs lead up\nto a faster cloud route; gem rainbows show the jumps.');
  islands.forEach(([x, top, w], i) => {
    if (i === 0 || i === islands.length - 1) return;
    shape(L, x + Math.floor(w / 2) - 3, top - 4, i % 2 ? 'arc' : 'hump', 'o');
    if (w >= 12) shape(L, x + 1, top - 2, 'line3', 'o');
  });
  L.on(30, 'h').on(46, 'w').on(80, 'k').on(104, 'J').on(124, 'h').on(144, 'w').on(164, 'n').on(186, 'J').on(206, 'k');
  L.put(56, 24, 'd').put(96, 22, 'f').put(152, 22, 'd').put(196, 20, 'f');
  L.put(82, 32, 'C');
  L.put(164, 32, 'C');
  L.warp(168, 32, 'back8');
  L.on(110, '+').on(170, '+');
  shape(L, 62, 28, 'line5', '$');
  shape(L, 142, 28, 'line5', '$');
  shape(L, 101, 27, 'line5', '$');
  shape(L, 183, 27, 'line5', '$');
  shape(L, 26, 29, 'line5', '$');
  shape(L, 202, 29, 'line5', '$');

  // ---- High route: springs up, then clouds with a pole between each pair,
  // 3 rows above the next cloud so its fling lands on it.
  L.put(45, 34, 'T');
  const clouds = [[42, 7], [70, 6], [100, 8], [128, 6], [156, 6], [186, 6]];
  clouds.forEach(([x, w], i) => {
    L.plat(x, 24, w);
    shape(L, x + Math.floor(w / 2) - 2, 21, i % 2 ? 'hump' : 'line5', ['o', '$', 'g', 'o', 'b', '$'][i]);
    L.put(x + w + 5, 21, 'H');
  });
  L.put(123, 34, 'T');
  L.on(160, 'J', 20);
  // A green spring on one cloud reaches a lone sugar cloud (a secret).
  L.put(103, 23, 'T');
  L.plat(108, 12, 6);
  shape(L, 108, 9, 'line5', 'v');
  L.put(111, 11, 'X');

  // ---- Final island: exit, and a secret pocket under a butt-stomp lid.
  L.mass(220, 29, 30, 5);
  L.carve(232, 30, 6, 2).stomp(234, 29, 2, 1);
  shape(L, 232, 31, 'line5', 'g');
  L.put(237, 31, 'X').put(236, 30, '1');
  shape(L, 222, 26, 'arc', 'o');
  L.put(244, 28, 'E');
  L.hint(240, 28, 'You made it across!');
  L.warp(226, 28, 'coin8', 'bonus8', { cost: 20, label: 'COIN WARP!' });

  // ---- Bonus cloud far above the start, only reachable by Coin Warp.
  L.mass(2, 8, 24, 2);
  L.warp(3, 7, 'bonus8');
  L.warp(24, 7, 'out8', 'back8');
  shape(L, 6, 3, 'ring', 'g');
  shape(L, 12, 3, 'ring', 'b');
  shape(L, 18, 3, 'ring', 'v');
  L.floorRow(5, 23, 7, 'o', 3);
  L.put(15, 7, '1');

  // Bouncer power-up: purple balls that bounce further and faster.
  L.ammo(9, 33, 2).ammo(11, 33, 2).powerup(14, 33, 2);
  // Moving platforms circle over the gaps between the cloud islands, and
  // one swings below a hook in the sky.
  L.movingPlatform(72, 29, { length: 3, speed: 3, type: 4 });
  L.movingPlatform(115, 30, { length: 3, speed: -3, type: 4, sync: 2 });
  L.movingPlatform(139, 24, { length: 5, speed: 3, swing: true, type: 4 });
  L.movingPlatform(178, 28, { length: 3, speed: 3, type: 4, sync: 1 });
  return L.build({ name: 'Candy Clouds', theme: 'candy', music: 'meadow', horizon: 34 });
}
candyClouds.title = 'Candy Clouds';
candyClouds.tip = 'A long way down! Springs lead to a faster cloud route.';
