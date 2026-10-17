// Keyboard input sampled once per tick, with edge detection.

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ', 'KeyK'],
  shoot: ['KeyX', 'KeyJ', 'ControlLeft', 'ControlRight'],
  run: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  pause: ['KeyP', 'Escape'],
  start: ['Enter', 'Space'],
  mute: ['KeyM'],
};

export class Input {
  constructor(target) {
    this.down = new Set();
    this.state = {};
    this.prev = {};
    for (const action of Object.keys(BINDINGS)) {
      this.state[action] = false;
      this.prev[action] = false;
    }
    target.addEventListener('keydown', (event) => {
      if (Object.values(BINDINGS).some((codes) => codes.includes(event.code))) event.preventDefault();
      this.down.add(event.code);
    });
    target.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  // Call once per simulation tick.
  sample() {
    for (const [action, codes] of Object.entries(BINDINGS)) {
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
