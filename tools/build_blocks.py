"""Pack the special blocks (manual: "the symbol on the face of each block
indicates what you need to do to destroy it") into assets/blocks.png, one
32 px tile each, in this order:
  0 blast (star)        1 countdown 1   2 countdown 2   3 countdown 3
  4 countdown 4         5 butt-stomp    6 speed (plain) 7 switch crate (!)
  8 switch block
usage: python tools/build_blocks.py   (run from the repo root)
"""
from PIL import Image

def tile(path, i):
    ts = Image.open(path).convert('RGBA')
    return ts.crop(((i % 10) * 32, (i // 10) * 32, (i % 10) * 32 + 32, (i // 10) * 32 + 32))

castle, tube, town = 'assets/tiles_castle.png', 'assets/tiles_tube.png', 'assets/tiles_town.png'
star = tile(castle, 334)
# Speed block: the star block with its face painted over in the face colour.
speed = star.copy()
face = speed.getpixel((8, 8))
for y in range(6, 26):
    for x in range(6, 26):
        speed.putpixel((x, y), face)
tiles = [star, tile(tube, 304), tile(tube, 314), tile(tube, 324), tile(tube, 334),
         tile(castle, 127), speed, tile(castle, 120), tile(town, 131)]
out = Image.new('RGBA', (32 * len(tiles), 32))
for k, t in enumerate(tiles):
    out.paste(t, (k * 32, 0))
out.save('assets/blocks.png', optimize=True)
print(len(tiles), 'blocks')
