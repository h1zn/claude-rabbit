// Sound (WebAudio): JJ2 sound samples (assets/sfx/, mapped in sfxmap.js),
// recorded soundtracks (Soundtracks/) and the levels' tracker music, with the
// original synthesized effects and chiptunes as fallbacks.

const NOTE_INDEX = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };

export function freq(note) {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) throw new Error(`bad note ${note}`);
  return 440 * Math.pow(2, (NOTE_INDEX[match[1]] + (Number(match[2]) - 4) * 12) / 12);
}

function bars(list) {
  const out = [];
  let step = 0;
  for (const [note, len] of list) {
    if (note !== '.') out.push({ step, note, len });
    step += len;
  }
  return { events: out, length: step };
}

function arp(notes, times) {
  const out = [];
  for (let i = 0; i < times; i++) for (const n of notes) out.push([n, 1]);
  return out;
}

// ---------------------------------------------------------------- original songs

const SONGS = {
  title: {
    bpm: 132, leadWave: 'square', leadVol: 0.07, drums: true, arpOct: 5,
    lead: bars([
      ['D5', 2], ['G5', 2], ['B5', 4], ['A5', 2], ['G5', 2], ['D5', 4],
      ['E5', 2], ['G5', 2], ['B5', 4], ['C6', 2], ['B5', 2], ['G5', 4],
      ['C5', 2], ['E5', 2], ['G5', 3], ['E5', 1], ['F#5', 2], ['G5', 2], ['A5', 4],
      ['A5', 4], ['F#5', 4], ['D5', 4], ['.', 4],
      ['B5', 2], ['D6', 2], ['G6', 4], ['F#6', 2], ['E6', 2], ['D6', 4],
      ['G5', 2], ['B5', 2], ['E6', 4], ['D6', 2], ['B5', 2], ['G5', 4],
      ['E5', 2], ['G5', 2], ['C6', 4], ['B5', 2], ['A5', 2], ['G5', 2], ['A5', 2],
      ['F#5', 4], ['A5', 4], ['D6', 8],
    ]),
    roots: ['G2', 'E2', 'C3', 'D3', 'G2', 'E2', 'C3', 'D3'],
    chords: [['G', 'B', 'D'], ['E', 'G', 'B'], ['C', 'E', 'G'], ['D', 'F#', 'A'], ['G', 'B', 'D'], ['E', 'G', 'B'], ['C', 'E', 'G'], ['D', 'F#', 'A']],
  },
  meadow: {
    bpm: 150, leadWave: 'square', leadVol: 0.07, drums: true, arpOct: 5,
    lead: bars([
      ['E5', 2], ['G5', 2], ['C6', 4], ['B5', 2], ['A5', 2], ['G5', 4],
      ['A5', 2], ['C6', 2], ['E6', 4], ['D6', 2], ['C6', 2], ['A5', 4],
      ['F5', 2], ['A5', 2], ['C6', 3], ['A5', 1], ['G5', 2], ['F5', 2], ['E5', 4],
      ['D5', 2], ['G5', 2], ['B5', 4], ['A5', 2], ['G5', 2], ['D5', 4],
      ['E5', 2], ['G5', 2], ['C6', 4], ['E6', 2], ['D6', 2], ['C6', 4],
      ['B5', 2], ['G5', 2], ['E5', 4], ['G5', 2], ['B5', 2], ['E6', 4],
      ['F5', 2], ['A5', 2], ['C6', 4], ['B5', 2], ['D6', 2], ['G5', 4],
      ['E6', 4], ['C6', 4], ['G5', 4], ['C6', 4],
    ]),
    roots: ['C3', 'A2', 'F2', 'G2', 'C3', 'E2', 'F2', 'C3'],
    chords: [['C', 'E', 'G'], ['A', 'C', 'E'], ['F', 'A', 'C'], ['G', 'B', 'D'], ['C', 'E', 'G'], ['E', 'G', 'B'], ['F', 'A', 'C'], ['C', 'E', 'G']],
  },
  winter: {
    bpm: 140, leadWave: 'triangle', leadVol: 0.13, drums: true, bells: true, arpOct: 5,
    lead: bars([
      ['D5', 2], ['F5', 2], ['A5', 2], ['D6', 2], ['C6', 2], ['A5', 2], ['F5', 4],
      ['D5', 2], ['F5', 2], ['A#5', 4], ['A5', 2], ['F5', 2], ['D5', 4],
      ['C5', 2], ['F5', 2], ['A5', 4], ['G5', 2], ['F5', 2], ['C6', 4],
      ['E5', 2], ['G5', 2], ['C6', 4], ['E6', 4], ['D6', 4],
      ['F6', 2], ['E6', 2], ['D6', 4], ['A5', 2], ['C6', 2], ['D6', 4],
      ['D6', 2], ['C6', 2], ['A#5', 4], ['F5', 2], ['A5', 2], ['A#5', 4],
      ['G5', 2], ['A#5', 2], ['D6', 4], ['C6', 2], ['A#5', 2], ['G5', 4],
      ['E5', 4], ['A5', 4], ['C#6', 8],
    ]),
    roots: ['D3', 'A#2', 'F2', 'C3', 'D3', 'A#2', 'G2', 'A2'],
    chords: [['D', 'F', 'A'], ['A#', 'D', 'F'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['D', 'F', 'A'], ['A#', 'D', 'F'], ['G', 'A#', 'D'], ['A', 'C#', 'E']],
  },
  crystal: {
    bpm: 120, leadWave: 'triangle', leadVol: 0.11, drums: false, arpOct: 4,
    lead: bars([
      ['A4', 4], ['C5', 4], ['E5', 4], ['D5', 4],
      ['C5', 4], ['A4', 4], ['F4', 6], ['.', 2],
      ['G4', 4], ['C5', 4], ['E5', 4], ['G5', 4],
      ['G#5', 6], ['E5', 2], ['B4', 8],
      ['A5', 4], ['G5', 2], ['E5', 2], ['C5', 4], ['E5', 4],
      ['F5', 4], ['E5', 2], ['C5', 2], ['A4', 8],
      ['G4', 2], ['C5', 2], ['E5', 2], ['G5', 2], ['C6', 8],
      ['B5', 4], ['G#5', 4], ['E5', 8],
    ]),
    roots: ['A2', 'F2', 'C3', 'E2', 'A2', 'F2', 'C3', 'E2'],
    chords: [['A', 'C', 'E'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['E', 'G#', 'B'], ['A', 'C', 'E'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['E', 'G#', 'B']],
  },
  rush: {
    bpm: 172, leadWave: 'square', leadVol: 0.06, drums: true, arpOct: 5,
    lead: bars([
      ...arp(['C6', 'E6', 'G6', 'E6', 'C6', 'E6', 'G6', 'C7'], 2),
      ...arp(['F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'C6', 'F6'], 2),
      ...arp(['G5', 'B5', 'D6', 'B5', 'G5', 'B5', 'D6', 'G6'], 2),
      ['C6', 2], ['G5', 2], ['E6', 2], ['C6', 2], ['G6', 8],
    ]),
    roots: ['C3', 'F2', 'G2', 'C3'],
    chords: [['C', 'E', 'G'], ['F', 'A', 'C'], ['G', 'B', 'D'], ['C', 'E', 'G']],
  },
};

// ---------------------------------------------------------------- engine

import { JJ2_LOOPS, JJ2_SFX, SFX_COUNT, SFX_FILES, SFX_MAP } from './sfxmap.js';

// Recorded soundtracks (Soundtracks/). Anything not listed here plays one of
// the synthesized songs above instead.
export const TRACKS = {
  // The sugar rush (new/Sounds/Rush-Sound.wav: 21.5 s for the 20 s rush).
  rush: { url: 'assets/sfx/rush.wav' },
  intro: { file: '0. Intro.mp3', loop: false },
  title: { file: '1. Menu.mp3' },
  castle: { file: '2. Castle.mp3' },
  carrotus: { file: '3. Carrotus.mp3' },
  beach: { file: '7. Beach Bunny.mp3' },
  jungle: { file: 'C. Jungle Fevah.mp3' },
};
// Music that comes with a level pack: an .ogg or .mp3 plays as it is,
// tracker music (`mod`) through libopenmpt, or `fallback` where the browser
// can't run it (AudioWorklet needs localhost or https).
export function addTrack(name, def) { if (!TRACKS[name]) TRACKS[name] = def; }

// Tracker music shaped like the <audio> element the track code expects.
class ModElement {
  constructor(ctx, url, out) {
    this.url = url;
    this.loaded = false;
    this.wanted = false;
    this.onended = null;
    this.failed = false;
    this.onFail = null;
    this.ready = import('../vendor/chiptune3/chiptune3.js').then(({ ChiptuneJsPlayer }) => new Promise((resolve) => {
      const player = new ChiptuneJsPlayer({ context: ctx, repeatCount: -1 });
      // The worklet can fail without a word: give up after a few seconds.
      const timer = setTimeout(() => resolve(null), 6000);
      player.onInitialized(() => { clearTimeout(timer); player.gain.connect(out); resolve(player); });
      // A pause asked for while the song was still loading.
      player.onMetadata(() => { if (!this.wanted) player.pause(); });
      player.onError(() => { clearTimeout(timer); this.fail(); resolve(null); });
    })).catch(() => null).then((p) => { if (!p) this.fail(); return p; });
  }

  get currentTime() { return 0; }
  set currentTime(v) { if (v === 0 && this.loaded) this.ready.then((p) => p && p.setPos(0)); }

  play() {
    this.wanted = true;
    this.ready.then((p) => {
      if (!p || !this.wanted) return;
      if (this.loaded) p.unpause();
      else { this.loaded = true; p.load(this.url); }
    });
    return Promise.resolve();
  }

  pause() {
    this.wanted = false;
    this.ready.then((p) => { if (p && this.loaded) p.pause(); });
  }

  fail() {
    if (this.failed) return;
    this.failed = true;
    if (this.onFail) this.onFail();
  }
}
const TRACK_VOLUME = 0.42;   // background level, well under the effects
const FADE = 1.2;            // seconds for fades between tracks

export class Audio {
  constructor() {
    this.volScale = 1;
    this.ctx = null;
    this.muted = false;
    this.song = null;
    this.hoverNode = null;
    this.tracks = {};       // name -> { el, gain }
    this.track = null;      // name of the playing recorded track
    this.musicVol = 0.7;    // 0..1 options
    this.sfxVol = 0.9;
  }

  // Volume options (0..1), applied now or when audio unlocks.
  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.trackBus.gain.value = TRACK_VOLUME * music / 0.7;
    this.musicBus.gain.value = 0.5 * music / 0.7;
    this.sfxBus.gain.value = sfx;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    this.trackBus = c.createGain();
    this.trackBus.gain.value = TRACK_VOLUME;
    this.trackBus.connect(this.master);
    // Echo send for a fuller music sound.
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.19;
    const feedback = c.createGain();
    feedback.gain.value = 0.28;
    const wet = c.createGain();
    wet.gain.value = 0.22;
    this.musicBus.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    const length = c.sampleRate;
    this.noiseBuffer = c.createBuffer(1, length, c.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.loadSamples();
  }

  // Sound files from assets/sfx, decoded once audio is unlocked.
  async loadSamples() {
    this.samples = [];
    this.named = {};
    this.jj2 = {};
    // JJ2's own samples, by name (several events share some).
    const files = new Map();
    const load = (n) => {
      if (!files.has(n)) {
        files.set(n, fetch(`assets/sfx/jj2/${n.replace('/', '_')}.wav`).then((r) => r.arrayBuffer()).then((d) => this.ctx.decodeAudioData(d))
          .catch((e) => { console.warn('sound', n, e); return null; }));
      }
      return files.get(n);
    };
    for (const [event, list] of Object.entries({ ...JJ2_SFX, ...Object.fromEntries(Object.entries(JJ2_LOOPS).map(([k, n]) => [`loop:${k}`, [n]])) })) {
      Promise.all(list.map(load)).then((bufs) => { const ok = bufs.filter(Boolean); if (ok.length) this.jj2[event] = ok; });
    }
    for (const [name, file] of Object.entries(SFX_FILES)) {
      fetch(`assets/sfx/${file}.wav`).then((r) => r.arrayBuffer()).then((d) => this.ctx.decodeAudioData(d))
        .then((buf) => { this.named[name] = buf; }).catch((e) => console.warn('sound', file, e));
    }
    await Promise.all(Array.from({ length: SFX_COUNT }, async (_, i) => {
      try {
        const data = await (await fetch(`assets/sfx/sound${i}.wav`)).arrayBuffer();
        this.samples[i] = await this.ctx.decodeAudioData(data);
      } catch (e) {
        console.warn('sound', i, e);
      }
    }));
  }

  sample(i, vol = 0.9 * this.volScale) {
    return this.buffer(this.samples && this.samples[i], vol);
  }

  buffer(buf, vol = 0.9 * this.volScale) {
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(this.sfxBus);
    src.start();
    return true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    if (this.muted) { this.hover(false); this.board(false); }
  }

  tone({ wave = 'square', from, to = from, dur, vol = 0.15, delay = 0, bus = this.sfxBus, attack = 0.005 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol * this.volScale, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise({ dur, vol = 0.2, filter = 2000, type = 'lowpass', delay = 0, bus = this.sfxBus, sweep = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * this.volScale, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(gain).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  notes(list, { wave = 'square', step = 0.07, dur = 0.12, vol = 0.12 } = {}) {
    list.forEach((n, i) => this.tone({ wave, from: freq(n), dur, vol, delay: i * step }));
  }

  // `vol` scales the sound (0-1): world sounds fade with distance (Game.sound).
  // A sound file (the cinematics' sounds), decoded once: a Promise of its
  // buffer, or null.
  load(url) {
    if (!this.ctx) return Promise.resolve(null);
    this.files = this.files || new Map();
    if (!this.files.has(url)) {
      this.files.set(url, fetch(url).then((r) => r.arrayBuffer()).then((d) => this.ctx.decodeAudioData(d))
        .catch((e) => { console.warn('sound', url, e); return null; }));
    }
    return this.files.get(url);
  }

  // Play a sound file at `vol` (0..1) and `pan` (-1 left .. 1 right); the
  // cues still sounding stop with stopCues().
  async cue(url, vol = 1, pan = 0) {
    const buf = await this.load(url);
    if (!buf || this.muted || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(gain).connect(panner).connect(this.sfxBus);
    this.cues = (this.cues || []).filter((c) => !c.ended);
    this.cues.push(src);
    src.onended = () => { src.ended = true; };
    src.start();
  }

  stopCues() {
    for (const c of this.cues || []) if (!c.ended) { try { c.stop(); } catch (e) { /* not started */ } }
    this.cues = [];
  }

  play(name, vol = 1) {
    if (!this.ctx || this.muted || vol <= 0) return;
    this.volScale = vol;
    try { this.playNow(name); } finally { this.volScale = 1; }
  }

  playNow(name) {
    const jj2 = this.jj2 && this.jj2[name];
    if (jj2 && this.buffer(jj2[Math.floor(Math.random() * jj2.length)])) return;
    if (this.named && this.named[name] && this.buffer(this.named[name])) return;
    if (SFX_MAP[name] !== undefined && this.sample(SFX_MAP[name])) return;
    switch (name) {
      case 'jump': this.tone({ from: 300, to: 820, dur: 0.12, vol: 0.11 }); break;
      case 'land': this.noise({ dur: 0.08, vol: 0.2, filter: 420 }); break;
      case 'shoot':
        this.tone({ from: 1500, to: 300, dur: 0.09, vol: 0.08 });
        this.noise({ dur: 0.03, vol: 0.07, filter: 5000, type: 'highpass' });
        break;
      case 'spread': this.tone({ wave: 'sawtooth', from: 1000, to: 220, dur: 0.12, vol: 0.07 }); break;
      // Something thrown (the monkey's banana): a quick whoosh.
      case 'throw': this.noise({ dur: 0.12, vol: 0.12, filter: 700, sweep: 2600, type: 'bandpass' }); break;
      case 'scream':
        this.tone({ wave: 'sawtooth', from: 900, to: 1400, dur: 0.5, vol: 0.12 });
        this.tone({ wave: 'square', from: 1300, to: 700, dur: 0.6, vol: 0.06, delay: 0.1 });
        this.noise({ dur: 0.6, vol: 0.1, filter: 2500, type: 'bandpass' });
        break;
      case 'bounce': this.tone({ wave: 'sine', from: 260, to: 620, dur: 0.07, vol: 0.09 }); break;
      case 'freeze':
        this.tone({ wave: 'triangle', from: 2400, to: 1200, dur: 0.14, vol: 0.06 });
        this.noise({ dur: 0.1, vol: 0.06, filter: 7000, type: 'highpass' });
        break;
      case 'missile': this.noise({ dur: 0.25, vol: 0.12, filter: 600, sweep: 2400, type: 'bandpass' }); break;
      case 'flame': this.noise({ dur: 0.06, vol: 0.05, filter: 900, type: 'lowpass' }); break;
      case 'tnt': this.tone({ wave: 'square', from: 180, to: 140, dur: 0.06, vol: 0.06 }); break;
      case 'pepper': this.noise({ dur: 0.05, vol: 0.09, filter: 2500, type: 'bandpass' }); break;
      case 'electro':
        this.tone({ wave: 'sawtooth', from: 90, to: 1800, dur: 0.16, vol: 0.06 });
        this.tone({ wave: 'square', from: 1800, to: 90, dur: 0.16, vol: 0.03 });
        break;
      case 'boom':
        this.tone({ wave: 'triangle', from: 160, to: 30, dur: 0.6, vol: 0.28 });
        this.noise({ dur: 0.7, vol: 0.3, filter: 900, sweep: 80 });
        break;
      case 'weapon': this.tone({ wave: 'square', from: 660, to: 990, dur: 0.05, vol: 0.06 }); break;
      case 'ammo': this.notes(['E5', 'B5'], { step: 0.05, dur: 0.08, vol: 0.08 }); break;
      // Hitting an enemy: a short, bright knock (nothing like the hero's hurt).
      case 'hit':
        this.noise({ dur: 0.05, vol: 0.22, filter: 2600, type: 'bandpass' });
        this.tone({ wave: 'square', from: 1400, to: 700, dur: 0.05, vol: 0.06 });
        break;
      // An enemy defeated: a pop that falls away.
      case 'kill':
        this.tone({ wave: 'square', from: 900, to: 1800, dur: 0.05, vol: 0.07 });
        this.tone({ wave: 'triangle', from: 700, to: 90, dur: 0.22, vol: 0.18, delay: 0.04 });
        this.noise({ dur: 0.16, vol: 0.12, filter: 1600, sweep: 300, delay: 0.03 });
        break;
      case 'stomp':
        this.tone({ wave: 'sine', from: 240, to: 70, dur: 0.12, vol: 0.28 });
        this.tone({ wave: 'square', from: 520, to: 1040, dur: 0.08, vol: 0.06, delay: 0.05 });
        break;
      // A shell ricocheting off a wall: a hollow clack.
      case 'shell':
        this.tone({ wave: 'triangle', from: 520, to: 380, dur: 0.06, vol: 0.12 });
        this.noise({ dur: 0.03, vol: 0.08, filter: 1800, type: 'bandpass' });
        break;
      case 'blob': this.tone({ wave: 'sine', from: 160, to: 420, dur: 0.14, vol: 0.12 }); break;
      case 'gem':
        this.tone({ wave: 'square', from: 1318, dur: 0.06, vol: 0.06 });
        this.tone({ wave: 'square', from: 1975, dur: 0.12, vol: 0.06, delay: 0.05 });
        break;
      case 'coin':
        this.tone({ wave: 'square', from: 988, dur: 0.06, vol: 0.07 });
        this.tone({ wave: 'square', from: 1319, dur: 0.22, vol: 0.07, delay: 0.06 });
        break;
      case 'food': this.tone({ wave: 'sine', from: 700, to: 1100, dur: 0.06, vol: 0.09 }); this.noise({ dur: 0.04, vol: 0.06, filter: 3000, delay: 0.03 }); break;
      case 'berry': this.notes(['E5', 'G#5', 'B5', 'E6'], { wave: 'triangle', step: 0.06, dur: 0.1, vol: 0.14 }); break;
      case 'crate': this.notes(['A4', 'A5'], { step: 0.07, dur: 0.12, vol: 0.09 }); break;
      case 'spring': this.boing(); break;
      case 'hurt':
        this.tone({ wave: 'sawtooth', from: 520, to: 110, dur: 0.32, vol: 0.15 });
        this.noise({ dur: 0.12, vol: 0.12, filter: 900 });
        break;
      case 'checkpoint': this.notes(['C5', 'E5', 'G5', 'C6'], { wave: 'triangle', step: 0.08, dur: 0.16, vol: 0.15 }); break;
      case 'rush':
        this.notes(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], { step: 0.04, dur: 0.12, vol: 0.08 });
        this.noise({ dur: 0.5, vol: 0.1, filter: 800, sweep: 8000, type: 'bandpass' });
        break;
      case 'break':
        this.noise({ dur: 0.25, vol: 0.3, filter: 1200, sweep: 150 });
        this.tone({ wave: 'triangle', from: 220, to: 60, dur: 0.2, vol: 0.15 });
        break;
      case 'stompStart': this.tone({ wave: 'square', from: 900, to: 300, dur: 0.12, vol: 0.07 }); break;
      case 'stompLand':
        this.tone({ wave: 'sine', from: 140, to: 40, dur: 0.3, vol: 0.4 });
        this.noise({ dur: 0.2, vol: 0.25, filter: 600 });
        break;
      case 'uppercutCharge': this.tone({ wave: 'sawtooth', from: 200, to: 600, dur: 0.22, vol: 0.06 }); break;
      case 'uppercut':
        this.tone({ wave: 'square', from: 400, to: 1600, dur: 0.18, vol: 0.1 });
        this.noise({ dur: 0.15, vol: 0.12, filter: 2000, sweep: 9000, type: 'bandpass' });
        break;
      case 'sign':
        for (let i = 0; i < 10; i++) this.tone({ wave: 'square', from: 600 + i * 90, dur: 0.05, vol: 0.06, delay: i * 0.05 });
        break;
      case 'secret': this.notes(['G5', 'F#5', 'D#5', 'A4', 'G#4', 'E5', 'G#5', 'C6'], { wave: 'triangle', step: 0.07, dur: 0.14, vol: 0.14 }); break;
      case 'fanfare':
        this.notes(['C5', 'C5', 'C5', 'C5', 'G#4', 'A#4', 'C5', 'A#4', 'C5'], { step: 0.11, dur: 0.16, vol: 0.1 });
        this.notes(['C4', 'C4', 'C4', 'C4', 'G#3', 'A#3', 'C4', 'A#3', 'C4'], { wave: 'triangle', step: 0.11, dur: 0.16, vol: 0.16 });
        break;
      case 'death': this.notes(['G4', 'E4', 'C4', 'G3'], { wave: 'triangle', step: 0.14, dur: 0.22, vol: 0.16 }); break;
      case 'gameover': this.notes(['C5', 'G4', 'E4', 'A4', 'B4', 'A4', 'G#4', 'A#4', 'G#4', 'G4'], { wave: 'triangle', step: 0.18, dur: 0.24, vol: 0.14 }); break;
      case 'card': this.tone({ wave: 'sine', from: 200, to: 900, dur: 0.4, vol: 0.12 }); break;
      case 'menu': this.tone({ wave: 'square', from: 660, dur: 0.04, vol: 0.06 }); break;
      case 'select': this.notes(['E5', 'B5'], { step: 0.05, dur: 0.08, vol: 0.08 }); break;
      case 'denied': this.tone({ wave: 'square', from: 180, dur: 0.15, vol: 0.08 }); break;
      case 'pause': this.notes(['E5', 'C5'], { step: 0.06, dur: 0.08, vol: 0.08 }); break;
      case 'tally': this.tone({ wave: 'square', from: 1200, dur: 0.05, vol: 0.06 }); break;
      case 'rank': this.notes(['C6', 'E6', 'G6', 'C7'], { step: 0.05, dur: 0.2, vol: 0.09 }); this.noise({ dur: 0.3, vol: 0.12, filter: 3000 }); break;
      default: break;
    }
  }

  // A spring: a cartoon "boing", a sine rising and wobbling as it fades.
  boing() {
    const c = this.ctx;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const depth = c.createGain();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.45);
    lfo.frequency.setValueAtTime(26, t);
    lfo.frequency.linearRampToValueAtTime(14, t + 0.45);
    depth.gain.setValueAtTime(70, t);
    depth.gain.exponentialRampToValueAtTime(8, t + 0.45);
    lfo.connect(depth).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.22 * this.volScale, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t); lfo.start(t);
    osc.stop(t + 0.5); lfo.stop(t + 0.5);
  }

  // A looping sample (JJ2_LOOPS), started and stopped by `on`. False when the
  // sample isn't loaded.
  loop(key, on, vol = 0.5) {
    this.loops = this.loops || {};
    const cur = this.loops[key];
    if (on && !cur && !this.muted) {
      const buf = this.jj2 && this.jj2[`loop:${key}`];
      if (!buf) return false;
      const src = this.ctx.createBufferSource();
      src.buffer = buf[0]; src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      src.connect(gain).connect(this.sfxBus);
      src.start();
      this.loops[key] = { src, gain };
    } else if (!on && cur) {
      cur.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      cur.src.stop(this.ctx.currentTime + 0.15);
      this.loops[key] = null;
    }
    return true;
  }

  // The airboard's hum while riding.
  board(on) { if (this.ctx) this.loop('board', on, 0.35); }

  hover(on) {
    if (!this.ctx) return;
    // The copter sample when it's loaded, else a synthesized drone.
    if (this.loop('hover', on, 0.45)) on = false;
    if (on && !this.hoverNode && !this.muted) {
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 110;
      lfo.frequency.value = 22;
      lfoGain.gain.value = 18;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.035;
      osc.connect(gain).connect(this.sfxBus);
      osc.start(); lfo.start();
      this.hoverNode = { osc, lfo, gain };
    } else if (!on && this.hoverNode) {
      const { osc, lfo, gain } = this.hoverNode;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      osc.stop(this.ctx.currentTime + 0.1);
      lfo.stop(this.ctx.currentTime + 0.1);
      this.hoverNode = null;
    }
  }

  // ---------------------------------------------------------------- music

  // Play a song by name: a recorded track if there is one, else a synth song.
  // `restart` starts a track from the top; otherwise a track that was paused
  // (say, during a sugar rush) picks up where it left off.
  startMusic(name, { restart = false, onEnd = null } = {}) {
    if (!this.ctx) return;
    this.stopSynth();
    if (TRACKS[name] && TRACKS[name].mod && (!this.ctx.audioWorklet || (this.tracks[name] && this.tracks[name].el.failed))) name = TRACKS[name].fallback;
    if (TRACKS[name]) return this.playTrack(name, restart, onEnd);
    this.fadeTrack(true);
    const song = SONGS[name];
    if (!song) return;
    this.song = { def: song, step: 0, next: this.ctx.currentTime + 0.1 };
    this.timer = setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic() {
    this.stopSynth();
    this.fadeTrack(true);
  }

  stopSynth() {
    clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  }

  // The <audio> element and gain node for a track, made on first use.
  trackNode(name) {
    if (!this.tracks[name]) {
      const def = TRACKS[name];
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.trackBus);
      let el;
      if (def.mod) {
        el = new ModElement(this.ctx, def.mod, gain);
        // Tracker music that can't play hands over to a recorded track.
        el.onFail = () => { if (this.track === name && def.fallback) this.startMusic(def.fallback, { restart: true }); };
      } else {
        el = new window.Audio(def.url || `Soundtracks/${encodeURIComponent(def.file)}`);
        el.loop = def.loop !== false;
        el.preload = 'auto';
        this.ctx.createMediaElementSource(el).connect(gain);
      }
      this.tracks[name] = { el, gain };
    }
    return this.tracks[name];
  }

  playTrack(name, restart, onEnd) {
    if (this.track && this.track !== name) this.fadeTrack(false);
    const t = this.trackNode(name);
    const now = this.ctx.currentTime;
    if (restart) t.el.currentTime = 0;
    t.el.onended = onEnd;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    t.gain.gain.linearRampToValueAtTime(1, now + FADE);
    clearTimeout(t.pauseTimer);
    const p = t.el.play();
    if (p && p.catch) p.catch(() => {});
    this.track = name;
  }

  // Fade the current track out, then pause it (it keeps its position).
  fadeTrack(clear) {
    const name = this.track;
    if (!name) return;
    const t = this.tracks[name];
    const now = this.ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    t.gain.gain.linearRampToValueAtTime(0, now + FADE * 0.6);
    clearTimeout(t.pauseTimer);
    t.pauseTimer = setTimeout(() => t.el.pause(), FADE * 600 + 50);
    if (clear) this.track = null;
  }

  scheduleMusic() {
    if (!this.song || !this.ctx) return;
    const { def } = this.song;
    const stepDur = 60 / def.bpm / 4;
    const loop = def.lead.length;
    const bus = this.musicBus;
    while (this.song.next < this.ctx.currentTime + 0.15) {
      const step = this.song.step % loop;
      const t = this.song.next - this.ctx.currentTime;
      const bar = Math.floor(step / 16) % def.roots.length;
      const inBar = step % 16;
      for (const ev of def.lead.events) {
        if (ev.step !== step) continue;
        const dur = ev.len * stepDur * 0.9;
        this.tone({ wave: def.leadWave, from: freq(ev.note), dur, vol: def.leadVol, delay: t, bus });
        if (def.bells) this.tone({ wave: 'sine', from: freq(ev.note) * 2, dur: Math.min(dur, 0.5), vol: 0.05, delay: t, bus });
      }
      if (inBar % 2 === 0) {
        const root = def.roots[bar];
        const note = inBar % 4 === 2 ? root.replace(/\d/, (d) => String(Number(d) + 1)) : root;
        this.tone({ wave: 'triangle', from: freq(note), dur: stepDur * 1.8, vol: 0.17, delay: t, bus });
      }
      const chord = def.chords[bar];
      this.tone({ wave: 'sine', from: freq(`${chord[inBar % 3]}${def.arpOct}`), dur: stepDur * 0.7, vol: def.drums ? 0.025 : 0.045, delay: t, bus });
      if (def.drums) {
        if (inBar === 0 || inBar === 8 || inBar === 10) this.tone({ wave: 'sine', from: 160, to: 42, dur: 0.13, vol: 0.42, delay: t, bus });
        if (inBar === 4 || inBar === 12) this.noise({ dur: 0.11, vol: 0.18, filter: 1800, type: 'bandpass', delay: t, bus });
        if (def.bells || inBar % 2 === 0) this.noise({ dur: 0.03, vol: def.bells ? 0.045 : 0.06, filter: 7500, type: 'highpass', delay: t, bus });
      } else if (inBar === 0) {
        this.noise({ dur: 0.6, vol: 0.05, filter: 400, delay: t, bus });
      }
      this.song.step++;
      this.song.next += stepDur;
    }
  }
}
