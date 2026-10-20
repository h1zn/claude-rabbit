import { Builder, ladder, over, scenery, weaponVault } from './kit.js';

// Mountain climb: the surface rises in slopes and cliffs to the summit exit;
// ice caves inside the mountain give other ways up.
export function frostfallRidge() {
  const L = new Builder(170, 80);
  L.profile([[0, 72], [24, 72], [32, 64], [44, 64], [50, 58], [62, 58]]);
  L.ground(62, 80, 50);
  L.profile([[80, 50], [90, 50], [98, 42], [110, 42]]);
  L.ground(110, 130, 32);
  L.profile([[130, 32], [140, 32], [150, 22], [160, 22]]);
  L.ground(160, 170, 12);

  // Foot of the mountain.
  L.put(3, 71, 'P');
  L.hint(6, 71, 'The summit is the way out.\nThe mountain has an inside, too.');
  L.arc(8, 69, 7, 'o', 1);
  L.on(20, 'w').on(36, 'k').on(48, 'h');
  // On the ground (a fixed row cut into the slope and left a pit).
  for (let x = 26; x < 31; x++) L.on(x, '*');
  L.put(60, 57, 'T');
  L.hint(56, 57, 'Up the cliff... or through it?');

  // Cave 1 under the foot: hole in, spring and shaft out.
  L.carve(14, 72, 2, 3).carve(4, 75, 44, 4);
  for (const x of [10, 22, 34]) over(L, x, 75, 'hump', 'o', 2);
  L.on(25, 'h', 75).put(30, 75, 'f');
  L.row(18, 76, 6, '$');
  L.carve(40, 64, 2, 11).put(40, 78, 'U');
  L.breakable(8, 75, 1, 4);
  L.row(4, 78, 3, 'g').put(5, 77, 'X').put(6, 76, '1');

  // Cave 2 inside the first cliff, with a countdown wall and the ! crate.
  L.carve(62, 54, 26, 4);
  over(L, 64, 54, 'arc', 'o', 2);
  over(L, 78, 54, 'hump', 'o', 2);
  L.countdown(75, 54, 1, 4, 2);
  L.put(70, 57, 'Y').on(80, 'k', 54);
  L.hint(66, 57, 'Deep inside the mountain, a vault waits\nfor this crate.');
  L.carve(86, 50, 3, 4).plat(86, 54, 3);

  // Ridge up to the second cliff and its vertical pole.
  L.on(84, 'C');                 // on the ridge beside the shaft, not in it
  L.on(82, 'w').on(96, 'J');
  L.row(64, 46, 6, '$').row(144, 18, 4, '$');
  L.row(100, 39, 6, 'g');
  L.put(108, 37, 'I');
  L.hint(102, 41, 'Grab the pole and hold on tight.');
  L.put(95, 36, 'd');
  // Sky ledges over the ridge.
  L.plat(84, 40, 4).row(84, 39, 4, 'o');
  L.plat(90, 34, 3).put(91, 33, '@');

  // Cave 3: butt-stomp in from the ridge; coin warp, switch vault, shaft up.
  L.stomp(104, 42, 2, 1).carve(104, 43, 2, 3);
  L.carve(100, 46, 40, 5);
  for (const x of [106, 116, 130]) over(L, x, 46, 'hump', 'o', 2);
  L.on(112, 'h', 46).on(124, 'G', 46).put(118, 46, 'f');
  L.warp(102, 50, 'coin4', 'bonus4', { cost: 20, label: 'COIN WARP!' });
  L.fill(126, 47, 1, 4, 'u').fill(131, 47, 1, 4, 'u');
  L.row(127, 50, 4, 'b').put(128, 48, '1');
  L.carve(134, 32, 3, 14);
  ladder(L, 134, 3, 32, 46, 4);
  L.row(108, 48, 5, '$');

  // Upper slopes to the summit.
  L.put(140, 31, 'C');
  L.warp(138, 31, 'back4');
  L.on(116, 'k').on(146, 'w').on(154, 'J');
  for (let x = 142; x < 147; x++) L.on(x, 'g');
  L.put(157, 21, 'T');
  L.hint(153, 21, 'Not all springs are equal.');
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
  L.floorRow(114, 126, 64, 'o', 2);
  L.put(119, 64, '1').put(120, 64, '@');

  for (const c of [12, 66, 132]) L.onGround(c, '+');
  for (const [x, n] of [[14, 'arc'], [26, 'hump'], [44, 'arc'], [52, 'line3'], [70, 'hump'], [100, 'arc'], [112, 'line5'], [132, 'arc'], [150, 'hump'], [122, 'hump'], [142, 'arc'], [164, 'line3']]) over(L, x, 0, n, 'o', 2);
  over(L, 68, 54, 'line3', '$', 2);
  scenery(L, ['snowPine', 'snowPine'], 1, 160, 31, 6);
  // Frostbiter: ammo by the start, a crate, and a cave vault only ice opens.
  L.ammo(8, 71, 3).ammo(9, 71, 3).ammoCrate(17, 71, 3);
  weaponVault(L, 42, 78, 3, { w: 6, loot: 'g' });
  L.hint(34, 78, 'Ice blocks shrug off most guns.\nFight cold with cold. (3)');
  return L.build({ name: 'Frostfall Ridge', theme: 'winter', music: 'winter', horizon: 50 });
}
frostfallRidge.title = 'Frostfall Ridge';
frostfallRidge.tip = 'Climb the mountain - the ice caves inside lead up too.';
