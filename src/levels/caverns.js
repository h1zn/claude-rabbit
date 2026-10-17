import { Builder, rng, roomMaze } from './kit.js';

// Dark caverns: an irregular room maze lit only around Kip and glowing things.
export function crystalCaverns() {
  const L = new Builder(198, 72);
  const M = roomMaze(L, { cols: 9, rows: 6, cw: 22, ch: 12, seed: 7, start: [0, 0], bonus: [8, 5], irregular: true, enemies: ['h', 'k', 'w', 'n', 'G', 'J'], theme: 'cave' });
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
  L.floorRow(B.x0 + 2, B.x1 - 1, B.floor - 1, 'o', 3);
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
