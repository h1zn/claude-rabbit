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

// Named sound files (assets/sfx/<name>.wav, from new/Sounds/): these play
// in place of the numbered samples and synthesized sounds above.
export const SFX_FILES = {
  shoot: 'blaster', shootPower: 'blaster_power', robotGun: 'robot_gun', gem: 'gem',
  // Jazz's voice (played only when Jazz is the hero).
  jazzHey: 'jazz_hey', jazzBalance: 'jazz_balance', jazzWatchOut: 'jazz_watch_out',
  jazzLookOut: 'jazz_look_out', jazzHurt: 'jazz_hurt',
};

// JJ2's own samples (from Anims.j2a, cut by `python tools/j2a.py sfx`, as
// assets/sfx/jj2/<Category>_<name>.wav): these come first. An event with
// several plays one of them at random.
export const JJ2_SFX = {
  shoot: ['Weapon/bullet_blaster_jazz_1', 'Weapon/bullet_blaster_jazz_2', 'Weapon/bullet_blaster_jazz_3', 'Weapon/bullet_blaster_jazz_4'],
  shootSpaz: ['Weapon/bullet_blaster_spaz_1', 'Weapon/bullet_blaster_spaz_2', 'Weapon/bullet_blaster_spaz_3'],
  bounce: ['Weapon/bullet_bouncer_1', 'Weapon/bullet_bouncer_2', 'Weapon/bullet_bouncer_3', 'Weapon/bullet_bouncer_4'],
  ricochet: ['Weapon/ricochet_bullet_1', 'Weapon/ricochet_bullet_2', 'Weapon/ricochet_bullet_3'],
  freeze: ['Weapon/bullet_freezer_1', 'Weapon/bullet_freezer_2'],
  missile: ['Weapon/bullet_seeker'],
  rf: ['Weapon/bullet_rf'],
  flame: ['Weapon/toaster'],
  tnt: ['Weapon/tnt'],
  pepper: ['Weapon/bullet_pepper'],
  electro: ['Weapon/bullet_electro_1', 'Weapon/bullet_electro_2', 'Weapon/bullet_electro_3'],
  boom: ['Weapon/tnt_explosion', 'Common/bomb'],
  weapon: ['UI/weapon_change'],
  ammo: ['Pickup/ammo'],
  kill: ['Common/splat_1', 'Common/splat_2', 'Common/splat_3', 'Common/splat_4', 'Common/splat_5', 'Common/splat_6'],
  stomp: ['Common/splat_1', 'Common/splat_2', 'Common/splat_3', 'Common/splat_4'],
  shell: ['Turtle/shell_collide'],
  blob: ['Common/plop_5'],
  gem: ['Pickup/gem'],
  coin: ['Pickup/coin'],
  food: ['Pickup/food_edible_1', 'Pickup/food_edible_2', 'Pickup/food_edible_3', 'Pickup/food_edible_4'],
  berry: ['Pickup/food_drink_1', 'Pickup/food_drink_2', 'Pickup/food_drink_3', 'Pickup/food_drink_4'],
  crate: ['Object/container_crate_break'],
  oneUp: ['Pickup/1up'],
  spring: ['Spring/spring'],
  bumper: ['Pinball/bumper_hit'],
  paddle: ['Pinball/paddle_hit_1', 'Pinball/paddle_hit_2', 'Pinball/paddle_hit_3', 'Pinball/paddle_hit_4'],
  jump: ['Common/char_jump'],
  doubleJump: ['Common/char_double_jump'],
  land: ['Common/char_land'],
  jazzHurt: ['Jazz/hurt_1', 'Jazz/hurt_2', 'Jazz/hurt_3', 'Jazz/hurt_4', 'Jazz/hurt_5', 'Jazz/hurt_6', 'Jazz/hurt_7', 'Jazz/hurt_8'],
  spazHurt: ['Spaz/hurt_1', 'Spaz/hurt_2'],
  loriHurt: ['Lori/hurt_1', 'Lori/hurt_2', 'Lori/hurt_3', 'Lori/hurt_4', 'Lori/hurt_5', 'Lori/hurt_6', 'Lori/hurt_7', 'Lori/hurt_8'],
  loriDie: ['Lori/die'],
  spazKick: ['Spaz/sidekick_1', 'Spaz/sidekick_2'],
  loriKick: ['Lori/sidekick'],
  spazBalance: ['Spaz/ledge'],
  spazHey: ['Spaz/hihi', 'Spaz/oooh'],
  loriHey: ['Lori/yahoo'],
  jazzDone: ['Jazz/level_complete'],
  spazDone: ['Spaz/level_complete'],
  loriDone: ['Lori/level_complete'],
  checkpoint: ['Object/checkpoint_open'],
  rush: ['Common/sugar_rush'],
  break: ['Common/scenery_destruct'],
  collapse: ['Common/scenery_collapse'],
  iceBreak: ['Common/ice_break'],
  stompStart: ['Common/down'],
  stompLand: ['Common/downfl2'],
  uppercutCharge: ['Common/char_revup'],
  warp: ['Common/warp_in'],
  splash: ['Common/water_splash'],
  airboard: ['Common/char_airboard'],
  shieldHit: ['Common/powerup_shield_damage_1', 'Common/powerup_shield_damage_2'],
  denied: ['Object/bonus_not_enough_coins'],
  menu: ['UI/select_1'],
  select: ['UI/select_2'],
  scream: ['Queen/scream'],
  throw: ['Monkey/banana_throw'],
  robotGun: ['Robot/attack'],
  mace: ['TurtleBoss/mace'],
  bilsyFire: ['Bilsy/throw_fireball'],
  bilsyAppear: ['Bilsy/appear_1', 'Bilsy/appear_2'],
  devanShoot: ['Devan/shoot'],
  devanLaugh: ['Devan/laugh'],
  uterusScream: ['Uterus/scream'],
  bubbaHop: ['Bubba/hop_1', 'Bubba/hop_2'],
  bubbaTornado: ['Bubba/tornado'],
  bubbaSneeze: ['Bubba/sneeze'],
  bollyMissile: ['Bolly/missile_1', 'Bolly/missile_2', 'Bolly/missile_3'],
  frogMorph: ['Frog/transform'],
  tongue: ['Frog/tongue'],
};
// Looping sounds: the copter ears and the airboard's hum.
export const JJ2_LOOPS = { hover: 'Common/copter_noise', board: 'Common/char_airboard' };
