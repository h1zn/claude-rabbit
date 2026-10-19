// Keyboard and gamepad input sampled once per tick, with edge detection.
// The play keys can be rebound (OPTIONS > CONTROLS, saved); menu keys stay
// fixed. Keyboard 2 is the second player's layout in split screen.

// Rebindable actions, in the order the keyboard screen lists them, with up
// to three keys each.
export const REBINDABLE = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'run', 'weapon', 'pause'];
export const KEY_SLOTS = 3;
export const ACTION_NAMES = {
  left: 'LEFT', right: 'RIGHT', up: 'UP / AIM', down: 'DOWN / CROUCH', jump: 'JUMP',
  shoot: 'FIRE', run: 'RUN', weapon: 'NEXT WEAPON', pause: 'PAUSE',
};
export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ', 'KeyK'],
  shoot: ['KeyX', 'KeyJ', 'ControlLeft'],
  run: ['ShiftLeft', 'KeyL', 'ShiftRight'],
  weapon: ['KeyC', 'Tab'],   // next weapon with ammo
  pause: ['KeyP'],
};
// The manual's Keyboard 2 (party games): WASD, G jump, H fire, J run,
// F next weapon.
export const DEFAULT_KEYS2 = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
  jump: ['KeyG'], shoot: ['KeyH'], run: ['KeyJ'], weapon: ['KeyF'], pause: ['KeyP'],
};
// Always bound: Enter/Space choose in menus, Escape pauses and goes back,
// and the manual's special keys (F1 help, F3/F4 screen size, F5 load, F6 save).
const FIXED = {
  start: ['Enter', 'Space'],
  mute: ['KeyM'],
  clear: ['Backspace', 'Delete'],
  help: ['F1'], smaller: ['F3'], bigger: ['F4'], load: ['F5'], save: ['F6'], page: ['Tab'],
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`w${i + 1}`, [`Digit${i + 1}`, `Numpad${i + 1}`]])),
};
// Player 2 in split screen: only the play keys, ENTER and ESC.
const FIXED2 = { start: ['Enter'] };

// Gamepads (the standard layout): A jump, X or RT fire, B, LB or LT run,
// Y or RB next weapon, START pause; the d-pad or left stick moves. In menus
// A or START choose and B or BACK go back.
const PAD = { jump: [0], shoot: [2, 7], run: [1, 4, 6], weapon: [3, 5], pause: [9, 8] };
const PAD_MENU = { start: [0, 9], jump: [0], pause: [1, 8], page: [5] };
const STICK = 0.5;

export function defaultKeys(second = false) {
  const base = second ? DEFAULT_KEYS2 : DEFAULT_KEYS;
  return Object.fromEntries(REBINDABLE.map((a) => [a, [...base[a]]]));
}

// Connected gamepads, in the order the browser numbers them.
export function connectedPads() {
  try {
    return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((g) => g && g.connected);
  } catch (e) {
    return [];
  }
}

// Put `code` in slot `col` of `action`. A key used by another action swaps
// over (that action gets this slot's old key); it is refused if that would
// leave the other action with no key at all. Returns false when refused.
export function bindKey(keys, action, col, code) {
  const old = keys[action][col] || null;
  for (const other of REBINDABLE) {
    const j = keys[other].indexOf(code);
    if (j < 0 || (other === action && j === col)) continue;
    if (old) keys[other][j] = old;
    else if (keys[other].length > 1 || other === action) keys[other].splice(j, 1);
    else return false;
  }
  const list = keys[action];
  if (col < list.length) list[col] = code; else list.push(code);
  keys[action] = [...new Set(list)].slice(0, KEY_SLOTS);
  return true;
}

// Clear a slot; an action keeps at least one key.
export function clearKey(keys, action, col) {
  if (keys[action].length <= 1 || col >= keys[action].length) return false;
  keys[action].splice(col, 1);
  return true;
}

// A short label for a key code ("KeyZ" -> "Z", "ArrowLeft" -> "LEFT").
export function keyName(code) {
  if (!code) return '-';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `NUM ${code.slice(6)}`;
  const names = {
    ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN', Space: 'SPACE', Enter: 'ENTER',
    ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'L ALT',
    AltRight: 'R ALT', Tab: 'TAB', Backspace: 'BACKSPACE', Escape: 'ESC', CapsLock: 'CAPS', Comma: ',', Period: '.',
    Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
  };
  return names[code] || code.toUpperCase();
}

