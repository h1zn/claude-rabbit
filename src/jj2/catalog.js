// The original JJ2 level packs in Levels/, as playable level definitions. A
// definition is a function that builds a fresh level (like the ones in
// src/levels.js) once `prepare()` has fetched and parsed its files. Keys look
// like "jj2:xx:2" (pack id, level number). A pack is a folder, or a zip read
// in place (`zip`).

import { addTrack } from '../audio.js';
import { applyMlleLayers, cleanText, composeTileset, parseLevel, parseTileset } from './files.js';
import { JJ2Level } from './level.js';
import { openZip } from './zip.js';

// Party game types (the manual's).
export const MODES = ['treasure', 'battle', 'ctf', 'race'];

// `music` names the soundtrack of ours a level falls back to when its own
// music can't play. `modes` lists the party games a level suits; `mp` keeps
// a multiplayer-only level out of the single-player episode list.
// The official maps that share a title get one each.
const MP_TITLES = {
  Battle1: 'Battle Game 1', Battle2: 'Battle Game 2', Battle3: 'Battle Game 3', Battlea: 'Battle Game A', Abattle1: 'City Battle',
  Sharectf: 'Diamondus Warzone (demo)', Sharect2: 'Chemical Warfare (demo)', Sharetrs: 'Treasure Hunt (demo)',
  Race1: 'Race Game 1', Race2: 'Race Game 2', Race3: 'Race Game 3', Arace1: 'Race Game A', Fastrace3: 'Fast Race 3',
};

