// Entry point: fixed-step loop (14 ms ticks, resync after 35 behind, as
// measured) with interpolated rendering, and the screen flow:
// splash (press a key, intro track) -> menu -> level card -> play
// (pause / clear tally / game over / win), and the party lobby -> party play.

import { buildArt } from './art.js';
import { Audio } from './audio.js';
import { MAX_CATCHUP_TICKS, TICK_MS, VIEW_H, VIEW_W } from './config.js';
import { Game } from './game.js';
import { bindKey, defaultKeys, Input } from './input.js';
import { LEVELS, levelDef } from './levels.js';
import { Net, Party } from './party.js';
import { Renderer } from './render.js';
import { loadSave, recordLevel, writeSave } from './save.js';
import { Screens } from './screens.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const art = await buildArt();
const audio = new Audio();
let save = loadSave();
const input = new Input(window, save.options.keys);
const game = new Game(audio, art);
const renderer = new Renderer(ctx, art);
const screens = new Screens(ctx, art, audio);
audio.setVolumes(save.options.music, save.options.sfx);
game.video = save.options.video;

// ---------------------------------------------------------------- video options

// Size the canvas: fill the window at 16:9, or (pixel perfect) the largest
// whole multiple of 640x360 that fits; sharp or smooth scaling.
function layout() {
  const v = save.options.video;
  let k = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  if (v.scale === 'pixel' && k >= 1) k = Math.floor(k);
  canvas.style.width = `${Math.floor(VIEW_W * k)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * k)}px`;
  canvas.style.imageRendering = v.filter === 'smooth' ? 'auto' : 'pixelated';
}
window.addEventListener('resize', layout);
document.addEventListener('fullscreenchange', layout);
layout();

function toggleFullscreen() {
  const req = document.documentElement.requestFullscreen;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (req) document.documentElement.requestFullscreen().catch(() => audio.play('denied'));
}
game.unlocked = save.unlocked;
game.character = save.character || 'jazz';

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
  play: async (index = 0) => {
    const def = levelDef(index);
    if (def.prepare) await def.prepare();
    game.party = null; game.newGame(index); irisTime = 99; go('play');
  },
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

// The level card shows while an original JJ2 level's files load.
function showCard(index, fresh) {
  const def = levelDef(index);
  pendingLevel = { index, fresh, ready: !def.prepare };
  game.cardIndex = index;
  const meta = { title: def.title, tip: def.tip, label: def.pack && def.pack.title.toUpperCase(), loading: !!def.prepare };
  game.cardMeta = meta;
  if (def.prepare) {
    // A load that finishes after another card opened only updates its own card.
    const pending = pendingLevel;
    def.prepare().then(() => {
      pending.ready = true;
      meta.loading = false;
      meta.title = def.title;
    }).catch((e) => { meta.error = e.message; meta.loading = false; });
  }
  audio.stopMusic();
  audio.play('card');
  go('card');
}

// Index from a menu action: built-in levels are numbers, JJ2 levels keys.
const levelKey = (k) => (/^\d+$/.test(k) ? Number(k) : k);

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
  const conn = net = new Net();
  const ok = await conn.connect();
  if (conn !== net) return;            // left while connecting
  if (!ok) { screens.lobby = { status: 'error', error: conn.error }; return; }
  conn.send({ t: 'host' });
}

async function joinParty(code) {
  if (!net) {
    const conn = net = new Net();
    const ok = await conn.connect();
    if (conn !== net) return;
    if (!ok) { screens.lobby = { status: 'error', error: conn.error }; return; }
  }
  net.send({ t: 'join', code });
}

// While a party level loads, the lobby stops reading messages so the
// rival's first moves wait in the inbox for the game.
let partyLoading = null;        // the connection whose party level is loading

// Load a party level; false if it failed or the player left meanwhile.
async function preparePartyLevel(index) {
  const def = levelDef(index);
  if (!def.prepare) return true;
  const conn = net;
  partyLoading = conn;
  screens.lobby.status = 'loading';
  try {
    await def.prepare();
  } catch (e) {
    if (net === conn) screens.lobby = { status: 'error', error: e.message };
    return false;
  } finally {
    if (partyLoading === conn) partyLoading = null;
  }
  return !!net && net === conn && net.status === 'open' && scene === 'title' && screens.lobby.status !== 'error';
}

function startParty(index, role) {
  game.newParty(index, new Party(net, role));
  irisTime = 0;
  go('play');
}

// The host loads the level first, then tells the guest to start.
// Levels with nothing to load start at once, inside the same tick.
async function hostStart(index) {
  if (!net || partyLoading === net) return;
  if (levelDef(index).prepare && !(await preparePartyLevel(index))) return;
  net.send({ t: 'start', level: index });
  startParty(index, 'host');
}

async function guestStart(index) {
  if (!levelDef(index).prepare || await preparePartyLevel(index)) startParty(index, 'guest');
}