export class Input {
  // `second`: player 2's input in split screen (Keyboard 2, no menu keys).
  constructor(target, keys = null, { second = false } = {}) {
    this.down = new Set();
    this.tapped = new Set();   // keys pressed since the last tick (a quick tap still counts)
    this.state = {};
    this.prev = {};
    this.pad = {};
    this.padPrev = {};
    this.captureFn = null;
    this.second = second;
    this.menu = true;          // gamepad buttons map to menu actions
    this.padRole = 'any';      // which gamepads to read: any | p1 | p2 | none
    this.onAltEnter = null;
    this.setKeys(keys);
    target.addEventListener('keydown', (event) => {
      // Alt+Enter toggles fullscreen (and is not an ENTER).
      if (event.altKey && (event.code === 'Enter' || event.code === 'NumpadEnter')) {
        event.preventDefault();
        if (!this.second && this.onAltEnter && !event.repeat) this.onAltEnter();
        return;
      }
      // Rebinding: the next key goes to the keyboard screen, not the game.
      if (this.captureFn) {
        event.preventDefault();
        const fn = this.captureFn;
        this.captureFn = null;
        fn(event.code);
        return;
      }
      if (this.bound.has(event.code)) event.preventDefault();
      this.down.add(event.code);
      this.tapped.add(event.code);
    });
    target.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('blur', () => { this.down.clear(); this.tapped.clear(); });
  }

  // Use these play keys (missing or broken entries fall back to the
  // defaults). Keys in `without` are left out: in split screen, player 1
  // gives up the keys of player 2's layout.
  setKeys(keys, without = null) {
    const play = {};
    const base = this.second ? DEFAULT_KEYS2 : DEFAULT_KEYS;
    for (const a of REBINDABLE) {
      const list = keys && Array.isArray(keys[a]) ? keys[a].filter((c) => typeof c === 'string') : [];
      play[a] = list.length ? list : [...base[a]];
      if (without) play[a] = play[a].filter((c) => !without.has(c));
    }
    this.bindings = { ...(this.second ? FIXED2 : FIXED), ...play, pause: [...play.pause, 'Escape'] };
    this.bound = new Set(Object.values(this.bindings).flat());
    for (const action of Object.keys(this.bindings)) {
      this.state[action] = this.state[action] || false;
      this.prev[action] = this.prev[action] || false;
    }
  }

  // Hand the next key press to `fn(code)` instead of the game.
  capture(fn) {
    this.captureFn = fn;
    this.down.clear();
    this.tapped.clear();
  }

  // The gamepads this input reads. Alone, every pad drives the hero; in
  // split screen two pads go one each, and a single pad goes to player 2
  // (player 1 keeps the keyboard).
  pads() {
    if (this.padRole === 'none') return [];
    const all = connectedPads();
    if (this.padRole === 'p1') return all.length >= 2 ? [all[0]] : [];
    if (this.padRole === 'p2') return all.length >= 2 ? [all[1]] : all.slice(0, 1);
    return all;
  }

  // The actions held on the gamepads.
  readPads() {
    const out = {};
    const map = this.menu ? { ...PAD, ...PAD_MENU } : PAD;
    for (const g of this.pads()) {
      const b = (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
      const ax = g.axes[0] || 0; const ay = g.axes[1] || 0;
      if (b(14) || ax < -STICK) out.left = true;
      if (b(15) || ax > STICK) out.right = true;
      if (b(12) || ay < -STICK) out.up = true;
      if (b(13) || ay > STICK) out.down = true;
      for (const [action, list] of Object.entries(map)) if (list.some(b)) out[action] = true;
    }
    return out;
  }

  // Call once per simulation tick.
  sample() {
    this.padPrev = this.pad;
    this.pad = this.readPads();
    for (const [action, codes] of Object.entries(this.bindings)) {
      this.prev[action] = this.state[action];
      this.state[action] = codes.some((code) => this.down.has(code) || this.tapped.has(code)) || !!this.pad[action];
    }
    this.tapped.clear();
  }

  // A gamepad button pressed this tick (for screens where the keyboard types).
  padPressed(action) {
    return !!this.pad[action] && !this.padPrev[action];
  }

  held(action) {
    return this.state[action];
  }

  pressed(action) {
    return this.state[action] && !this.prev[action];
  }

  released(action) {
    return !this.state[action] && this.prev[action];
  }
}
