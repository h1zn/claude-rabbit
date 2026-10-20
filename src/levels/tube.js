import { Builder, rng, roomMaze, weaponVault } from './kit.js';

export function tubelectric() {
  const L = new Builder(160, 66);
  const M = roomMaze(L, { cols: 8, rows: 6, cw: 20, ch: 11, seed: 42, start: [0, 5], bonus: [7, 0], enemies: ['w', 'k', 'n', 'h', 'G', 'J'], theme: 'tube' });
  const S = M.startRoom;
  const at = (R, ch, from = 1, dir = 1) => L.put(M.spot(R, from, dir), R.floor - 1, ch);
  at(S, 'P');
  L.hint(M.spot(S, 4), S.floor - 1, 'A maze of circuits. Warp tubes join far rooms;\nmap them, the exit is a long way round.');
  const E = M.exit;
  at(E, 'E', 2, -1);
  for (const R of M.deadEnds) L.put(Math.floor((R.x0 + R.x1) / 2), R.floor - 3, 'X').row(R.x0 + 2, R.floor - 2, 4, 'b').put(M.spot(R, 2, -1), R.floor - 1, '1');
  // Switch crate in the start room, checkpoints along the way.
  at(S, 'Y', 2, -1);
  const mid = M.rooms.filter((R) => !R.warped && R !== S && R !== E && !M.deadEnds.includes(R) && R !== M.bonusRoom);
  const cps = [mid[12], mid[30]];
  for (const R of cps) at(R, 'C', 2);
  L.warp(M.spot(cps[0], 5), cps[0].floor - 1, 'back5');
  at(mid[20], 'N', 3);                         // plasma shield: Whammo Ammo sprays
  at(mid[15], 'M', 3);                         // Quick Change monitor
  at(mid[8], 'F', 3);
  at(mid[25], '%', 3);
  L.warp(M.spot(mid[5], 2), mid[5].floor - 1, 'coin5', 'bonus5', { cost: 25, label: 'COIN WARP!' });
  const B = M.bonusRoom;
  L.warp(B.x0 + 1, B.floor - 1, 'bonus5');
  L.warp(B.x1 - 1, B.floor - 1, 'out5', 'back5');
  L.row(B.x0 + 3, B.floor - 3, B.x1 - B.x0 - 5, '*').row(B.x0 + 3, B.floor - 4, B.x1 - B.x0 - 5, 'g');
  L.floorRow(B.x0 + 2, B.x1 - 1, B.floor - 1, 'o', 3);
  L.put(B.x0 + 8, B.floor - 1, '1');
  for (const R of M.rooms) if ((R.x + R.y) % 3 === 0) L.deco(R.x % 2 ? 'column' : 'flame', R.x0 + 1, R.floor);
  // Electro-blaster: ammo, a crate and a vault in the first corridor.
  L.ammo(10, 63, 9).ammo(12, 63, 9).ammoCrate(30, 63, 9);
  weaponVault(L, 41, 63, 9, { loot: 'g' });
  // The Robot drops into the exit room.
  L.put(110, 30, 'R');
  return L.build({ name: 'Tubelectric', theme: 'tube', music: 'winter' });
}
tubelectric.title = 'Tubelectric';
tubelectric.tip = 'A maze of rooms and warp tubes. The exit ends the longest path!';
