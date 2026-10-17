// Which tiles of each tileset build the ground. `cap` is a horizontal run of
// surface tiles that repeats seamlessly (sampled column by column, so it
// follows slopes); `fill` tiles texture everything below it.
export const TILESETS = {
  winter: {
    image: 'assets/tiles_winter.png',
    cap: [57, 58],
    fillBlock: [[80, 81, 82], [90, 91, 92], [100, 101, 102]],
    // Scenery kinds (from levels.js) drawn with tileset pieces instead:
    // [col, row, cols, rows, tiles to clear]. Kinds not listed are not drawn.
    props: {
      snowPine: [[0, 0, 3, 6, [[2, 0, 1, 1]]], [3, 1, 3, 5]],
    },
  },
  beach: {
    image: 'assets/tiles_beach.png',
    cap: [104, 105],
    fillList: [64, 92, 96, 97, 100, 112, 113, 117],
    props: {
      tree: [[6, 12, 3, 2]],
      rock: [[0, 75, 2, 3]],
    },
  },
};

// Level theme -> tileset.
export const THEME_TILESET = { meadow: 'beach', winter: 'winter' };
