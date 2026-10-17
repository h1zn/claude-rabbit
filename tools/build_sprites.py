"""Pack the frames an animation map uses into one atlas + JSON.

usage: python build_sprites.py MAP.json OUT_PREFIX
MAP: {"sheet": path, "anims": {name: {"frames": [first, last], "speed", "loop"}}}
Frame numbers are the slicer's reading-order indices (see slice.py contact sheet).
"""
import json
import os
import sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from slice import slice_sheet, anchor

def main():
    spec_path, out = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_path))
    sheet = os.path.join(os.path.dirname(spec_path), spec['sheet'])
    img, bg, (lab, m), frames = slice_sheet(sheet, spec.get('minBand', 18))
    # Animations name frames either by slicer index range ("frames": [a, b])
    # or by a rectangle on the original sheet ("region": [x0, y0, x1, y1]):
    # every frame centred inside it, top row first, left to right.
    def in_region(r):
        hits = []
        for i, f in enumerate(frames):
            x0, y0, x1, y1 = f['box']
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if r[0] <= cx < r[2] and r[1] <= cy < r[3]:
                hits.append((round(cy / 14), x0, i))
        return [i for _, _, i in sorted(hits)]
    for a in spec['anims'].values():
        a['list'] = in_region(a['region']) if 'region' in a else list(range(a['frames'][0], a['frames'][1] + 1))
        if 'pick' in a:
            a['list'] = [a['list'][k] for k in a['pick'] if k < len(a['list'])]
    used = sorted({i for a in spec['anims'].values() for i in a['list']})
    remap = {}
    meta = []
    x = y = rowh = 0
    maxw = 1024
    placed = []
    for i in used:
        x0, y0, x1, y1 = frames[i]['box']
        w, h = x1 - x0, y1 - y0
        if x + w + 1 > maxw:
            x, y, rowh = 0, y + rowh + 1, 0
        placed.append((i, x, y))
        x += w + 1
        rowh = max(rowh, h)
    atlas = Image.new('RGBA', (maxw, y + rowh), (0, 0, 0, 0))
    for n, (i, ax_, ay_) in enumerate(placed):
        f = frames[i]
        x0, y0, x1, y1 = f['box']
        own = np.isin(lab[y0:y1, x0:x1], f['ids'])
        rgb = np.asarray(img.crop(f['box']))
        atlas.paste(Image.fromarray(np.dstack([rgb, (own * 255).astype(np.uint8)]), 'RGBA'), (ax_, ay_))
        a_x, a_y = anchor(own, f['box'])
        meta.append({'x': ax_, 'y': ay_, 'w': x1 - x0, 'h': y1 - y0, 'ax': a_x, 'ay': a_y})
        remap[i] = n
    anims = {k: {'frames': [remap[i] for i in v['list']], 'speed': v['speed'], 'loop': v['loop']}
             for k, v in spec['anims'].items()}
    for k, v in anims.items():
        print(f'  {k}: {len(v["frames"])} frames')
    atlas.save(out + '.png', optimize=True)
    json.dump({'image': os.path.basename(out) + '.png', 'frames': meta, 'anims': anims}, open(out + '.json', 'w'), indent=None)
    print(len(meta), 'frames', atlas.size, '->', out)

if __name__ == '__main__':
    main()
