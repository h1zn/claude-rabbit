import { Builder, over, shape, weaponVault } from './kit.js';

// Town: a street of houses you can enter and climb, rooftops above, a sky
// garden over the tallest roof, sewers under the street, and the clock tower
// at the east end, whose door is held shut by switch blocks.
export function carrotusTown() {
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
    for (let r = STREET - 4; r > roof + 2; r -= 3) L.plat(side++ % 2 ? x + 1 : x + w - 4, r, 3);
    L.plat(x + Math.floor(w / 2) - 1, roof, 2);
    if (k % 3 === 1) over(L, x + Math.floor(w / 2) - 2, roof - 3, 'hump', 'o', 2);
  });
  // Clock tower.
  L.block(196, 8, 8, STREET - 8);
  L.room(197, 9, 6, STREET - 9);
  L.fill(196, STREET - 3, 1, 3, 'u');
  for (let r = STREET - 4, side = 0; r > 10; r -= 3) L.plat(side++ % 2 ? 197 : 200, r, 3);
  L.plat(199, 8, 2);
  L.put(201, 7, 'E');
  L.hint(192, STREET - 1, 'The clock tower door is held by switch blocks.\nFind the ! crate somewhere below the street.');

  // Street.
  L.put(3, STREET - 1, 'P');
  L.hint(6, STREET - 1, 'Houses can be entered and climbed. Roofs, sewers\nand the sky all hide treasure. Exit: the clock tower.');
  ['arc', 'line5', 'hump', 'diamond'].forEach((n, i) => {
    for (let x = 7 + i * 11; x < 190; x += 44) over(L, x, STREET - 6, n, 'o', 2);
  });
  for (const x of [24, 52, 84, 115, 146, 178]) L.on(x, 'w', 30);
  for (const x of [40, 100, 162]) L.on(x, 'k', 30);
  for (const x of [70, 131, 190]) L.on(x, 'n', 30);
  L.put(70, STREET - 1, 'C');
  L.put(160, STREET - 1, 'C');
  L.warp(112, STREET - 1, 'back3');
  // Missiles: a crate on the street and more down the road.
  L.ammoCrate(10, 35, 4).ammo(20, 35, 4).ammo(58, 35, 4);
  // Alleys: springs and poles up to the roofs.
  L.put(39, STREET - 1, 'T').put(69, STREET - 1, 'T').put(132, STREET - 1, 'T').put(177, STREET - 1, 'T');
  L.put(101, 22, 'H').put(163, 22, 'H');
  L.plat(98, 23, 4).plat(161, 25, 3);
  // Gem lines over the roofs.
  for (const [x, w, roof] of houses) L.row(x + 1, roof - 3, w - 2, roof <= 20 ? 'g' : '*');
  for (const x of [57, 92, 123, 153]) L.on(x, 'J', 0);
  L.put(60, 15, 'f').put(124, 17, 'f').put(152, 15, 'd').put(30, 17, 'd');
  // A locked house: countdown blocks in its door.
  L.countdown(148, STREET - 3, 1, 3, 3).countdown(159, STREET - 3, 1, 3, 3);
  L.put(152, STREET - 1, '1').put(154, STREET - 1, '@').put(155, STREET - 1, '@');
  // Cellar under the street, behind a butt-stomp lid.
  L.stomp(113, STREET, 2, 1).carve(110, STREET + 1, 7, 3);
  L.row(111, STREET + 3, 5, 'g').put(113, STREET + 2, 'X').put(115, STREET + 3, 'F');
  L.hint(108, STREET - 1, 'Cracked street? Butt-stomp it!');

  // Sky garden over the tallest roof.
  L.put(91, 17, 'T');
  L.mass(84, 7, 6, 2).row(84, 6, 6, '$');
  L.plat(93, 5, 4).row(93, 4, 4, 'b');
  L.put(102, 4, 'H');
  L.mass(110, 7, 10, 2).row(111, 6, 6, 'g').put(117, 6, 'X').put(118, 6, '1');
  L.plat(124, 9, 4).put(125, 8, '@');
  L.put(100, 2, 'd');

  // Sewers, through manholes in the alleys; springs bring you back up.
  L.carve(0, 42, W, 5);
  // Manholes drop you in; separate exit shafts have a spring at the bottom.
  for (const x of [8, 50, 100, 160]) L.carve(x, STREET, 2, 6);
  for (const x of [32, 82, 140, 192]) L.carve(x, STREET, 2, 6).put(x, 46, 'T');
  for (let x = 12; x < 210; x += 30) over(L, x, 42, x % 60 < 30 ? 'arc' : 'hump', 'o', 2);
  for (const x of [30, 75, 130, 190]) L.on(x, 'h', 42);
  for (const x of [60, 145]) L.on(x, 'G', 42);
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
  L.floorRow(63, 97, 54, 'o', 3);
  L.put(80, 54, '1').put(81, 54, '@');

  for (const c of [20, 64, 140]) L.on(c, '+', 30);
  // A sewer vault that only a missile opens.
  weaponVault(L, 35, 46, 4, { loot: 'b' });
  L.hint(26, 46, 'This vault opens only to MISSILES.\nSelect them with C or 4.');
  // Schwartzenguard patrols the east end of the street.
  L.put(180, 35, 'V');
  return L.build({ name: 'Carrotus Town', theme: 'town', music: 'carrotus', horizon: STREET });
}
carrotusTown.title = 'Carrotus Town';
carrotusTown.tip = 'Enter the houses, run the rooftops, explore the sewers.';