function lobbyTick() {
  if (!net || partyLoading === net) return;
  const msgs = net.take();
  for (let k = 0; k < msgs.length; k++) {
    const m = msgs[k];
    const L = screens.lobby;
    if (m.t === 'hosted') Object.assign(L, { status: 'open', code: m.code, urls: m.urls });
    else if (m.t === 'peer') L.peer = true;
    else if (m.t === 'joined') Object.assign(L, { status: 'open', joined: true, code: m.code, error: null });
    else if (m.t === 'error') L.error = m.why;
    else if (m.t === 'start') {
      net.inbox.unshift(...msgs.slice(k + 1));   // keep the rest for the game
      guestStart(m.level);
      return;
    } else if (m.t === 'left') { L.peer = false; if (L.joined) screens.lobby = { status: 'error', error: 'The host left.' }; }
  }
}

// The options screens' actions (from the title or the pause menu). True
// when `action` was one of them.
function optionsAction(action) {
  if (action === 'options') { audio.setVolumes(save.options.music, save.options.sfx); writeSave(save); } else if (action === 'keys') { input.setKeys(save.options.keys); writeSave(save); } else if (action === 'capture') {
    // The next key press rebinds the chosen slot (Escape cancels).
    input.capture((code) => {
      const c = screens.capturing;
      screens.capturing = null;
      if (!c || code === 'Escape') return;
      if (!save.options.keys) save.options.keys = defaultKeys();
      if (bindKey(save.options.keys, c.action, c.col, code)) { audio.play('select'); input.setKeys(save.options.keys); writeSave(save); } else audio.play('denied');
    });
  } else if (action === 'video') { game.video = save.options.video; layout(); writeSave(save); } else if (action === 'fullscreen') toggleFullscreen();
  else if (action === 'reset') { save = { ...save, unlocked: 1, levels: {} }; writeSave(save); game.unlocked = 1; } else if (action === 'options-closed') { /* back to the pause menu */ } else return false;
  return true;
}

// ---------------------------------------------------------------- tick

function tick() {
  input.sample();
  if (input.pressed('mute') && !(scene === 'title' && screens.sub === 'join')) audio.toggleMute();
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
      if (optionsAction(action)) break;
      if (action.startsWith('level:')) showCard(levelKey(action.slice(6)), true);
      else if (action === 'save') { writeSave(save); game.character = save.character; }
      else if (action === 'host') hostParty();
      else if (action.startsWith('join:')) joinParty(action.slice(5));
      else if (action === 'leave') { if (net) net.close(); net = null; }
      else if (action.startsWith('party-start:')) hostStart(levelKey(action.slice(12)));
      break;
    }
    case 'card':
      if (game.cardMeta.error) { if (sceneTime > 30 && (input.pressed('start') || input.pressed('pause'))) toMenu(); break; }
      if (!pendingLevel.ready && sceneTime > 30 && input.pressed('pause')) { toMenu(); break; }   // give up on a slow load
      if (pendingLevel.ready && (sceneTime > 170 || (sceneTime > 50 && input.pressed('start')))) startPendingLevel();
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
        screens.sub = null;
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
        const def = levelDef(game.levelIndex);
        if (def.jj2) { if (def.next) showCard(def.next, false); else toMenu(); }
        else if (game.levelIndex + 1 < LEVELS.length) showCard(game.levelIndex + 1, false);
        else game.nextLevel();
      } else if (game.state === 'gameover') {
        // "Continue?": YES starts the level again with fresh lives.
        game.overTime = (game.overTime || 0) + 1;
        if (game.overTime === 1) screens.continueYes = true;
        const answer = game.overTime > 40 ? screens.continueInput(input) : null;
        if (answer === 'yes') showCard(game.levelIndex, true);
        else if (answer === 'no') toMenu();
      } else if (game.state === 'win') {
        game.overTime = (game.overTime || 0) + 1;
        if (game.overTime > 90 && input.pressed('start')) toMenu();
      }
      break;
    case 'paused': {
      const action = screens.pauseInput(input, save) || '';
      if (optionsAction(action)) break;
      if (action === 'resume') go('play');
      else if (action === 'restart') { game.restoreStart(); showCard(game.levelIndex, false); }
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
  if (scene === 'paused') screens.pause(sceneTime, save);
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
    // A failing tick is reported once and the game keeps running.
    try { tick(); } catch (e) { if (!loop.reportedTick) { console.error(e); loop.reportedTick = true; } }
    acc -= TICK_MS;
    if (++steps > MAX_CATCHUP_TICKS) { acc = 0; break; }
  }
  // Never let one bad frame freeze the game: report it and keep going.
  try {
    render(acc / TICK_MS);
  } catch (e) {
    if (!loop.reported) { console.error(e); loop.reported = true; }
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, VIEW_H - 40, VIEW_W, 40);
    ctx.fillStyle = '#ff8a8a';
    ctx.font = '11px sans-serif';
    ctx.fillText(`Error: ${e.message} (see the browser console)`, 8, VIEW_H - 16);
  }
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
