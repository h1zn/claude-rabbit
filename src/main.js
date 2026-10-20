// Entry point: fixed-step loop (14 ms ticks, resync after 35 behind, as
// measured) with interpolated rendering, and the screen flow:
// splash (press a key: JJ2's intro film, or the intro track) -> menu ->
// level card -> play
// (pause / clear tally / game over / win) -> high score name -> table,
// the party lobby -> party play, and split screen (two players, one computer).

import { buildArt } from './art.js';
import { Audio } from './audio.js';
import { parseJ2V } from './cinematic.js';
import { MAX_CATCHUP_TICKS, TICK_MS, VIEW_H, VIEW_W } from './config.js';
import { Game } from './game.js';
import { bindKey, defaultKeys, Input } from './input.js';
import { cinematicFile, nextPlayable, songKey } from './jj2/catalog.js';
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
let cinema = null;         // the films playing: { reels, i, film, next, then }

// Debug handle for playtesting from the browser console.
window.kip = {
  game, input, audio, screens,
  go: (s) => go(s),
  scene: () => scene,
  cinema: () => cinema,
  split: () => split,
  play: async (index = 0) => {
    const def = levelDef(index);
    if (def.prepare) await def.prepare();
    game.party = null; game.newGame(index); irisTime = 99; go('play');
  },
};

function go(next) {
  if (next !== 'cinema' && cinema) { cinema = null; audio.stopCues(); }
  scene = next;
  sceneTime = 0;
}

function toMenu() {
  leaving = false;
  if (net) { net.close(); net = null; }
  if (split) endSplit();
  game.party = null;
  audio.board(false);
  game.character = save.character || 'jazz';
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
  audio.board(false);
  audio.play('pause');
  go('paused');
}

// Browsers only allow audio after a gesture: the first key or click starts
// it, and JJ2's own intro with it (the Epic logo, then the film, from
// JJ2-Cinematics.zip); without the films, the intro track plays over the
// splash. The menu follows.
const INTRO = [{ name: 'Logo.j2v' }, { name: 'Intro.j2v', song: 'Intro.j2b' }];
const ENDING = [{ name: 'Ending.j2v', song: 'Ending.j2b' }];
function unlock() {
  audio.unlock();
  if (!gated) return;
  gated = false;
  sceneTime = 0;
  playFilms(INTRO, toMenu, () => {
    go('splash');
    audio.startMusic('intro', { restart: true, onEnd: () => { if (scene === 'splash') toMenu(); } });
  });
}

// ---------------------------------------------------------------- cinematics

// The films' sound cues, from Data.j2d (tools/j2a.py cine): per film, a
// list of [frame, sound file, volume 0-64, pan 0-64].
let cueLists = null;
const cueUrl = (file) => `assets/sfx/cine/${file}.wav`;

// A film, its song and its sounds, loaded: { film, song, cues } (film null
// if it isn't there).
async function loadReel(reel) {
  if (!cueLists) cueLists = fetch('assets/cinematics.json').then((r) => r.json()).catch(() => ({}));
  const [bytes, song, lists] = await Promise.all([cinematicFile(reel.name), reel.song ? songKey(reel.song) : null, cueLists]);
  const film = bytes && await parseJ2V(bytes).catch(() => null);
  const cues = (film && lists[reel.name.replace(/\.j2v$/i, '')]) || [];
  await Promise.all(cues.map(([, file]) => audio.load(cueUrl(file))));
  return { film, song, cues };
}

// The film's sounds up to the frame it shows.
function playCues(c) {
  while (c.cue < c.cues.length && c.cues[c.cue][0] <= c.film.shown) {
    const [, file, vol, pan] = c.cues[c.cue++];
    audio.cue(cueUrl(file), vol / 64, (pan - 32) / 32);
  }
}

// Play films one after another, then `then`; any key skips them all.
// `missing` runs instead if the first film isn't there.
function playFilms(reels, then, missing = then) {
  const c = { reels, i: 0, film: null, next: loadReel(reels[0]), then };
  cinema = c;
  audio.stopMusic();
  go('cinema');
  startReel(c, missing);
}

async function startReel(c, missing) {
  const { film, song, cues } = await c.next;
  if (cinema !== c) return;            // skipped while it loaded
  if (!film) { cinema = null; if (c.i === 0) missing(); else c.then(); return; }
  Object.assign(c, { film, cues, cue: 0 });
  c.next = c.i + 1 < c.reels.length ? loadReel(c.reels[c.i + 1]) : null;
  if (song) audio.startMusic(song, { restart: true });
  else audio.stopMusic();
}

