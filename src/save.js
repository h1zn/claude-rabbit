// Progress saved in the browser: unlocked levels, each level's best stars,
// score and time, and the sound options. Storage can be unavailable (private
// windows, blocked site data), so every access is guarded and the game works
// without it.

const KEY = 'gemrush.save.v1';

// The three stars of every level.
export const MISSIONS = ['Reach the exit', 'Collect 75% of the gems', 'Find every secret'];

function defaults() {
  return { unlocked: 1, levels: {}, options: { music: 0.7, sfx: 0.9 } };
}

export function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && typeof data === 'object') return { ...defaults(), ...data, options: { ...defaults().options, ...data.options } };
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
  return Object.values(save.levels).reduce((n, l) => n + l.stars.filter(Boolean).length, 0);
}
