// The level list. Each level is a function that builds a fresh Level; its
// `title` and `tip` show on the level card. Designs live in src/levels/.

import { candyClouds } from './levels/candy.js';
import { carrotusTown } from './levels/town.js';
import { crystalCaverns } from './levels/caverns.js';
import { dungeonEscape } from './levels/dungeon.js';
import { lavaForge } from './levels/forge.js';
import { frostfallRidge } from './levels/frostfall.js';
import { fireflyGrove } from './levels/grove.js';
import { sunnySpires } from './levels/sunny.js';
import { tubelectric } from './levels/tube.js';

export const LEVELS = [sunnySpires, dungeonEscape, carrotusTown, frostfallRidge, fireflyGrove, candyClouds, tubelectric, lavaForge, crystalCaverns];