function endFilms() {
  const { then } = cinema;
  cinema = null;
  audio.stopMusic();
  audio.stopCues();
  then();
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
  // A classic level whose files have gone since it was saved.
  if (!levelDef(slot.level)) { audio.play('denied'); screens.say('THAT LEVEL CAN NOT LOAD'); return; }
  game.character = slot.character || game.character;
  showCard(slot.level, false);
  pendingLevel.saved = slot;
}

// ---------------------------------------------------------------- split screen

// Two players on one computer: two games joined like a party hunt, one in
// each half of the screen. Player 1 plays on Keyboard 1 (less any keys of
// Keyboard 2), player 2 on Keyboard 2; gamepads go one each.
async function startSplit() {
  const st = screens.partySettings();
  const index = st.level;
  const def = levelDef(index);
  if (screens.lobby.status === 'loading') return;   // already on its way
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
  g2.quiet = true;
  game.viewW = VIEW_W / 2; g2.viewW = VIEW_W / 2;
  renderer.w = VIEW_W / 2; split.renderer.w = VIEW_W / 2;
  const [a, b] = localPair();
  // Each player's nickname (the party menu's NAME is player 1's).
  const players = [{ id: 1, name: save.options.playerName || tr('PLAYER 1') }, { id: 2, name: save.options.playerName2 || tr('PLAYER 2') }];
  const rules = { players, mode: st.mode, goal: st.goal, truce: st.truce, local: true };
  game.newParty(index, new Party(a, { ...rules, id: 1 }));
  g2.newParty(index, new Party(b, { ...rules, id: 2 }));
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

const playerName = () => save.options.playerName || '';

// Connect to the relay (once); false if it can't be reached.
async function connect() {
  if (net && net.status === 'open') return true;
  const conn = net = new Net();
  const ok = await conn.connect();
  if (conn !== net) return false;            // left while connecting
  if (!ok) { screens.lobby = { status: 'error', error: conn.error }; return false; }
  return true;
}

async function hostParty() {
  if (!(await connect())) return;
  const st = screens.partySettings();
  net.send({ t: 'host', name: playerName(), mode: st.mode });
}

async function listRooms() {
  if (await connect()) net.send({ t: 'rooms' });
}

async function joinParty(code, password) {
  if (!(await connect())) return;
  net.send({ t: 'join', code, name: playerName(), password });
}

// The host tells everyone what game is set up (and the server lists it).
function sendSettings() {
  if (!net || !screens.lobby.code || screens.sub !== 'host') return;
  const st = screens.partySettings();
  net.send({ t: 'settings', mode: st.mode, level: st.level, goal: st.goal, truce: st.truce });
}

// While a party level loads, the lobby stops reading messages so the
// others' first moves wait in the inbox for the game.
let partyLoading = null;        // the connection whose party level is loading

// Load a party level; false if it failed or the player left meanwhile.
async function preparePartyLevel(index) {
  const def = levelDef(index);
  if (!def || !def.prepare) return !!def;
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
  if (screens.lobby.status === 'loading') screens.lobby.status = 'open';
  return !!net && net === conn && net.status === 'open' && scene === 'title' && screens.lobby.status !== 'error';
}

function startParty(rules) {
  game.newParty(rules.level, new Party(net, rules));
  irisTime = 0;
  go('play');
}

// The host loads the level first, then tells everyone to start.
// Levels with nothing to load start at once, inside the same tick.
async function hostStart() {
  if (!net || partyLoading === net) return;
  const st = screens.partySettings();
  if (!(await preparePartyLevel(st.level))) return;
  const L = screens.lobby;
  const rules = { level: st.level, mode: st.mode, goal: st.goal, truce: st.truce, players: L.players };
  net.send({ t: 'start', ...rules });
  startParty({ ...rules, id: L.id });
}

async function guestStart(m) {
  const rules = { level: m.level, mode: m.mode, goal: m.goal, truce: m.truce, players: m.players, id: screens.lobby.id };
  if (await preparePartyLevel(m.level)) startParty(rules);
}

function lobbyTick() {
  if (!net || partyLoading === net) return;
  const msgs = net.take();
  for (let k = 0; k < msgs.length; k++) {
    const m = msgs[k];
    const L = screens.lobby;
    if (m.t === 'hosted') { Object.assign(L, { status: 'open', code: m.code, urls: m.urls, id: m.id, players: m.players }); sendSettings(); }
    else if (m.t === 'joined') Object.assign(L, { status: 'open', joined: true, code: m.code, id: m.id, players: m.players, error: null });
    else if (m.t === 'peer') { L.players = m.players; audio.play('select'); sendSettings(); }
    else if (m.t === 'rooms') L.rooms = m.list;
    else if (m.t === 'settings') L.settings = m;
    else if (m.t === 'error') L.error = m.why;
    else if (m.t === 'start') {
      net.inbox.unshift(...msgs.slice(k + 1));   // keep the rest for the game
      guestStart(m);
      return;
    } else if (m.t === 'left') {
      if (m.closed && L.joined) { screens.lobby = { status: 'error', error: 'The host left.' }; return; }
      L.players = (L.players || []).filter((pl) => pl.id !== m.id);
    }
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
  // Screen size changes anywhere, without holding up the game.
  if (input.pressed('smaller')) resize(-1);
  if (input.pressed('bigger')) resize(1);
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
    case 'cinema': {
      const c = cinema;
      if (sceneTime > 20 && ['start', 'jump', 'pause', 'fire'].some((k) => input.pressed(k))) { endFilms(); break; }
      // The film's frames go by its own clock; the next film loads meanwhile.
      if (c.film) {
        const done = c.film.advance(TICK_MS);
        playCues(c);
        if (done) {
          c.last = c.film;
          c.film = null;
          if (++c.i < c.reels.length) startReel(c);
          else endFilms();
        }
      }
      break;
    }
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
      } else if (action === 'local-start') startSplit();
      else if (action === 'host') hostParty();
      else if (action === 'rooms') listRooms();
      else if (action.startsWith('join:')) { const [code, password] = action.slice(5).split(':'); joinParty(code, password); }
      else if (action === 'leave') { if (net) net.close(); net = null; }
      else if (action === 'settings') sendSettings();
      else if (action === 'host-password') { if (net) net.send({ t: 'password', password: screens.lobby.password || '' }); }
      else if (action === 'pname' || action.startsWith('pname+')) {
        save.options.playerName = screens.typedName;
        writeSave(save);
        if (action === 'pname+host') hostParty();
        else if (action === 'pname+rooms') listRooms();
      } else if (action === 'pname2') { save.options.playerName2 = screens.typedName; writeSave(save); }
      else if (action === 'pname1+local' || action === 'pname2+local') {
        save.options[action === 'pname1+local' ? 'playerName' : 'playerName2'] = screens.typedName;
        writeSave(save);
        // Both named: off they go; else the other name is asked for next.
        if (save.options.playerName && save.options.playerName2) startSplit();
        else screens.askLocalName(save.options.playerName ? 2 : 1, save);
      }
      else if (action === 'party-start') hostStart();
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
        // Esc asks before leaving (the game goes on meanwhile; the others
        // are told if you go); Enter after the result.
        if (game.party.result && (input.pressed('start') || input.pressed('pause'))) { toMenu(); break; }
        if (leaveAsk(input.pressed('pause'), input.pressed('start'))) break;
        game.update(leaving ? IDLE : input);
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
        if (def.jj2) {
          const next = nextPlayable(def.next);
          // Past the last level of the game: the ending film first.
          if (next) showCard(next, false); else if (def.ending) playFilms(ENDING, endGame); else endGame();
        } else if (game.levelIndex + 1 < LEVELS.length) showCard(game.levelIndex + 1, false);
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
      if (done && (input.pressed('start') || split.input.pressed('start') || input.pressed('pause') || split.input.pressed('pause'))) { toMenu(); break; }
      if (leaveAsk(input.pressed('pause') || split.input.pressed('pause'), input.pressed('start') || split.input.pressed('start'))) break;
      game.update(leaving ? IDLE : input);
      split.game.update(leaving ? IDLE : split.input);
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

// Leaving a party game: Esc asks, ENTER leaves, Esc again plays on.
// True once it has left.
let leaving = false;
const IDLE = { held: () => false, pressed: () => false, released: () => false, padPressed: () => false };
function leaveAsk(esc, enter) {
  if (!leaving) {
    if (esc) { leaving = true; audio.play('pause'); }
    return false;
  }
  if (enter) { leaving = false; toMenu(); return true; }
  if (esc) { leaving = false; audio.play('select'); }
  return false;
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

// The film, or the last one's last frame while the next loads (black before any).
function drawCinema() {
  const film = cinema && (cinema.film || cinema.last);
  if (film) film.draw(ctx, VIEW_W, VIEW_H);
  else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
}

function render(alpha) {
  if (scene === 'splash') return screens.splash(sceneTime, gated);
  if (scene === 'cinema') return drawCinema();
  if (scene === 'split') { renderSplit(alpha); if (leaving) screens.leaveAsk(); return null; }
  if (scene === 'title') return screens.title(game.time, save);
  if (scene === 'card') return screens.card(game, sceneTime, save);
  if (game.state === 'win') return screens.win(game, game.overTime || 0);
  renderer.world(game, alpha);
  if (game.state !== 'clear' || game.clearTime < 70) renderer.hud(game);
  if (game.state === 'clear') screens.tally(game);
  if (game.state === 'gameover') screens.gameOver(game, game.overTime || 0);
  if (scene === 'paused') screens.pause(sceneTime, save);
  if (leaving && game.party) screens.leaveAsk();
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
