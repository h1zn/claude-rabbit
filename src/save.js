// Progress saved in the browser: unlocked levels, each level's best stars,
// score and time, the high score table, the named save slots, and the
// options (volumes, keys, video, language, difficulty). Storage can be unavailable (private
// windows, blocked site data), so every access is guarded and the game works
// without it.

const KEY = 'gemrush.save.v1';

// The three stars of every level.
export const MISSIONS = ['Reach the exit', 'Collect 75% of the gems', 'Find every secret'];

// Video: `scale` fit (fill the window) or pixel (whole multiples only);
// `filter` sharp or smooth; shake and flashes can be turned off.
// `size` is the share of the window the game fills (F3 / F4). `res`: the
// render resolution, 'auto' or 1-4 times 640x360. `gpu`: the WebGL effects
// (src/gpu.js), with their `upscale` (sharp, smooth, hd, crt) and `bloom`
// glow (off, low, high).
export const VIDEO_DEFAULTS = { scale: 'fit', filter: 'sharp', shake: true, flash: true, size: 1, res: 'auto', gpu: true, upscale: 'sharp', bloom: 'low' };

// The manual's difficulty levels: the higher, the more baddies.
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
// Continues per game (the manual: "You can only continue three times").
export const CONTINUES = 3;
export const SAVE_SLOTS = 8;
export const SCORE_ROWS = 10;
const NAME_MAX = 12;

// The table a new player sees, from Carrotus' own.
const SEED_SCORES = ['JAZZ', 'SPAZ', 'LORI', 'EVA', 'DEVAN', 'BILSY', 'BUBBA', 'QUEEN', 'ROBOT', 'TUF TURT']
  .map((name, i) => ({ name, score: (10 - i) * 5000, seed: true }));

function defaults() {
  return {
    unlocked: 1, levels: {}, scores: SEED_SCORES.map((r) => ({ ...r })), slots: [], difficulty: 'medium',
    options: { music: 0.7, sfx: 0.9, keys: null, keys2: null, lang: 'en', video: { ...VIDEO_DEFAULTS } },
  };
}

export function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && typeof data === 'object') {
      const options = { ...defaults().options, ...data.options };
      options.video = { ...VIDEO_DEFAULTS, ...(data.options && data.options.video) };
      const out = { ...defaults(), ...data, options };
      if (!Array.isArray(out.scores)) out.scores = defaults().scores;
      if (!Array.isArray(out.slots)) out.slots = [];
      if (!DIFFICULTIES.includes(out.difficulty)) out.difficulty = 'medium';
      return out;
    }
  } catch (e) { /* no storage: play without saving */ }
  return defaults();
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

// Stars for a finished level: exit, 75% of the gem value, every secret.
export function starsFor(stats) {
  return [true, stats.gems >= 75, stats.secrets >= 100];
}

// Merge a finished level into the save. Returns what improved, for the tally.
export function recordLevel(save, index, stats, score) {
  const old = save.levels[index] || { stars: [false, false, false], score: 0, seconds: null };
  const stars = starsFor(stats);
  const merged = {
    stars: stars.map((s, i) => s || old.stars[i]),
    score: Math.max(old.score, score),
    seconds: old.seconds === null ? stats.seconds : Math.min(old.seconds, stats.seconds),
  };
  save.levels[index] = merged;
  writeSave(save);
  return {
    stars,
    newStars: stars.map((s, i) => s && !old.stars[i]),
    bestScore: score > old.score,
    bestTime: old.seconds === null || stats.seconds < old.seconds,
  };
}

export function totalStars(save) {
  // Built-in levels only (classic JJ2 levels keep their stars separately).
  return Object.entries(save.levels).filter(([k]) => /^\d+$/.test(k)).reduce((n, [, l]) => n + l.stars.filter(Boolean).length, 0);
}

// A name as typed: capitals, digits and spaces (what the fonts can draw).
export function cleanName(name) {
  return String(name || '').toUpperCase().replace(/[^A-Z0-9 .!?-]/g, '').replace(/\s+/g, ' ').trimStart().slice(0, NAME_MAX);
}
export { NAME_MAX };

// ---------------------------------------------------------------- high scores

// The rank (0-based) a score would take in the table, or -1.
export function scoreRank(save, score) {
  if (!(score > 0)) return -1;
  const i = save.scores.findIndex((r) => score > r.score);
  if (i >= 0) return i;
  return save.scores.length < SCORE_ROWS ? save.scores.length : -1;
}

// Put a finished game in the table. Returns its rank, or -1.
export function addScore(save, entry) {
  const rank = scoreRank(save, entry.score);
  if (rank < 0) return -1;
  save.scores.splice(rank, 0, { ...entry, name: cleanName(entry.name) || 'JAZZ', date: new Date().toISOString().slice(0, 10) });
  save.scores.length = Math.min(save.scores.length, SCORE_ROWS);
  writeSave(save);
  return rank;
}

// ---------------------------------------------------------------- save slots

// Save a game in a slot. The game is kept as it was when its level began
// (score, lives, weapons), so loading starts that level over: like RESTART
// LEVEL, it can't be used to collect a level's gems twice.
export function saveSlot(save, i, slot) {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;   // local time
  save.slots[i] = { ...slot, name: cleanName(slot.name) || `GAME ${i + 1}`, date };
  writeSave(save);
}
