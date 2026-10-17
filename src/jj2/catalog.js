// The original JJ2 level packs in Levels/, as playable level definitions. A
// definition is a function that builds a fresh level (like the ones in
// src/levels.js) once `prepare()` has fetched and parsed its files. Keys look
// like "jj2:xx:2" (pack id, level number).

import { addTrack } from '../audio.js';
import { parseLevel, parseTileset } from './files.js';
import { JJ2Level } from './level.js';

// Tracker music (.xm/.mod/.it) can't play in the browser, so those levels
// borrow a soundtrack of ours instead.
export const PACKS = [
  {
    id: 'xx',
    title: 'Xenobiotic Xeranthemum 2',
    blurb: 'A five-level episode: desert oasis, sapphire islands, a dark park, space and an Aztec jungle.',
    dir: 'Levels/xenobiotic-xeranthemum2/',
    levels: [
      { file: 'Xenobiotic Xeranthemum2.j2l', music: 'carrotus' },
      { file: 'xx22.j2l', music: 'beach' },
      { file: 'xx23.j2l' },
      { file: 'xx24.j2l', music: 'castle' },
      { file: 'xx25.j2l' },
    ],
  },
  {
    id: 'overgrown',
    title: 'Overgrown',
    blurb: 'A battle arena by Laro B. - made for two players. Great for PARTY mode!',
    dir: 'Levels/overgrown/',
    party: true,
    levels: [{ file: 'xlmovergrown.j2l', music: 'jungle' }],
  },
  {
    id: 'threed',
    title: 'Threed Realms',
    blurb: 'Needs the retail tile set Jungle1.j2t: copy it into Levels/ThreedRealms v3/ to play.',
    dir: 'Levels/ThreedRealms v3/',
    levels: [{ file: 'ThreedRealms.j2l' }],
  },
];

const files = new Map();      // url -> Promise of parsed file

function fetchParsed(url, parse) {
  if (!files.has(url)) {
    files.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Missing ${decodeURIComponent(url.split('/').pop())}`);
      return r.arrayBuffer();
    }).then(parse));
    files.get(url).catch(() => files.delete(url));
  }
  return files.get(url);
}

const url = (pack, name) => pack.dir + name.split('/').map(encodeURIComponent).join('/');

// Find a file in a pack ignoring case (JJ2 names are case-insensitive).
function packFile(pack, name) {
  const lower = name.toLowerCase();
  const known = [...pack.levels.map((l) => l.file), ...(pack.tilesets || [])];
  return known.find((f) => f.toLowerCase() === lower) || name;
}

const defs = new Map();

export function jj2Def(key) {
  if (defs.has(key)) return defs.get(key);
  const [, packId, n] = key.split(':');
  const pack = PACKS.find((p) => p.id === packId);
  const entry = pack && pack.levels[Number(n)];
  if (!entry) return null;
  const state = { level: null, ts: null };
  const def = (opts = {}) => {
    if (!state.level) throw new Error('JJ2 level not loaded yet');
    const file = state.level;
    const music = entry.music || musicKey(pack, file.music);
    const meta = {
      name: file.title || entry.file, theme: 'jj2', music, jj2: true, playerH: 28,
      dark: null,
    };
    return new JJ2Level(file, state.ts, meta, opts);
  };
  def.key = key;
  def.jj2 = true;
  def.pack = pack;
  def.title = entry.title || entry.file.replace(/\.j2l$/i, '');
  def.tip = pack.blurb;
  def.next = Number(n) + 1 < pack.levels.length ? `jj2:${pack.id}:${Number(n) + 1}` : null;
  def.loaded = () => (state.level ? { file: state.level, ts: state.ts } : null);
  def.prepare = async () => {
    if (state.level) return def;
    const level = await fetchParsed(url(pack, entry.file), parseLevel);
    const tsName = /\.j2t$/i.test(level.tileset) ? level.tileset : `${level.tileset}.j2t`;
    state.ts = await fetchParsed(url(pack, packFile(pack, tsName)), parseTileset);
    state.level = level;
    def.title = level.title || def.title;
    return def;
  };
  defs.set(key, def);
  return def;
}

// Level music: ogg and mp3 files play as they are.
function musicKey(pack, name) {
  if (!/\.(ogg|mp3)$/i.test(name || '')) return 'jungle';
  const key = `jj2:${pack.id}:${name}`;
  addTrack(key, url(pack, name));
  return key;
}

// Every level of every pack, in menu order.
export function allJJ2() {
  const out = [];
  for (const pack of PACKS) pack.levels.forEach((_, i) => out.push(jj2Def(`jj2:${pack.id}:${i}`)));
  return out;
}
