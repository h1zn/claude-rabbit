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
    props: {
      tree: [[6, 12, 3, 2]],
      rock: [[0, 75, 2, 3]],
    },
  },
};

// Level theme -> tileset.
export const THEME_TILESET = { meadow: 'beach', winter: 'winter', castle: 'castle', town: 'town', tube: 'tube' };
