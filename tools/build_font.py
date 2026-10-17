"""Cut the JJ2 menu fonts out of new/New Tilesets/Miscellaneous - Fonts.png.

Writes assets/font_big.png / font_med.png plus a JSON glyph map each:
{"height": h, "glyphs": {char: [x, y, w, h, top]}} where `top` is the glyph's
offset below the line top (so descenders hang below the baseline).

The big font is laid out in rows of known characters; the medium font is an
ASCII grid (25 characters per row from the space, 33.13 px apart).
"""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SHEET = os.path.join(ROOT, 'new', 'New Tilesets', 'Miscellaneous - Fonts.png')

BIG_ROWS = [
    (440, 482, '-.!0123456789'),
    (503, 547, ':;"=$?\'ABCDEF'),
    (574, 614, 'GHIJKLMNOPQRS'),
    (641, 681, 'TUVWXYZ'),
    (708, 766, 'abcdefghijklm'),
    (779, 833, 'nopqrstuvwxyz'),
]
MED_ROWS = [(11, 35), (46, 69), (80, 110), (113, 145)]   # ASCII 32-131


def runs(v):
    out, start, last = [], None, None
    for i, on in enumerate(v):
        if on:
            if start is None:
                start = i
            last = i
        elif start is not None:
            out.append((start, last + 1))
            start = None
    if start is not None:
        out.append((start, last + 1))
    return out


def main():
    img = Image.open(SHEET).convert('RGB')
    rgb = np.asarray(img).astype(int)
    bg = rgb[30, 5]
    fg = np.abs(rgb - bg).sum(2) > 40
    fg[:, :6] = fg[:, -6:] = False     # the sheet's border lines
    fg[:6] = fg[-6:] = False

    def crop(x0, y0, x1, y1):
        """Tight box of the foreground inside a rectangle, or None."""
        m = fg[y0:y1, x0:x1]
        if not m.any():
            return None
        ys = np.where(m.any(1))[0]
        xs = np.where(m.any(0))[0]
        return x0 + xs[0], y0 + ys[0], x0 + xs[-1] + 1, y0 + ys[-1] + 1

    def pack(boxes, line_tops, name):
        # boxes: {char: (x0, y0, x1, y1)} on the sheet; line_tops: {char: line top y}
        pad = 2
        x = y = rowh = 0
        maxw = 512
        placed = {}
        for ch, (x0, y0, x1, y1) in boxes.items():
            w, h = x1 - x0, y1 - y0
            if x + w > maxw:
                x, y, rowh = 0, y + rowh + pad, 0
            placed[ch] = (x, y, w, h, y0 - line_tops[ch])
            x += w + pad
            rowh = max(rowh, h)
        out = Image.new('RGBA', (maxw, y + rowh), (0, 0, 0, 0))
        for ch, (x0, y0, x1, y1) in boxes.items():
            px, py, w, h, _ = placed[ch]
            part = rgb[y0:y1, x0:x1]
            alpha = (fg[y0:y1, x0:x1] * 255).astype(np.uint8)
            out.paste(Image.fromarray(np.dstack([part.astype(np.uint8), alpha]), 'RGBA'), (px, py))
        out.save(os.path.join(ROOT, 'assets', f'font_{name}.png'))
        height = max(p[4] + p[3] for p in placed.values())
        json.dump({'height': int(height), 'glyphs': {c: [int(v) for v in p] for c, p in placed.items()}},
                  open(os.path.join(ROOT, 'assets', f'font_{name}.json'), 'w'))
        print(name, len(placed), 'glyphs, line height', height)

    # Big font: columns of foreground in each row band, in order.
    boxes, tops = {}, {}
    for y0, y1, chars in BIG_ROWS:
        cols = runs(fg[y0:y1].any(0))
        for ch, (a, b) in zip(chars, cols):
            box = crop(a, y0, b, y1)
            if box:
                boxes[ch], tops[ch] = box, y0
    # Align every band to the cap height of its row (descenders hang below).
    for y0, y1, chars in BIG_ROWS:
        caps = [boxes[c][1] for c in chars if c in boxes and c not in 'gjpqy-.,:;"\'']
        top = min(caps) if caps else y0
        for c in chars:
            if c in tops:
                tops[c] = top
    pack(boxes, tops, 'big')

    # Medium font: an ASCII grid.
    boxes, tops = {}, {}
    pitch = 33.13
    for r, (y0, y1) in enumerate(MED_ROWS):
        row_boxes = {}
        for k in range(25):
            code = 32 + r * 25 + k
            if code > 126:
                break
            cx = 31 + k * pitch
            box = crop(int(cx - pitch / 2) + 1, y0 - 1, int(cx + pitch / 2), y1 + 1)
            if box:
                row_boxes[chr(code)] = box
        caps = [b[1] for c, b in row_boxes.items() if c.isalnum() and c not in 'gjpqy']
        top = min(caps) if caps else y0
        for c, b in row_boxes.items():
            boxes[c], tops[c] = b, top
    pack(boxes, tops, 'med')


if __name__ == '__main__':
    main()
