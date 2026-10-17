// Entry point: fixed-step loop (14 ms ticks, resync after 35 behind, as
// measured) with interpolated rendering, and the screen flow:
// splash (press a key, intro track) -> menu -> level card -> play
// (pause / clear tally / game over / win), and the party lobby -> party play.

import { buildArt } from './art.js';
import { Audio } from './audio.js';
import { MAX_CATCHUP_TICKS, TICK_MS, VIEW_H, VIEW_W } from './config.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { LEVELS } from './levels.js';
import { Net, Party } from './party.js';
import { Renderer } from './render.js';
import { loadSave, recordLevel, writeSave } from './save.js';
import { Screens } from './screens.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const art = await buildArt();
const audio = new Audio();
const input = new Input(window);
const game = new Game(audio, art);
const renderer = new Renderer(ctx, art);
const screens = new Screens(ctx, art, audio);
let save = loadSave();
audio.setVolumes(save.options.music, save.options.sfx);
game.unlocked = save.unlocked;

let scene = 'splash';
let sceneTime = 0;
let irisTime = 0;
let pendingLevel = null;
let gated = true;          // the splash waits for a key so audio may start
let net = null;            // party connection while in the lobby or a hunt

// Debug handle for playtesting from the browser console.
window.kip = {
  game, input, audio, screens,
  go: (s) => go(s),
  play: (index = 0) => { game.party = null; game.newGame(index); irisTime = 99; go('play'); },
};

function go(next) {
  scene = next;
  sceneTime = 0;
}

function toMenu() {
  if (net) { net.close(); net = null; }
  game.party = null;
  screens.sub = null;
  screens.menu = 0;
  go('title');
  audio.startMusic('title');
}

// Browsers only allow audio after a gesture: the first key or click starts
// it, and the intro track with it; the menu follows when the track ends.
function unlock() {
  audio.unlock();
  if (!gated) return;
  gated = false;
  sceneTime = 0;
  audio.startMusic('intro', { restart: true, onEnd: () => { if (scene === 'splash') toMenu(); } });
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
  game.party = null;
  game.result = null;
  if (fresh) game.newGame(index);
  else game.loadLevel(index);
  irisTime = 0;
  go('play');
}

// ---------------------------------------------------------------- party lobby

async function hostParty() {
  net = new Net();
  if (!(await net.connect())) { screens.lobby = { status: 'error', error: net.error }; return; }
  net.send({ t: 'host' });
}

async function joinParty(code) {
  if (!net) {
    net = new Net();
    if (!(await net.connect())) { screens.lobby = { status: 'error', error: net.error }; return; }
  }
  net.send({ t: 'join', code });
}

function startParty(index, role) {
  game.newParty(index, new Party(net, role));
  irisTime = 0;
  go('play');
}

function lobbyTick() {
  if (!net) return;
  for (const m of net.take()) {
    const L = screens.lobby;
    if (m.t === 'hosted') Object.assign(L, { status: 'open', code: m.code, urls: m.urls });
    else if (m.t === 'peer') L.peer = true;
    else if (m.t === 'joined') Object.assign(L, { status: 'open', joined: true, code: m.code, error: null });
    else if (m.t === 'error') L.error = m.why;
    else if (m.t === 'start') { startParty(m.level, 'guest'); return; }
    else if (m.t === 'left') { L.peer = false; if (L.joined) screens.lobby = { status: 'error', error: 'The host left.' }; }
  }
}

// ---------------------------------------------------------------- tick

function tick() {
  input.sample();
  if (input.pressed('mute') && screens.sub !== 'join') audio.toggleMute();
  sceneTime++;
  switch (scene) {
    case 'splash':
      if (!gated && sceneTime > 40 && (input.pressed('start') || input.pressed('jump') || input.pressed('pause'))) toMenu();
      break;
    case 'title': {
      game.time++;
      lobbyTick();
      if (scene !== 'title') break;
      const action = screens.titleInput(input, save) || '';
      if (action === 'play') showCard(Math.min(save.unlocked, LEVELS.length) - 1, true);
      else if (action.startsWith('level:')) showCard(Number(action.slice(6)), true);
      else if (action === 'options') { audio.setVolumes(save.options.music, save.options.sfx); writeSave(save); }
      else if (action === 'reset') { save = { ...loadSave(), unlocked: 1, levels: {} }; writeSave(save); game.unlocked = 1; }
      else if (action === 'host') hostParty();
      else if (action.startsWith('join:')) joinParty(action.slice(5));
      else if (action === 'leave') { if (net) net.close(); net = null; }
      else if (action.startsWith('party-start:')) {
        const index = Number(action.slice(12));
        net.send({ t: 'start', level: index });
        startParty(index, 'host');
      }
      break;
    }
    case 'card':
      if (sceneTime > 170 || (sceneTime > 50 && input.pressed('start'))) startPendingLevel();
      break;
    case 'play':
      irisTime++;
      if (game.party) {
        // Esc leaves the hunt (the rival is told); Enter after the result.
        if (input.pressed('pause') || (game.party.result && input.pressed('start'))) { toMenu(); break; }
        game.update(input);
        break;
      }
      if (game.state === 'play' && input.pressed('pause')) {
        screens.pauseIndex = 0;
        audio.hover(false);
        audio.play('pause');
        go('paused');
        break;
      }
      game.update(input);
      if (game.state === 'clear' && !game.result) {
        game.result = recordLevel(save, game.levelIndex, game.stats, game.score);
        save.unlocked = Math.max(save.unlocked, game.unlocked);
        writeSave(save);
      }
      if (game.state === 'clear' && game.clearTime > 280 && input.pressed('start')) {
        game.result = null;
        if (game.levelIndex + 1 < LEVELS.length) showCard(game.levelIndex + 1, false);
        else game.nextLevel();
      } else if (game.state === 'gameover' || game.state === 'win') {
        game.overTime = (game.overTime || 0) + 1;
        if (game.overTime > 90 && input.pressed('start')) toMenu();
      }
      break;
    case 'paused': {
      const action = screens.pauseInput(input);
      if (action === 'resume') go('play');
      else if (action === 'restart') showCard(game.levelIndex, false);
      else if (action === 'quit') toMenu();
      break;
    }
    default:
      break;
  }
}

function render(alpha) {
  if (scene === 'splash') return screens.splash(sceneTime, gated);
  if (scene === 'title') return screens.title(game.time, save);
  if (scene === 'card') return screens.card(game, sceneTime, save);
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
