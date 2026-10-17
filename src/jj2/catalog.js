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
    blurb: "KingofKoopas' long-lost episode: Downtown Chaos, House of the Shells, Chrysalis Caves, Deserto, a shipwreck and Baddy Breeding, with story levels between.",
    dir: 'Levels/Episode2/',
    levels: Array.from({ length: 17 }, (_, i) => ({ file: `ep2-${i + 1}.j2l` })),
  },
  {
    id: 'bl18',
    title: 'BL18',
    blurb: 'A JJ2+ pack built on scripts and extra tile sets. Many of its tile sets are not in the folder, so most levels show gaps.',
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
  def.prepare = async () => {
    if (state.level) return def;
    await discovered();       // the folder listing gives the files' real names
    const level = await fetchParsed(url(pack, entry.file), parseLevel);
    const j2t = (n) => (/\.j2t$/i.test(n) ? n : `${n}.j2t`);
    let ts = await fetchParsed(url(pack, packFile(pack, j2t(level.tileset))), parseTileset);
    if (level.mlle) {
      // JJ2+ levels: extra tile sets (missing ones leave their tiles empty)
      // and extra layers from the level's MLLE data files.
      const extras = await Promise.all(level.mlle.tilesets.map(async (x) => ({
        ...x, ts: await fetchParsed(url(pack, packFile(pack, j2t(x.name))), parseTileset).catch(() => null),
      })));
      def.missing = extras.filter((x) => !x.ts).map((x) => x.name);
      if (extras.length || level.mlle.palette || level.mlle.edited) ts = composeTileset(ts, extras, level.mlle.palette, level.mlle.edited);
      const files = Math.ceil(Math.max(0, (level.mlle.layers ? level.mlle.layers.length : 8) - 8) / 8);
      const base = entry.file.replace(/\.j2l$/i, '');
      const data = await Promise.all(Array.from({ length: files }, (_, i) => fetchParsed(url(pack, packFile(pack, `${base}-MLLE-Data-${i + 1}.j2l`)), parseLevel).catch(() => null)));
      applyMlleLayers(level, data);
    }
    state.ts = ts;
    state.level = level;
    def.title = level.title || def.title;
    // The level names its successor; follow it when it's in the same pack.
    const bare = (f) => f.toLowerCase().replace(/\.j2l$/, '');
    const j = pack.levels.findIndex((l) => bare(l.file) === bare(level.next || ''));
    def.next = j >= 0 && j !== Number(n) ? `jj2:${pack.id}:${j}` : null;
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
      pack = { id: f.dir.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: f.dir, blurb: `Levels from Levels/${f.dir}/.`, dir, levels: [] };
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
