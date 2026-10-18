// Keyboard input sampled once per tick, with edge detection. The play keys
// can be rebound (OPTIONS > KEYBOARD, saved); menu keys stay fixed.

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
// Always bound: Enter/Space choose in menus, Escape pauses and goes back.
const FIXED = {
  start: ['Enter', 'Space'],
  mute: ['KeyM'],
  clear: ['Backspace', 'Delete'],
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`w${i + 1}`, [`Digit${i + 1}`, `Numpad${i + 1}`]])),
};

export function defaultKeys() {
  return Object.fromEntries(REBINDABLE.map((a) => [a, [...DEFAULT_KEYS[a]]]));
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
  constructor(target, keys = null) {
    this.down = new Set();
    this.state = {};
    this.prev = {};
    this.captureFn = null;
    this.setKeys(keys);
    target.addEventListener('keydown', (event) => {
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
    });
    target.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  // Use these play keys (missing or broken entries fall back to the defaults).
  setKeys(keys) {
    const play = {};
    for (const a of REBINDABLE) {
      const list = keys && Array.isArray(keys[a]) ? keys[a].filter((c) => typeof c === 'string') : [];
      play[a] = list.length ? list : [...DEFAULT_KEYS[a]];
    }
    this.bindings = { ...FIXED, ...play, pause: [...play.pause, 'Escape'] };
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
  }

  // Call once per simulation tick.
  sample() {
    for (const [action, codes] of Object.entries(this.bindings)) {
      this.prev[action] = this.state[action];
      this.state[action] = codes.some((code) => this.down.has(code));
    }
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
