import { ammoOn, Builder, dress, over, shape, weaponVault } from './kit.js';

// Beach: three layers of ground with open caves between them (back wall below
// row 26), sky islands linked by swinging poles, and the exit plateau in the
// east, reached only with the blue spring at the bottom of the canyon (its
// door opens with the ! crate on the bottom floor).
export function sunnySpires() {
  const L = new Builder(200, 56);
  L.wall(0, 26, 186, 30);
  L.profile([[0, 22], [26, 22], [30, 18], [40, 18], [44, 22], [70, 22]], 4);
  L.profile([[76, 22], [100, 22], [104, 20], [118, 20], [122, 22], [150, 22]], 4);
  L.profile([[10, 34], [28, 34]], 4);
  L.profile([[35, 32], [60, 32], [64, 30], [80, 30], [84, 32], [120, 32]], 4);
  L.profile([[127, 32], [165, 32]], 4);
  L.profile([[0, 46], [50, 46], [54, 42], [90, 42], [94, 46], [140, 46], [146, 40], [186, 40]]);
  L.ground(186, 200, 24);
  // The ground under the two hills (the back wall starts lower down).
  L.fill(27, 22, 16, 4, '#').fill(101, 24, 20, 2, '#');
  // A wall up to the sky in front of the plateau, so it can't be glided onto.
  L.block(185, 0, 1, 24);

  // ---- Upper ground.
  L.put(3, 21, 'P');
  L.hint(6, 21, 'Explore everywhere! Three layers of ground,\nsky islands, secrets and a Coin Warp.');
  over(L, 9, 0, 'arc', 'o', 2);
  shape(L, 16, 18, 'line3', '*');
  L.ammoCrate(20, 21, 2);                              // bouncer ammo
  ammoOn(L, 13, 2).ammo(15, 21, 2);
  L.on(24, 'w');
  L.put(38, 17, 'S');                                   // spring to the sky islands
  over(L, 32, 0, 'hump', 'o', 2);
  L.on(48, 'h');
  over(L, 54, 0, 'arc', 'o', 2);
  L.on(60, 'k');
  over(L, 125, 0, 'arc', 'o', 2);
  over(L, 143, 0, 'arc', 'o', 2);
  // A hole to the middle band, marked by a gem arrow pointing down.
  shape(L, 71, 15, 'arrowUp', '*');
  L.on(84, 'w');
  over(L, 86, 0, 'line5', 'o', 2);
  // Stash on the hilltop: stone roof and back wall, speed blocks in front.
  L.block(107, 15, 8, 1).block(114, 16, 1, 4).speedBlocks(107, 16, 1, 4);
  L.put(109, 19, '@').put(110, 19, 'F').put(111, 19, '@').put(112, 19, 'g');
  L.hint(92, 21, 'Speed blocks break when you\nRUN into them at full speed.');
  // A one-way lid over a shaft down, with ledges below it.
  L.plat(97, 22, 3).carve(97, 23, 3, 3).plat(97, 25, 3).plat(95, 28, 5);
  L.on(120, 'h');
  L.put(124, 21, 'C');
  L.stomp(132, 22, 2, 1).carve(132, 23, 2, 3);
  L.hint(129, 21, 'Cracked floor: JUMP, then DOWN to butt-stomp.');
  L.on(140, 'n');
  L.on(148, 'J');
  over(L, 136, 0, 'hump', 'o', 2);
  L.put(144, 16, 'f');

  // ---- Sky islands, poles between them.
  L.mass(40, 11, 7, 2);
  shape(L, 41, 9, 'line5', '*');
  L.mass(50, 12, 5, 2);
  shape(L, 50, 9, 'hump', 'o');
  L.put(59, 10, 'H');
  L.mass(65, 12, 5, 2);
  shape(L, 65, 10, 'line5', '$');
  L.put(68, 6, 'd');
  L.plat(73, 10, 4);
  shape(L, 73, 8, 'hump', 'g');
  L.put(80, 9, 'H');
  L.mass(87, 11, 7, 2);
  shape(L, 88, 8, 'diamond', 'o');
  L.plat(98, 12, 4).put(99, 11, '@');
  L.put(107, 8, 'H');
  L.mass(114, 10, 10, 3);
  shape(L, 115, 8, 'line3', 'b');
  L.put(120, 9, 'X').put(122, 9, '1');
  L.put(92, 10, 'J');

  // ---- Middle band.
  L.put(5, 45, 'T');      // green spring from the bottom past the band's west end
  // A stomp-block lid over a secret pocket inside the band's west part.
  L.carve(14, 35, 8, 2).stomp(17, 34, 2, 1);
  shape(L, 15, 36, 'line5', 'g');
  L.put(19, 35, 'X');
  over(L, 40, 28, 'arc', 'o', 2);
  L.on(44, 'w', 30);
  L.put(52, 27, 'f');
  shape(L, 64, 26, 'ring', 'g');
  L.on(70, 'h', 28);
  L.on(77, '+', 28);
  L.on(90, 'k', 30);
  over(L, 100, 28, 'arc', 'o', 2);
  L.on(112, 'w', 30);
  L.on(118, 'J', 30);
  over(L, 130, 28, 'line5', 'o', 2);
  L.on(138, 'n', 30);
  L.warp(150, 31, 'coin1', 'bonus1', { cost: 20, label: 'COIN WARP!' });
  L.hint(146, 31, 'Coin Warp: bring 20 coins.');
  L.on(160, 'Q', 30);

  // ---- Bottom.
  shape(L, 12, 43, 'line5', '$');
  over(L, 22, 40, 'arc', 'o', 2);
  L.on(30, 'h', 40);
  // Bouncer vault: a weapon block opens only to the gun on its face.
  weaponVault(L, 34, 45, 2, { h: 3, loot: 'g' });
  L.put(37, 44, '@');
  L.hint(25, 45, 'WEAPON BLOCK: only the gun shown breaks it.\nC / TAB (or 1-9) changes weapon.');
  over(L, 40, 40, 'hump', 'o', 2);
  L.put(60, 41, 'Y');
  L.hint(63, 41, 'Shoot the ! crate to flip\nthe switch blocks.');
  L.on(68, 'w', 40);
  // Ghost-block stair (solid once the switch flips) up into the hollow
  // under the middle band, where coins wait.
  L.fill(70, 40, 2, 1, 'i').fill(73, 38, 2, 1, 'i').fill(76, 36, 2, 1, 'i');
  shape(L, 72, 35, 'line5', '$');
  L.on(100, 'G', 40);
  // Switch-block vault.
  L.fill(107, 38, 7, 1, 'u').fill(107, 39, 1, 3, 'u').fill(113, 39, 1, 3, 'u');
  shape(L, 108, 41, 'line5', 'g');
  L.put(110, 40, '1');
  L.put(118, 37, 'H');
  over(L, 124, 40, 'arc', 'o', 2);
  L.on(130, 'n', 40);
  L.countdown(150, 37, 1, 3, 3);
  L.carve(151, 37, 4, 3).put(152, 39, '@').put(153, 39, '%');
  over(L, 158, 36, 'line5', 'o', 2);
  L.on(164, 'w', 36);
  over(L, 60, 40, 'arc', 'o', 2);
  over(L, 140, 40, 'arc', 'o', 2);
  L.put(172, 39, 'C');
  L.warp(174, 39, 'back1');
  // The canyon: a switch-block door (the ! crate opens it), the blue spring
  // and a shaft up to the plateau.
  L.carve(186, 36, 3, 4).carve(187, 24, 2, 12).fill(186, 36, 1, 4, 'u');
  L.put(188, 39, 'U');
  L.hint(176, 39, 'A blue spring behind the switch door!\nShoot the ! crate to open it.');
  L.put(188, 33, 'g').put(188, 28, 'g').put(188, 25, 'b');
  over(L, 190, 0, 'line5', 'o', 2);
  L.put(196, 23, 'E');

  // ---- Bonus room inside the plateau, only reachable through the Coin Warp.
  L.carve(190, 29, 9, 5);
  L.warp(191, 33, 'bonus1');
  L.warp(197, 33, 'out1', 'back1');
  shape(L, 192, 30, 'ring', '*');
  shape(L, 195, 30, 'ring', 'g');
  L.floorRow(192, 196, 33, 'o', 2);
  L.put(194, 33, '1');

  // A rock pool on the bottom floor with treasure on its floor: dive in,
  // swim (Up / Down, Run to go faster) and leap out at the surface. (Carved
  // before the dressing, so no rock floats over it.)
  L.carve(115, 46, 11, 4).pool(115, 46, 11, 4);
  for (const c of [8, 60, 128]) L.onGround(c, '+');
  const BEACH = ['shell', 'plant', 'plant', 'rock', 'plant'];
  dress(L, BEACH, 2, 150, 0, 11, 7);
  dress(L, BEACH, 12, 165, 27, 12, 8);
  dress(L, BEACH, 2, 186, 37, 13, 8);
  for (let x = 116; x <= 124; x += 2) L.put(x, 49, 'b');
  L.put(120, 48, '%');
  L.hint(112, 45, 'A rock pool! Dive in and swim (UP / DOWN).\nJUMP at the surface to leap out.');
  L.item(163, 31, 'stopwatch');                // extra time for the fire shield next to it
  return L.build({ name: 'Shipwreck Shores', theme: 'meadow', music: 'beach', horizon: 22 });
}
sunnySpires.title = 'Shipwreck Shores';
sunnySpires.tip = 'Explore! Three layers of ground, sky islands and a Coin Warp.';
