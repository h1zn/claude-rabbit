// Which tiles of each tileset build the ground. `cap` is a horizontal run of
// surface tiles that repeats seamlessly (sampled column by column, so it
// follows slopes); `fill` tiles texture everything below it. `backBlock` /
// `backList` tile the back wall of carved caves and interiors (drawn dimmed);
// without one the fill tiles are used, dimmed further. `ledge` tiles draw
// one-way platforms.
export const TILESETS = {
  winter: {
    image: 'assets/tiles_winter.png',
    cap: [57, 58],
    ledge: [185, 186, 187],
    fillBlock: [[80, 81, 82], [90, 91, 92], [100, 101, 102]],
    // Scenery kinds (from levels.js) drawn with tileset pieces instead:
    // [col, row, cols, rows, tiles to clear]. Kinds not listed are not drawn.
    props: {
      snowPine: [[0, 0, 3, 6, [[2, 0, 1, 1]]], [3, 1, 3, 5]],
    },
  },
  castle: {
    image: 'assets/tiles_castle.png',
    cap: [3, 4, 5],
    ledge: [280, 281, 281, 282],
    fillBlock: [540, 550, 560, 570, 580, 590].map((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => r + c)),
    backBlock: [600, 610, 620, 630, 640, 650].map((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => r + c)),
    props: {
      knight: [[1, 9, 1, 2]],
      window: [[7, 10, 1, 2]],
      candles: [[0, 29, 10, 1]],
    },
  },
  town: {
    image: 'assets/tiles_town.png',
    cap: [161, 162, 163, 164, 165],
    ledge: [122, 123, 124],
    fillList: [171, 172, 173, 174, 175, 176],
    backList: [136, 138, 148, 158],
    // Houses: red tiled roofs over plaster walls.
    stone: { cap: [1, 2, 3], fill: [5, 6, 14, 15, 16, 17, 24, 26, 27] },
    props: {
      house: [[0, 86, 8, 10]],
    },
  },
  tube: {
    image: 'assets/tiles_tube.png',
    cap: [161, 162, 163, 164, 165, 166, 167, 168],
    ledge: [153, 154, 155],
    fillList: [100, 101, 102, 103, 104, 120, 121, 122, 123, 124, 125, 130, 131, 132, 134, 135],
    backList: [1, 2, 15, 16, 18, 35, 36, 45, 46],
    props: {
      flame: [[9, 30, 1, 2]],
      column: [[5, 30, 1, 2]],
    },
  },
  beach: {
    image: 'assets/tiles_beach.png',
    cap: [104, 105],
    ledge: [23, 24, 25],
    fillList: [64, 92, 96, 97, 100, 112, 113, 117],
    // Stone blocks are wooden dock structures: a beam on top of dark planks.
    stone: { cap: [602, 603, 604, 605, 606, 607, 608, 609], fill: [612, 613, 614, 616, 617, 622, 623, 624, 626, 627] },
    props: {
      shell: [[6, 12, 3, 2]],
      rock: [[0, 75, 2, 3]],
      plant: [[1, 34, 1, 1], [3, 34, 1, 1], [5, 34, 1, 1], [5, 42, 1, 2]],
      railing: [[5, 30, 3, 1], [0, 30, 2, 1]],
      wheel: [[0, 37, 1, 3]],
    },
  },
};

// Recoloured worlds: a base tileset's layout with a gradient map over it.
TILESETS.grove = {
  ...TILESETS.beach,
  stone: undefined,
  props: {},
  gradient: [[0, '#0a0420'], [0.28, '#4a1288'], [0.52, '#1a9a9a'], [0.76, '#8af56a'], [1, '#fffac8']],
};
TILESETS.candy = {
  ...TILESETS.winter,
  gradient: [[0, '#2a0b3a'], [0.3, '#8a2a7a'], [0.6, '#ff6fb0'], [0.85, '#ffc4e4'], [1, '#ffffff']],
};
TILESETS.forge = {
  ...TILESETS.castle,
  props: { window: TILESETS.castle.props.window },
  gradient: [[0, '#070102'], [0.3, '#3a0a08'], [0.6, '#a4280c'], [0.85, '#ff8a1c'], [1, '#ffe9a8']],
};

// Level theme -> tileset.
export const THEME_TILESET = {
  meadow: 'beach', winter: 'winter', castle: 'castle', town: 'town', tube: 'tube', grove: 'grove', candy: 'candy', forge: 'forge',
};
