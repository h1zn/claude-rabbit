"""Split a sheet region into frames at background-only columns.

usage: python boxes.py SHEET x0 y0 x1 y1 [min_gap]
Prints [[x0, y0, x1, y1], ...] with each box trimmed to its pixels, for an
animation's "boxes" list (build_sprites.py) when the slicer would break a
sprite made of loose pieces (rings, sparks) into several frames.
"""
import json
import sys
import numpy as np
from PIL import Image


def boxes(sheet, x0, y0, x1, y1, gap=2):
    a = np.asarray(Image.open(sheet).convert('RGB')).astype(int)
    bg = a[5, 5]
    m = np.abs(a[y0:y1, x0:x1] - bg).sum(2) >= 12
    cols = m.any(0)
    out = []
    x = 0
    while x < len(cols):
        if not cols[x]:
            x += 1
            continue
        s = x
        empty = 0
        while x < len(cols) and empty < gap:
            empty = 0 if cols[x] else empty + 1
            x += 1
        e = x - empty
        rows = np.nonzero(m[:, s:e].any(1))[0]
        out.append([x0 + s, y0 + int(rows[0]), x0 + e, y0 + int(rows[-1]) + 1])
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    print(json.dumps(boxes(args[0], *map(int, args[1:5]), *(int(g) for g in args[5:6]))))
