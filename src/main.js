// Entry point: fixed-step loop (14 ms ticks, resync after 35 behind, as
// measured) with interpolated rendering, and the screen flow:
// splash -> title -> level card -> play (pause / clear tally / game over / win).

import { buildArt } from './art.js';
import { Audio } from './audio.js';
import { MAX_CATCHUP_TICKS, TICK_MS, VIEW_H, VIEW_W } from './config.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { LEVELS } from './levels.js';
import { Renderer } from './render.js';
import { Screens } from './screens.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const art = await buildArt();
const audio = new Audio();
const input = new Input(window);
const game = new Game(audio, art);
const renderer = new Renderer(ctx, art);
const screens = new Screens(ctx, art, audio);

let scene = 'splash';
let sceneTime = 0;
let irisTime = 0;
let pendingLevel = null;

// Debug handle for playtesting from the browser console.
window.kip = {
  game, input, audio,
  go: (s) => go(s),
  play: (index = 0) => { game.newGame(index); irisTime = 99; go('play'); },
};

function go(next) {
  scene = next;
  sceneTime = 0;
}

// Browsers only allow audio after a gesture: unlock on the first one.
function unlock() {
  const first = !audio.ctx;
  audio.unlock();
  if (first && scene === 'title') audio.startMusic('title');
}
window.addEventListener('keydown', unlock);
canvas.addEventListener('pointerdown', unlock);

function showCard(index, fresh) {
  pendingLevel = { index, fresh };
  game.cardIndex = index;
  game.cardMeta = { title: LEVELS[index].title, tip: LEVELS[index].tip };
  audio.stopMusic();
  audio.play('card');
  go('card');
}

function startPendingLevel() {
  const { index, fresh } = pendingLevel;
  if (fresh) game.newGame(index);
  else game.loadLevel(index);
  irisTime = 0;
  go('play');
}

function tick() {
  input.sample();
  if (input.pressed('mute')) audio.toggleMute();
  sceneTime++;
  switch (scene) {
    case 'splash':
      if (sceneTime > 200 || (sceneTime > 20 && input.pressed('start'))) {
        go('title');
        if (audio.ctx) audio.startMusic('title');
      }
      break;
    case 'title': {
      game.time++;
      const action = screens.titleInput(input, game.unlocked);
      if (action === 'start') showCard(0, true);
      else if (action && action.startsWith('level:')) showCard(Number(action.slice(6)), true);
      break;
    }
    case 'card':
      if (sceneTime > 170 || (sceneTime > 50 && input.pressed('start'))) startPendingLevel();
      break;
    case 'play':
      irisTime++;
      if (game.state === 'play' && input.pressed('pause')) {
        screens.pauseIndex = 0;
        audio.hover(false);
        audio.play('pause');
        go('paused');
        break;
      }
      game.update(input);
      if (game.state === 'clear' && game.clearTime > 280 && input.pressed('start')) {
        if (game.levelIndex + 1 < LEVELS.length) showCard(game.levelIndex + 1, false);
        else game.nextLevel();
      } else if (game.state === 'gameover' || game.state === 'win') {
        game.overTime = (game.overTime || 0) + 1;
        if (game.overTime > 90 && input.pressed('start')) {
          go('title');
          screens.menu = 0;
          audio.startMusic('title');
        }
      }
      break;
    case 'paused': {
      const action = screens.pauseInput(input);
      if (action === 'resume') go('play');
      else if (action === 'restart') showCard(game.levelIndex, false);
      else if (action === 'quit') {
        go('title');
        screens.menu = 0;
        audio.startMusic('title');
      }
      break;
    }
    default:
      break;
  }
}

function render(alpha) {
  if (scene === 'splash') return screens.splash(sceneTime);
  if (scene === 'title') return screens.title(game.time, game.unlocked);
  if (scene === 'card') return screens.card(game, sceneTime);
  if (game.state === 'win') return screens.win(game, game.overTime || 0);
  renderer.world(game, alpha);
  if (game.state !== 'clear' || game.clearTime < 70) renderer.hud(game);
  if (game.state === 'clear') screens.tally(game);
  if (game.state === 'gameover') screens.gameOver(game, game.overTime || 0);
  if (scene === 'paused') screens.pause(sceneTime);
  if (irisTime < 45) {
    const p = game.player;
    const cx = p.cx - game.cam.x;
    const cy = p.cy - game.cam.y;
    screens.iris(cx, cy, (irisTime / 45) ** 2 * Math.hypot(VIEW_W, VIEW_H));
  }
  return null;
}

let last = performance.now();
let acc = 0;

function loop(now) {
  acc += Math.min(now - last, 1000);
  last = now;
  let steps = 0;
  while (acc >= TICK_MS) {
    tick();
    acc -= TICK_MS;
    if (++steps > MAX_CATCHUP_TICKS) { acc = 0; break; }
  }
  render(acc / TICK_MS);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
