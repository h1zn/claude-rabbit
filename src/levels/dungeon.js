import { Builder, over, rng, weaponVault } from './kit.js';

// Castle tower: nine floors, each a corridor between two-tile stone bands.
// Holes alternate ends, with a ledge under each, so the climb zigzags; springs,
// poles and a pole lift give shortcuts, and blocks bar some corridors.
export function dungeonEscape() {
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
  // Snack groups along a corridor (t = band above; Kip stands on row t + 7).
  const SNACKS = ['arc', 'hump', 'line5', 'diamond'];
  let snack = 0;
  const corridor = (t, x0, x1, every = 40) => {
    for (let x = x0; x < x1 - 4; x += every) over(L, x, t + 2, SNACKS[snack++ % SNACKS.length], 'o', 2);
  };

  // Dungeon (stand row 73).
  L.put(4, 73, 'P');
  L.hint(7, 73, 'Thrown in the dungeon! Climb out of the castle.\nHoles in the ceiling lead up a floor.');
  corridor(66, 8, 120);
  L.on(30, 'w', 68).on(60, 'h', 68).on(95, 'w', 68).put(80, 68, 'f');
  L.row(40, 70, 4, '*').row(70, 70, 4, '*');
  // TNT: a crate, two more sticks, and a vault that only a blast opens.
  L.ammoCrate(110, 73, 7).ammo(64, 73, 7).ammo(100, 73, 7);
  weaponVault(L, 132, 73, 7, { h: 3, loot: 'g' });
  L.put(135, 72, '%');
  L.hint(125, 73, 'TNT BLOCK: only an explosion opens it.\nPick TNT (C or 7), drop it, stand back!');
  // Pole lift: a vertical pole under a shaft through two floors.
  L.carve(66, 66, 3, 2).carve(66, 58, 3, 2).put(67, 70, 'I');
  L.put(67, 62, '$').put(67, 56, '$');

  // Floor 66 corridor (stand 65): countdown wall.
  corridor(58, 20, 122);
  L.countdown(80, 60, 1, 6, 2);
  L.hint(84, 65, 'Countdown blocks: the number is\nhow many hits each one needs.');
  L.on(100, 'G', 60).on(50, 'w', 60).put(40, 60, 'f');
  L.row(86, 62, 5, 'g');
  L.on(30, '+', 60);

  // Floor 58 corridor (stand 57): the switch crate.
  corridor(50, 20, 120);
  L.put(30, 57, 'Y');
  L.hint(26, 57, 'Shoot the ! crate. Somewhere above,\na switch wall will open.');
  L.on(60, 'h', 52).on(90, 'G', 52);
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
  L.carve(89, 34, 3, 2).put(90, 41, 'T');
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
  L.on(90, 'n', 28).on(110, 'G', 28);

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
  L.floorRow(96, 129, 7, 'o', 3);
  L.put(110, 7, '1').put(111, 7, '@').put(112, 7, '@');

  for (let y = 10; y < 74; y += 16) L.deco('candles', 70, y + 2);
  return L.build({ name: 'Dungeon Escape', theme: 'castle', music: 'castle' });
}
dungeonEscape.title = 'Dungeon Escape';
dungeonEscape.tip = 'Climb the castle: holes in each ceiling lead up a floor.';
