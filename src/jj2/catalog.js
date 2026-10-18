// The original JJ2 level packs in Levels/, as playable level definitions. A
// definition is a function that builds a fresh level (like the ones in
// src/levels.js) once `prepare()` has fetched and parsed its files. Keys look
// like "jj2:xx:2" (pack id, level number).

import { addTrack } from '../audio.js';
import { applyMlleLayers, composeTileset, parseLevel, parseTileset } from './files.js';
import { JJ2Level } from './level.js';

// `music` names the soundtrack of ours a level falls back to when its own
// music can't play.
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
    id: 'episode2',
    title: 'Episode 2',
    blurb: "KingofKoopas' long-lost episode: House of the Shells, Chrysalis Caves, Deserto, a shipwreck and Baddy Breeding, with story levels between.",
    dir: 'Levels/Episode2/',
    levels: Array.from({ length: 17 }, (_, i) => ({ file: `ep2-${i + 1}.j2l` })),
  },
  {
    id: 'bl18',
    title: 'BL18',
    blurb: 'A JJ2+ pack built on scripts and extra tile sets. Only the levels whose tile sets are in the folder are listed.',
    dir: 'Levels/BL18/',
    levels: ['BL18_level01', 'BL18_level02', 'BL18_level03', 'BL18_level04', 'BL18_level05', 'BL18_level06', 'BL18_level07', 'BL18_Guardian', 'BL18_save'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'threed',
    title: 'Threed Realms',
    blurb: 'Needs the retail tile sets Jungle1, Town1 and Diam1 (.j2t) copied into Levels/ThreedRealms v3/ to play.',
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
const j2t = (name) => (/\.j2t$/i.test(name) ? name : `${name}.j2t`);

// Find a file in a pack ignoring case (JJ2 names are case-insensitive).
function packFile(pack, name) {
  const lower = name.toLowerCase();
  const known = [...pack.levels.map((l) => l.file), ...(pack.files || pack.tilesets || [])];
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
    const music = musicKey(pack, file.music, entry.music || 'jungle');
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
  def.next = null;
  def.loaded = () => (state.level ? { file: state.level, ts: state.ts } : null);
  // Name and link the level from its own file first, so the menu shows its
  // real title (and a story chain can skip it) even if a tile set is missing.
  const readHeader = (level) => {
    def.title = (level.title || '').trim() || def.title;
    const bare = (f) => f.toLowerCase().replace(/\.j2l$/, '');
    const j = pack.levels.findIndex((l) => bare(l.file) === bare(level.next || ''));
    def.next = j >= 0 && j !== Number(n) ? `jj2:${pack.id}:${j}` : null;
    // No gems, coins or food anywhere: a story level (text, then on).
    const ids = new Set();
    for (const w of level.events || []) ids.add(w & 0xff);
    def.story = ![63, 64, 65, 66, 44, 45, 72, 73].some((id) => ids.has(id));
  };
  // Throws when the level can't be played: its file or a tile set it needs
  // is missing (judged from the folder listing; levels drawn partly from
  // missing extra sets get the full load's check).
  def.check = async () => {
    await discovered();
    const level = await fetchParsed(url(pack, entry.file), parseLevel);
    readHeader(level);
    const known = pack.files || null;
    const has = (name) => !known || known.some((f) => f.toLowerCase() === name.toLowerCase());
    if (!has(j2t(level.tileset))) throw new Error(`Needs the tile set ${j2t(level.tileset)}`);
    if (!known || (level.mlle && level.mlle.tilesets.some((x) => !has(j2t(x.name))))) await def.prepare();
  };
  def.prepare = async () => {
    if (state.level) return def;
    await discovered();       // the folder listing gives the files' real names
    const level = await fetchParsed(url(pack, entry.file), parseLevel);
    readHeader(level);
    let ts = await fetchParsed(url(pack, packFile(pack, j2t(level.tileset))), parseTileset)
      .catch(() => { throw new Error(`Needs the tile set ${j2t(level.tileset)}, which isn't in Levels/${pack.title}/`); });
    if (level.mlle) {
      // JJ2+ levels: extra tile sets (missing ones leave their tiles empty)
      // and extra layers from the level's MLLE data files.
      const extras = await Promise.all(level.mlle.tilesets.map(async (x) => ({
        ...x, ts: await fetchParsed(url(pack, packFile(pack, j2t(x.name))), parseTileset).catch(() => null),
      })));
      def.missing = extras.filter((x) => !x.ts).map((x) => x.name);
      if (extras.length || level.mlle.palette || level.mlle.edited) ts = composeTileset(ts, extras, level.mlle.palette, level.mlle.edited);
      // A level drawn mostly from missing sets would have no floor to stand on.
      if (def.missing.length && ts.parts) {
        const sprite = level.layers[3];
        const max = level.maxTiles;
        let used = 0; let gone = 0;
        for (const word of sprite.tiles || []) {
          const id = word & (max - 1);
          if (!id) continue;
          used++;
          const part = id >= ts.base.count && [...ts.parts].reverse().find((p) => id >= p.start);
          if (part && !part.ts) gone++;
        }
        if (used && gone / used > 0.25) throw new Error(`Needs the tile sets ${def.missing.map(j2t).join(', ')}`);
      }
      const files = Math.ceil(Math.max(0, (level.mlle.layers ? level.mlle.layers.length : 8) - 8) / 8);
      const base = entry.file.replace(/\.j2l$/i, '');
      const data = await Promise.all(Array.from({ length: files }, (_, i) => fetchParsed(url(pack, packFile(pack, `${base}-MLLE-Data-${i + 1}.j2l`)), parseLevel).catch(() => null)));
      applyMlleLayers(level, data);
    }
    state.ts = ts;
    state.level = level;
    return def;
  };
  defs.set(key, def);
  return def;
}

// Level music: ogg and mp3 files play as they are, tracker modules through
// libopenmpt. JJ2's own .j2b music isn't supported: a soundtrack of ours plays.
function musicKey(pack, name, fallback) {
  const key = `jj2:${pack.id}:${name}`;
  if (/\.(ogg|mp3)$/i.test(name || '')) addTrack(key, { url: url(pack, name) });
  else if (/\.(xm|mod|it|s3m)$/i.test(name || '')) addTrack(key, { mod: url(pack, name), fallback });
  else return fallback;
  return key;
}

// Packs dropped into Levels/ that aren't listed above (serve.py lists the
// folder at /levels.json; other servers just show the known packs). Runs once.
let discovery = null;
function discovered() {
  if (!discovery) discovery = scanPacks();
  return discovery;
}
export function discoverPacks() { return discovered(); }

async function scanPacks() {
  let found;
  try {
    const r = await fetch('levels.json');
    if (!r.ok) return false;
    found = await r.json();
  } catch (e) { return false; }
  let added = false;
  for (const f of found) {
    const dir = `Levels/${f.dir}/`;
    let pack = PACKS.find((p) => p.dir === dir);
    if (!pack) {
      // Ids key levels ("jj2:<id>:<n>"), so two folders that slug alike get a suffix.
      const base = f.dir.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let id = base;
      for (let n = 2; PACKS.some((p) => p.id === id); n++) id = `${base}-${n}`;
      pack = { id, title: f.dir, blurb: `Levels from Levels/${f.dir}/.`, dir, levels: [] };
      PACKS.push(pack);
    }
    pack.tilesets = f.tilesets;
    pack.files = f.files;
    for (const file of [...f.levels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      if (pack.levels.some((l) => l.file.toLowerCase() === file.toLowerCase())) continue;
      pack.levels.push({ file });
      added = true;
    }
  }
  return added;
}

// Every level of every pack, in menu order.
export function allJJ2() {
  const out = [];
  for (const pack of PACKS) pack.levels.forEach((_, i) => out.push(jj2Def(`jj2:${pack.id}:${i}`)));
  return out;
}

// Levels that can't be played (a tile set they need isn't in their folder)
// are left out of the menus. The check runs once, after the folder listing;
// adding the missing tile set brings a level back.
let scan = null;
export function scanPlayable() {
  if (!scan) {
    scan = discovered().then(() => Promise.all(allJJ2().map((d) => d.check().then(
      () => { d.unplayable = false; },
      () => { d.unplayable = true; },
    ))));
  }
  return scan;
}

export function playableJJ2() { return allJJ2().filter((d) => !d.unplayable); }

// The level after `key` in its episode's chain, skipping unplayable ones.
export function nextPlayable(key) {
  const seen = new Set();
  while (key && !seen.has(key)) {
    seen.add(key);
    const d = jj2Def(key);
    if (!d || !d.unplayable) return key;
    key = d.next;
  }
  return null;
}
