// Game event -> sound file number (assets/sfx/soundN.wav). These are best
// guesses from measuring each file (length, pitch movement, noisiness);
// check them by ear on dev/sounds.html and swap numbers here.
export const SFX_MAP = {
  shoot: 20, spread: 21,
  jump: 17, land: 2,
  stompStart: 8, stompLand: 1, uppercutCharge: 22, uppercut: 16,
  // hit, kill, stomp and spring are synthesized (audio.js): samples 3 and 4
  // are voices and made defeating an enemy sound like the hero getting hurt.
  blob: 15,
  gem: 14, coin: 9, food: 11, berry: 15, crate: 6, break: 13,
  hurt: 7, death: 5, gameover: 5,
  checkpoint: 12, rush: 16, sign: 0, secret: 10, fanfare: 0,
  card: 12, menu: 20, select: 8, denied: 2, pause: 23, tally: 20, rank: 9,
};

export const SFX_COUNT = 25;
