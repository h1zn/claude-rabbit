// Per-tick rules of original JJ2 levels that aren't movement: light zones
// (ambient darkness), water-level triggers and collapsing platforms.

import { TILE } from '../config.js';
import { eventFields } from './files.js';
import { EV } from './level.js';

export function jj2Tick(game) {
  const level = game.level;
  const p = game.player;
  if (!p.dead) {
    const id = level.areaAt(p.cx, p.cy);
    if (id !== EV.TRIGGER_ZONE) level.zoneCell = -1;
    const params = level.areaParam(p.cx, p.cy);
    if (id === EV.LIGHT_SET) {
      const [intensity] = eventFields(params, [7]);
      level.lightTarget = Math.min(1, intensity / 100);
    } else if (id === EV.LIGHT_RESET) {
      level.lightTarget = Math.min(1, level.file.startLight / 64);
    } else if (id === EV.TRIGGER_ZONE) {
      // A trigger zone sets (or, as a switch, flips) a trigger once per visit.
      const cell = Math.floor(p.cy / TILE) * level.w + Math.floor(p.cx / TILE);
      if (level.zoneCell !== cell) {
        const [tid, setOn, toggle] = eventFields(params, [5, 1, 1]);
        if (level.setTrigger(tid, toggle ? !level.triggerState.has(tid) : !!setOn)) game.audio.play('checkpoint');
      }
      level.zoneCell = cell;
    } else if (id === EV.SET_WATER) {
      const [height, instant] = eventFields(params, [8, 1]);
      level.waterTarget = height * TILE;
      if (instant || level.water === Infinity) level.water = level.waterTarget;
    }
    // Collapsing scenery gives way after being stood on for 30 ticks.
    if (p.onGround && level.collapse.size) {
      const ty = Math.floor((p.y + p.h + 2) / TILE);
      for (const tx of new Set([Math.floor((p.cx - 6) / TILE), Math.floor((p.cx + 6) / TILE)])) {
        if (tx < 0 || tx >= level.w) continue;
        const i = ty * level.w + tx;
        if (!level.collapse.has(i)) continue;
        const t = level.collapse.get(i) + 1;
        level.collapse.set(i, t);
        if (t >= 30) game.hitTile(tx, ty, { collapse: true });
      }
    }
  }
  if (level.water !== level.waterTarget && level.water !== Infinity) {
    level.water += Math.sign(level.waterTarget - level.water) * Math.min(1, Math.abs(level.waterTarget - level.water));
  }
  level.ambient += Math.sign(level.lightTarget - level.ambient) * Math.min(0.01, Math.abs(level.lightTarget - level.ambient));
  const amount = (1 - level.ambient) * 0.86;
  level.meta.dark = amount > 0.03 ? { color: '0,0,0', amount } : null;
}
