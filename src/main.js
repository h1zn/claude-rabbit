// Entry point: fixed-step loop (14 ms ticks, resync after 35 behind, as
// measured) with interpolated rendering, and the screen flow:
// splash (press a key, intro track) -> menu -> level card -> play
// (pause / clear tally / game over / win) -> high score name -> table,
// the party lobby -> party play, and split screen (two players, one computer).

import { buildArt } from './art.js';
import { Audio } from './audio.js';
import { MAX_CATCHUP_TICKS, TICK_MS, VIEW_H, VIEW_W } from './config.js';
import { Game } from './game.js';
import { bindKey, defaultKeys, Input } from './input.js';
import { nextPlayable } from './jj2/catalog.js';
import { setLang, tr } from './lang.js';
import { LEVELS, levelDef } from './levels.js';
import { localPair, Net, Party } from './party.js';
import { Renderer } from './render.js';
import { addScore, loadSave, recordLevel, saveSlot, scoreRank, writeSave } from './save.js';
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
setLang(save.options.lang);
game.video = save.options.video;
// Split screen: player 2's game, input and view (made when first needed).
let splitKit = null;        // { game, input, renderer }, made once
let split = null;           // splitKit while two play on one computer

// ---------------------------------------------------------------- video options

// Size the canvas: fill the window at 16:9, or (pixel perfect) the largest
// whole multiple of 640x360 that fits; sharp or smooth scaling.
function layout() {
  const v = save.options.video;
  // F3 / F4 shrink and grow the game inside the window.
  let k = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H) * (v.size || 1);
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
input.onAltEnter = toggleFullscreen;

// F3 / F4: the screen size, in tenths of the window (half to all of it).
function resize(d) {
  const v = save.options.video;
  const size = Math.round(Math.max(0.5, Math.min(1, (v.size || 1) + d * 0.1)) * 10) / 10;
  if (size === v.size) { audio.play('denied'); return; }
  v.size = size;
  layout();
  writeSave(save);
  screens.say(tr('SCREEN SIZE {0}%', Math.round(size * 100)));
}

window.addEventListener('gamepadconnected', () => screens.say('GAMEPAD CONNECTED'));
window.addEventListener('gamepaddisconnected', () => screens.say('GAMEPAD DISCONNECTED'));

game.unlocked = save.unlocked;
game.character = save.character || 'jazz';
game.difficulty = save.difficulty;

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
  if (split) endSplit();
  game.party = null;
  screens.sub = null;
  screens.menu = 0;
  go('title');
  audio.startMusic('title');
}

// A game ended (game over, the last level, or quitting): a score good
// enough for the table asks for a name, then shows the table.
let finished = null;        // the game waiting for its high-score name
function endGame() {
  const score = game.score;
  const rank = scoreRank(save, score);
  const def = levelDef(game.levelIndex);
  finished = { score, level: def ? def.title : '', difficulty: game.difficulty, character: game.character };
  toMenu();
  if (rank < 0) { finished = null; return; }
  screens.askName(score, rank, save.lastName || game.character.toUpperCase());
  audio.play('rank');
}

// Open a pause-menu screen from play (F1 help, F5 load, F6 save).
function pauseWith(sub) {
  screens.pauseIndex = 0;
  screens.sub = null;
  screens.levelTitle = levelDef(game.levelIndex).title;
  if (sub) screens.pauseOpen(sub);
  audio.hover(false);
  audio.play('pause');
  go('paused');
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
    }).catch((e) => { meta.error = e.message; meta.loading = false; meta.next = nextPlayable(def.next); meta.title = def.title; });
  }
  audio.stopMusic();
  audio.play('card');
  go('card');
}

// Index from a menu action: built-in levels are numbers, JJ2 levels keys.
const levelKey = (k) => (/^\d+$/.test(k) ? Number(k) : k);

function startPendingLevel() {
  const { index, fresh, saved, continues } = pendingLevel;
  game.party = null;
  game.result = null;
  if (saved) game.loadSaved(saved);
  else if (fresh) game.newGame(index, continues);
  else game.loadLevel(index);
  irisTime = 0;
  go('play');
}

// Load a saved game (from the menu or the pause menu).
function loadSlot(i) {
  const slot = save.slots[i];
  if (!slot) return;
  game.character = slot.character || game.character;
  showCard(slot.level, false);
  pendingLevel.saved = slot;
}