export const PACKS = [
  // The original game (JJ2-Levels.zip, packed from a JJ2 install by
  // tools/pack_jj2.ps1): its episodes in the order of their .j2e files, each
  // with its secret or bonus level last, then the community levels and the
  // official multiplayer maps. Its music comes from JJ2-Music.zip.
  {
    id: 'prince', title: 'Formerly a Prince', zip: 'Levels/JJ2-Levels.zip',
    blurb: 'Episode 1: Devan Shell has stolen Eva Earlong. From his castle dungeons, through Carrotus, to the lab of Labratory.',
    levels: ['Castle1', 'Castle1n', 'Carrot1', 'Carrot1n', 'Labrat1', 'Labrat2', 'Labrat3'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'rescue', title: 'Jazz in Time', zip: 'Levels/JJ2-Levels.zip',
    blurb: 'Episode 2: Victorian Colonius, the psychedelic Psych worlds and the beaches of Beach Bunny Bingo.',
    levels: ['Colon1', 'Colon2', 'Psych1', 'Psych2', 'Beach', 'Beach2', 'Psych3'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'flash', title: 'Flashback', zip: 'Levels/JJ2-Levels.zip',
    blurb: 'Episode 3: back to Diamondus and Tubelectric from the first game, then the medieval Medivo.',
    levels: ['Diam1', 'Diam3', 'Tube1', 'Tube2', 'Medivo1', 'Medivo2', 'Diamsecr'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'monk', title: 'Funky Monkeys', zip: 'Levels/JJ2-Levels.zip',
    blurb: 'Episode 4: the monkey jungles, Hell frozen and roasting, and Devan waiting at the bottom of Damnation.',
    levels: ['Jung1', 'Jung2', 'Hell', 'Hell2', 'Damn', 'Damn2'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'secretf', title: 'The Secret Files', zip: 'Levels/JJ2-Levels.zip',
    blurb: 'Easter eggs, haunted houses and Turtle Town: the expansion with Lori.',
    levels: ['Easter1', 'Easter2', 'Easter3', 'Haunted1', 'Haunted2', 'Haunted3', 'Town1', 'Town2', 'Town3'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'share', title: 'Shareware Levels', zip: 'Levels/JJ2-Levels.zip',
    blurb: 'The three levels of the shareware demo.',
    levels: ['Share1', 'Share2', 'Share3'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'homecooked', title: 'Home Cooked Levels', zip: 'Levels/JJ2-Levels.zip', extras: true,
    blurb: 'The training level, and the community levels shipped with JJ2: Peach Beach, Sting in Your Tail, Queen of BoarD and more.',
    levels: ['Trainer', "70's grove", 'Funky chicken', 'Peachb', 'Creamclone', 'Diam001', 'Garglair', 'Ml_sting', 'Ml_qobmenu', 'Ml_qob', 'Ml_qobonus', 'Ml_qobclone', 'Ml_qobcred', 'Ml_qobpuke', 'Guess'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'jj2mp', title: 'JJ2 Multiplayer', zip: 'Levels/JJ2-Levels.zip',
    blurb: "The original game's battle, capture the flag, race and treasure hunt maps.",
    levels: [
      ...['Battle1', 'Battle2', 'Battle3', 'Battlea', 'Abattle1', 'Elechaos', 'Undrsieg', 'Whitechristmas'].map((f) => ({ file: `${f}.j2l`, mp: true, modes: ['battle'], title: MP_TITLES[f] })),
      ...['Capture1', 'Capture2', 'Capture3', 'Capture4', 'Sharectf', 'Sharect2', 'Bbswing', 'Bbswinga', 'Bocarrot', 'Dinolab1', 'Phils1', 'Spam003'].map((f) => ({ file: `${f}.j2l`, mp: true, modes: ['ctf', 'battle'], title: MP_TITLES[f] })),
      ...['Race1', 'Race2', 'Race3', 'Arace1', 'Arace2', 'Fastrace3', 'Ddash2', 'Falkenrace'].map((f) => ({ file: `${f}.j2l`, mp: true, modes: ['race'], title: MP_TITLES[f] })),
      ...['Treasur1', 'Treasur2', 'Treasur3', 'Sharetrs', 'Meztrs01', 'Meztrs02', 'Spam201'].map((f) => ({ file: `${f}.j2l`, mp: true, modes: ['treasure', 'battle'], title: MP_TITLES[f] })),
      // An unused copy of Voltage Village without a start.
      { file: 'Tube3.j2l', mp: true },
    ],
  },
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
    levels: [{ file: 'xlmovergrown.j2l', music: 'jungle', modes: ['treasure', 'battle'] }],
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
    blurb: 'A JJ2+ pack built on scripts and extra tile sets: Valen Village to the Guardian.',
    zip: 'Levels/BL18.zip',
    levels: ['BL18_level01', 'BL18_level02', 'BL18_level03', 'BL18_level04', 'BL18_level05', 'BL18_level06', 'BL18_level07', 'BL18_Guardian', 'BL18_save'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'rob',
    title: 'Return of Blackraptor',
    blurb: "Blackraptor's 2004 collection: treasure hunts, battle and flag arenas, races, and adventures aboard Devan's fighter ship.",
    zip: 'Levels/RoBLevelsandStuff.zip',
    levels: [
      { file: 'ProjectALPHAlvl.j2l', music: 'jungle' },
      { file: 'Swampbonus.j2l', music: 'jungle' },
      { file: 'JTTCOC-Btlship.j2l', music: 'castle' },
      { file: 'JTTCOC-Btlsecret.j2l', music: 'castle' },
      { file: 'BRTREASURE1.j2l', mp: true, modes: ['treasure', 'battle'] },
      { file: 'BRTREASURE2.j2l', mp: true, modes: ['treasure', 'battle'] },
      { file: 'BRTREASURE3.j2l', mp: true, modes: ['treasure', 'battle'] },
      { file: 'BRBATTLE1.j2l', mp: true, modes: ['battle'] },
      { file: 'BRZeroxJB.j2l', mp: true, modes: ['battle'] },
      { file: 'BRCataclysm.j2l', mp: true, modes: ['battle'] },
      { file: 'BRARICHv2.j2l', mp: true, modes: ['ctf', 'battle'] },
      { file: 'BRCENTRYv2.j2l', mp: true, modes: ['ctf', 'battle'] },
      { file: 'BlackyRace5.j2l', mp: true, modes: ['race'] },
      { file: 'BRTFL.j2l', mp: true, modes: ['race', 'battle'] },
      { file: 'Crematoria.j2l', mp: true, modes: ['race', 'battle'] },
    ],
  },
  {
    id: 'seast', title: 'Astolfo', blurb: 'A battle arena with its own music.', zip: 'Levels/SEast.zip',
    levels: [{ file: 'SEast.j2l', mp: true, modes: ['battle'] }],
  },
  {
    id: 'ssr', title: 'ScreenShut Race', blurb: 'A one-screen race track: loop it lap after lap.', zip: 'Levels/ScreenShut_Race.zip',
    levels: [{ file: 'ssr.j2l', mp: true, modes: ['race'] }],
  },
  {
    id: 'teamrace',
    title: 'Team Race',
    blurb: "Violet CLM's Jazz 1 Medivo race, on the Medivo tile set from jj1-conversions.zip.",
    zip: 'Levels/TeamRace.zip',
    // The two team versions run on host-operated trigger crates and team
    // trigger rooms (JJ2 CTF servers), and emptyroom is their waiting room:
    // only the plain race plays here.
    levels: [
      { file: 'amedivorace.j2l', mp: true, modes: ['race'] },
      { file: 'teamrace.j2l', mp: true },
      { file: 'twolapteamrace.j2l', mp: true },
      { file: 'emptyroom.j2l', mp: true },
    ],
  },
  {
    id: 'ceramicus', title: 'Vault of Ceramicus', blurb: 'A tall Jazz 1 tribute crammed with gems - and a great treasure hunt.', zip: 'Levels/jj1ceramicusvault.zip',
    levels: [{ file: 'JJ1CeramicusVault.j2l', modes: ['treasure'] }],
  },
  {
    id: 'snooze',
    title: 'Land of The Sn00zE',
    blurb: 'A capture-the-flag map for up to 13, on Carrotus Night (borrowed from ChristmasJarVos.ZIP).',
    zip: 'Levels/xlmlots.zip',
    levels: [{ file: 'xlmlots.j2l', mp: true, modes: ['ctf', 'battle'] }],
  },
  {
    id: 'christmas',
    title: 'The Night Before Christmas',
    blurb: "Jarno Vos's airboard battle on Carrotus Night: grab an airboard and fly.",
    zip: 'Levels/ChristmasJarVos.ZIP',
    levels: [{ file: 'ChristMasBe.j2l', mp: true, modes: ['battle'] }],
  },
  {
    id: 'backintime',
    title: 'Back in Time',
    blurb: 'Nine levels on the retail tile sets: Diamondus by day and night, a snowy Christmas, then the monkey jungle.',
    zip: 'Levels/Back In Time Episode.zip',
    levels: ['DiamClassic1', 'DiamClassic2', 'DiamClassic3', 'XmasTime1', 'XmasTime2', 'XmasTime3', 'MonkeysJung1', 'MonkeysJung2', 'MonkeysJung3'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'stefan',
    title: 'JJ2 Remake by SteFan',
    blurb: "Part 1 of SteFan's remake of the original JJ2: castles, Carrotus and the lab, then Colonius, Psychedelia and the beach.",
    zip: 'Levels/jj2-remake-by-SteFan-part-1.zip',
    levels: ['Trainer v2', 'Castle2', 'Castle2n', 'ICCarrot1', 'ICCarrot1n', 'NOKALabrat1', 'NOKALabrat2', 'Colon1N', 'Colon2D', 'Psych1D', 'Psych2N', 'Beach+', 'Beach2+', 'NOKALabrat3'].map((f) => ({ file: `${f}.j2l` })),
  },
  {
    id: 'streetwars',
    title: 'Street Wars',
    blurb: 'A city-street battle arena on the retail Colonius tile set.',
    zip: 'Levels/Abattle1edit.zip',
    levels: [{ file: 'sw.j2l', mp: true, modes: ['battle'] }],
  },
  {
    id: 'summer',
    title: 'Summer Twilights',
    blurb: 'A small evening-field battle arena for up to six.',
    zip: 'Levels/Summer Twilights.zip',
    levels: [{ file: 'xlmfieldseve.j2l', mp: true, modes: ['battle'] }],
  },
  {
    id: 'magma',
    title: 'Magma Hills',
    blurb: 'A tight volcanic battle arena.',
    zip: 'Levels/damn+.zip',
    levels: [{ file: 'xlmmhills.j2l', mp: true, modes: ['battle'] }],
  },
  {
    id: 'lake',
    title: 'Lake Party',
    blurb: 'A lakeside battle by night, with its own music.',
    zip: 'Levels/xlmlake.zip',
    levels: [{ file: 'xlmlake.j2l', mp: true, modes: ['battle'] }],
  },
  {
    id: 'threed',
    title: 'Threed Realms',
    blurb: 'Three worlds in one level, on the retail Jungle, Town and Diamondus tile sets.',
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

// A pack's file, parsed: fetched from its folder or read out of its zip.
function packParsed(pack, name, parse) {
  if (!pack.zip) return fetchParsed(url(pack, name), parse);
  const key = `${pack.zip}!${name.toLowerCase()}`;
  if (!files.has(key)) {
    files.set(key, openZip(pack.zip).then((z) => z.read(name)).then(parse));
    files.get(key).catch(() => files.delete(key));
  }
  return files.get(key);
}

// A playable URL for a pack's music file (zipped music becomes a blob).
async function musicUrl(pack, name) {
  if (!pack.zip) return url(pack, name);
  if (!inPack(pack, name)) return null;
  const z = await openZip(pack.zip);
  const bytes = await z.read(packFile(pack, name)).catch(() => null);
  return bytes && URL.createObjectURL(new Blob([bytes]));
}

const MUSIC = /\.(ogg|mp3|wav|xm|mod|it|s3m|j2b)$/i;
// Where a level's music is: its own pack first, then the libraries and other
// packs (JJ2 levels name retail songs like "jungle" without the .j2b).
// { pack, file } or null.
function musicSource(pack, name) {
  if (!name) return null;
  const tries = /\.[a-z0-9]{2,4}$/i.test(name) ? [name] : [`${name}.j2b`, name];
  for (const p of [pack, ...LIBRARIES, ...PACKS.filter((q) => q !== pack)]) {
    if (!p.files) continue;
    for (const t of tries) {
      const file = p.files.find((f) => f.toLowerCase() === t.toLowerCase());
      if (file && MUSIC.test(file)) return { pack: p, file };
    }
  }
  // No folder listing: trust the name.
  return !pack.files && !pack.zip && MUSIC.test(name) ? { pack, file: name } : null;
}
const j2t = (name) => (/\.j2t$/i.test(name) ? name : `${name}.j2t`);
// Is `name` in the pack's folder? (Unknown without the folder listing.)
const inPack = (pack, name) => !pack.files || pack.files.some((f) => f.toLowerCase() === name.toLowerCase());

// Tile set libraries: folders or zips in Levels/ holding tile sets but no
// levels (like jj1-conversions.zip). A level whose own pack lacks a tile set
// borrows it from one of them, or else from another pack that has it.
export const LIBRARIES = [];

// Where a tile set comes from: the level's own pack, else a library.
// { pack, file } or null.
function tilesetSource(pack, name) {
  const lower = name.toLowerCase();
  if (inPack(pack, name)) return { pack, file: packFile(pack, name) };
  const sources = [pack, ...LIBRARIES, ...PACKS.filter((p) => p !== pack && p.files)].filter((p) => p.files);
  for (const lib of sources.slice(1)) {
    const file = lib.files.find((f) => f.toLowerCase() === lower);
    if (file) return { pack: lib, file };
  }
  // Last resort: the one tile set whose name starts with the one asked for
  // (Spooky Sprint asks for HauntedH.j2t; the game ships HauntedH1.j2t).
  const stem = lower.replace(/\.j2t$/, '');
  const near = [];
  for (const lib of sources) for (const f of lib.files) if (/\.j2t$/i.test(f) && f.toLowerCase().startsWith(stem) && !near.some((n) => n.file.toLowerCase() === f.toLowerCase())) near.push({ pack: lib, file: f });
  return near.length === 1 ? near[0] : null;
}

function loadTileset(pack, name) {
  const src = tilesetSource(pack, name);
  return src ? packParsed(src.pack, src.file, parseTileset) : Promise.reject(new Error(`Missing ${name}`));
}

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
    const music = musicKey(state.musicPack || pack, state.musicFile, entry.music || 'jungle', state.music);
    const meta = {
      name: file.title || entry.file, theme: 'jj2', music, jj2: true, playerH: 28,
      dark: null,
      // The JJ2+ script, and its jjMusicLoad(): a track key, or null.
      script: state.script,
      loadMusic: async (name) => {
        const song = musicSource(pack, name);
        return song ? musicKey(song.pack, song.file, null, await musicUrl(song.pack, song.file)) : null;
      },
    };
    return new JJ2Level(file, state.ts, meta, opts);
  };
  def.key = key;
  def.jj2 = true;
  def.pack = pack;
  def.title = entry.title || entry.file.replace(/\.j2l$/i, '');
  def.tip = pack.blurb;
  def.mp = !!entry.mp;               // multiplayer only
  def.modes = entry.modes || [];     // the party games it suits
  def.next = null;
  def.loaded = () => (state.level ? { file: state.level, ts: state.ts } : null);
  // Name and link the level from its own file first, so the menu shows its
  // real title (and a story chain can skip it) even if a tile set is missing.
  const readHeader = (level) => {
    def.title = entry.title || cleanText(level.title || '').split('\n')[0] || def.title;
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
    const level = await packParsed(pack, entry.file, parseLevel);
    readHeader(level);
    if (!tilesetSource(pack, j2t(level.tileset))) throw new Error(`Needs the tile set ${j2t(level.tileset)}`);
    if (!pack.files || (level.mlle && level.mlle.tilesets.some((x) => !tilesetSource(pack, j2t(x.name))))) await def.prepare();
  };
  def.prepare = async () => {
    if (state.level) return def;
    await discovered();       // the folder listing gives the files' real names
    const level = await packParsed(pack, entry.file, parseLevel);
    readHeader(level);
    let ts = await loadTileset(pack, j2t(level.tileset))
      .catch(() => { throw new Error(`Needs the tile set ${j2t(level.tileset)}, which isn't in ${pack.zip || `Levels/${pack.title}/`}`); });
    if (level.mlle) {
      // JJ2+ levels: extra tile sets (missing ones leave their tiles empty)
      // and extra layers from the level's MLLE data files.
      const extras = await Promise.all(level.mlle.tilesets.map(async (x) => ({
        ...x, ts: tilesetSource(pack, j2t(x.name)) ? await loadTileset(pack, j2t(x.name)).catch(() => null) : null,
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
      const dataFile = (i) => `${base}-MLLE-Data-${i + 1}.j2l`;
      const data = await Promise.all(Array.from({ length: files }, (_, i) => (inPack(pack, dataFile(i)) ? packParsed(pack, packFile(pack, dataFile(i)), parseLevel).catch(() => null) : null)));
      applyMlleLayers(level, data);
    }
    // Music inside a zip gets a blob URL before the level is built.
    // JJ2+ levels: their script (<level>.j2as) beside them.
    const scriptFile = entry.file.replace(/\.j2l$/i, '.j2as');
    if (pack.files && inPack(pack, scriptFile)) state.script = await packParsed(pack, packFile(pack, scriptFile), (buf) => new TextDecoder('latin1').decode(buf)).catch(() => null);
    const song = musicSource(pack, level.music);
    if (song) Object.assign(state, { music: await musicUrl(song.pack, song.file), musicFile: song.file, musicPack: song.pack });
    state.ts = ts;
    state.level = level;
    return def;
  };
  defs.set(key, def);
  return def;
}

// Level music: ogg, mp3 and wav files play as they are, tracker modules and
// JJ2's own .j2b through libopenmpt. Music nowhere to be found: a soundtrack
// of ours plays.
function musicKey(pack, name, fallback, src) {
  if (!src || !name) return fallback;
  const key = `jj2:${pack.id}:${name}`;
  if (/\.(ogg|mp3|wav)$/i.test(name)) addTrack(key, { url: src });
  else addTrack(key, { mod: src, fallback });
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
  // A folder that is also there zipped (BL18 and BL18.zip): the zip wins.
  const zipped = new Set(found.filter((f) => f.zip).map((f) => f.zip.replace(/\.zip$/i, '').toLowerCase()));
  for (const f of found) {
    if (f.dir && zipped.has(f.dir.toLowerCase())) continue;
    // Several packs can share one zip (the original game's episodes); its
    // other levels go to the one marked `extras`.
    const sharing = PACKS.filter((p) => f.zip && p.zip === `Levels/${f.zip}`);
    if (sharing.length > 1) {
      for (const p of sharing) { p.tilesets = f.tilesets; p.files = f.files; }
      const home = sharing.find((p) => p.extras) || sharing[0];
      const known = new Set(sharing.flatMap((p) => p.levels.map((l) => l.file.toLowerCase())));
      for (const file of [...f.levels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
        if (!known.has(file.toLowerCase())) { home.levels.push({ file }); added = true; }
      }
      continue;
    }
    const dir = f.zip ? null : `Levels/${f.dir}/`;
    const zip = f.zip ? `Levels/${f.zip}` : null;
    if (f.library) {
      if (!LIBRARIES.some((l) => l.zip === zip && l.dir === dir)) LIBRARIES.push({ id: `lib:${f.zip || f.dir}`, dir, zip, files: f.files, levels: [] });
      continue;
    }
    let pack = PACKS.find((p) => (zip ? p.zip === zip : p.dir === dir));
    if (!pack) {
      // Ids key levels ("jj2:<id>:<n>"), so two folders that slug alike get a suffix.
      const name = f.zip ? f.zip.replace(/\.zip$/i, '') : f.dir;
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let id = base;
      for (let n = 2; PACKS.some((p) => p.id === id); n++) id = `${base}-${n}`;
      pack = { id, title: name, blurb: `Levels from ${zip || dir}.`, dir, zip, levels: [] };
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

// Single-player levels (multiplayer-only arenas and races left out).
export function soloJJ2() { return playableJJ2().filter((d) => !d.mp); }

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