// ---------------------------------------------------------------- split screen

// Two players on one computer: two games joined like a party hunt, one in
// each half of the screen. Player 1 plays on Keyboard 1 (less any keys of
// Keyboard 2), player 2 on Keyboard 2; gamepads go one each.
async function startSplit(index) {
  const def = levelDef(index);
  if (def.prepare) {
    screens.lobby.status = 'loading';
    try { await def.prepare(); } catch (e) { screens.lobby.status = 'idle'; screens.say('THAT LEVEL CAN NOT LOAD'); return; }
    screens.lobby.status = 'idle';
    if (scene !== 'title' || screens.sub !== 'local') return;
  }
  if (!splitKit) splitKit = { game: new Game(audio, art), input: new Input(window, save.options.keys2, { second: true }), renderer: new Renderer(ctx, art) };
  split = splitKit;
  const g2 = split.game;
  g2.video = save.options.video;
  g2.character = game.character === 'spaz' ? 'jazz' : 'spaz';
  g2.quiet = true;
  game.viewW = VIEW_W / 2; g2.viewW = VIEW_W / 2;
  renderer.w = VIEW_W / 2; split.renderer.w = VIEW_W / 2;
  const [a, b] = localPair();
  const p1 = new Party(a, 'host'); const p2 = new Party(b, 'guest');
  p1.local = true; p2.local = true;
  game.newParty(index, p1);
  g2.newParty(index, p2);
  split.input.setKeys(save.options.keys2);
  input.setKeys(save.options.keys, new Set(Object.values(split.input.bindings).flat().filter((c) => c !== 'Escape' && c !== 'Enter')));
  input.padRole = 'p1'; split.input.padRole = 'p2';
  irisTime = 0;
  go('split');
}

function endSplit() {
  game.viewW = VIEW_W; renderer.w = VIEW_W;
  game.quiet = false;
  input.setKeys(save.options.keys);
  input.padRole = 'any';
  split.input.padRole = 'none';
  split.game.party = null;
  split.renderer.w = VIEW_W;
  split = null;
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
      const field = c.field || 'keys';
      if (!save.options[field]) save.options[field] = defaultKeys(field === 'keys2');
      if (bindKey(save.options[field], c.action, c.col, code)) { audio.play('select'); input.setKeys(save.options.keys); writeSave(save); } else audio.play('denied');
    });
  } else if (action === 'video') { game.video = save.options.video; layout(); writeSave(save); } else if (action === 'fullscreen') toggleFullscreen();
  else if (action === 'bigger' || action === 'smaller') resize(action === 'bigger' ? 1 : -1);
  else if (action === 'lang') { setLang(save.options.lang); writeSave(save); } else if (action === 'slots') writeSave(save);
  else if (action === 'reset') { save = { ...save, unlocked: 1, levels: {} }; writeSave(save); game.unlocked = 1; } else if (action === 'options-closed') { /* back to the pause menu */ } else return false;
  return true;
}

// The F keys, from any screen: F1 help, F3 / F4 screen size, F5 load and
// F6 save. True when one was handled.
function specialKeys() {
  if (screens.typing || screens.capturing) return false;
  if (input.pressed('smaller')) { resize(-1); return true; }
  if (input.pressed('bigger')) { resize(1); return true; }
  const key = ['help', 'load', 'save'].find((k) => input.pressed(k));
  if (!key) return false;
  if (scene === 'title') {
    if (net) return false;    // not while a party is being set up
    if (key === 'save') { audio.play('denied'); return true; }
    audio.play('select');
    screens.open(key);
    return true;
  }
  if (scene === 'play' && !game.party && game.state === 'play') { pauseWith(key); return true; }
  if (scene === 'paused') { screens.pauseOpen(key); audio.play('select'); return true; }
  return false;
}

// ---------------------------------------------------------------- tick

function tick() {
  // Gamepad buttons work the menus everywhere but in play.
  input.menu = scene !== 'split' && !(scene === 'play' && game.state === 'play');
  input.sample();
  if (split) { split.input.menu = false; split.input.sample(); }
  if (input.pressed('mute') && !(scene === 'title' && screens.sub === 'join') && !screens.typing) audio.toggleMute();
  sceneTime++;
  if (scene !== 'splash' && specialKeys()) return;
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
      else if (action === 'save') { writeSave(save); game.character = save.character; game.difficulty = save.difficulty; }
      else if (action.startsWith('load-slot:')) loadSlot(Number(action.slice(10)));
      else if (action === 'score-name') {
        const name = screens.typedName || save.lastName || 'JAZZ';
        save.lastName = name;
        const rank = finished ? addScore(save, { ...finished, name }) : -1;
        finished = null;
        writeSave(save);
        screens.open('scores');
        screens.highlight = rank;
      } else if (action.startsWith('local-start:')) startSplit(levelKey(action.slice(12)));
      else if (action === 'host') hostParty();
      else if (action.startsWith('join:')) joinParty(action.slice(5));
      else if (action === 'leave') { if (net) net.close(); net = null; }
      else if (action.startsWith('party-start:')) hostStart(levelKey(action.slice(12)));
      break;
    }
    case 'card':
      if (game.cardMeta.error) {
        // A level that can't load: ENTER moves on along its episode's chain.
        if (sceneTime > 30 && input.pressed('start') && game.cardMeta.next) showCard(game.cardMeta.next, false);
        else if (sceneTime > 30 && (input.pressed('start') || input.pressed('pause'))) toMenu();
        break;
      }
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
        pauseWith(null);
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
        if (def.jj2) { const next = nextPlayable(def.next); if (next) showCard(next, false); else endGame(); }
        else if (game.levelIndex + 1 < LEVELS.length) showCard(game.levelIndex + 1, false);
        else game.nextLevel();
      } else if (game.state === 'gameover') {
        // "Continue?": YES starts the level again with fresh lives, but
        // without the score and weapons, three times a game (the manual).
        game.overTime = (game.overTime || 0) + 1;
        if (game.overTime === 1) screens.continueYes = true;
        if (game.continues <= 0) {
          if (game.overTime > 60 && (input.pressed('start') || input.pressed('jump') || input.pressed('pause'))) endGame();
          break;
        }
        const answer = game.overTime > 40 ? screens.continueInput(input) : null;
        if (answer === 'yes') { const left = game.continues - 1; showCard(game.levelIndex, true); pendingLevel.continues = left; }
        else if (answer === 'no') endGame();
      } else if (game.state === 'win') {
        game.overTime = (game.overTime || 0) + 1;
        if (game.overTime > 90 && input.pressed('start')) endGame();
      }
      break;
    case 'split': {
      // Esc leaves; ENTER after the result.
      irisTime++;
      const done = game.party && game.party.result;
      if (input.pressed('pause') || split.input.pressed('pause') || (done && (input.pressed('start') || split.input.pressed('start')))) { toMenu(); break; }
      game.update(input);
      split.game.update(split.input);
      break;
    }
    case 'paused': {
      const action = screens.pauseInput(input, save) || '';
      if (optionsAction(action)) break;
      if (action === 'resume') go('play');
      else if (action === 'restart') { game.restoreStart(); showCard(game.levelIndex, false); }
      else if (action === 'quit') endGame();
      else if (action.startsWith('save-slot:')) {
        saveSlot(save, Number(action.slice(10)), { ...game.snapshot(), name: screens.typedName, title: levelDef(game.levelIndex).title });
        screens.say('GAME SAVED');
      } else if (action.startsWith('load-slot:')) loadSlot(Number(action.slice(10)));
      break;
    }
    default:
      break;
  }
}

// Split screen: each player's view in their half, with their own HUD.
function renderSplit(alpha) {
  const W = VIEW_W / 2;
  [[game, renderer], [split.game, split.renderer]].forEach(([g, r], i) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(i * W, 0, W, VIEW_H);
    ctx.clip();
    ctx.translate(i * W, 0);
    r.world(g, alpha);
    r.hud(g);
    if (irisTime < 45) screens.iris(g.player.cx - g.cam.x, g.player.cy - g.cam.y, (irisTime / 45) ** 2 * Math.hypot(W, VIEW_H));
    ctx.restore();
  });
  ctx.fillStyle = '#05020c';
  ctx.fillRect(W - 1, 0, 2, VIEW_H);
}

function render(alpha) {
  if (scene === 'splash') return screens.splash(sceneTime, gated);
  if (scene === 'split') return renderSplit(alpha);
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
    screens.drawToast();
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
