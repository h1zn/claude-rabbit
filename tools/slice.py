"""Cut individual frames out of a sprite-sheet screenshot.

The sheet has a solid background colour. Rows of sprites are separated by
background-only scanlines; short bands (text labels) are skipped. Inside a
band, frames are separated by background-only columns. Each frame is saved
with a transparent background, plus a numbered contact sheet for mapping.

usage: python slice.py SHEET OUT_PREFIX [--min-band 18]
"""
import json
import sys
from PIL import Image, ImageDraw

def is_bg(p, bg):
    # background, plus the pure-blue separator lines some sheets use
    return (abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) < 12) or (p[0] < 10 and p[1] < 10 and p[2] > 200)

def label_like(img, box, bg):
    # text labels: short bands made only of near-white / near-black pixels
    x0, y0, x1, y1 = box
    if y1 - y0 > 11:
        return False
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = img.getpixel((x, y))
            if is_bg(p, bg):
                continue
            if not (min(p) > 200 or max(p) < 40):
                return False
    return True

def slice_sheet(path, min_band=18):
    """Frames are connected shapes (8-neighbour) of non-background pixels.
    Text labels (only near-white/near-black, short) are dropped; small bits
    (sparks, detached pixels) join the nearest big shape within 3 px."""
    from collections import deque
    import numpy as np
    img = Image.open(path).convert('RGB')
    W, H = img.size
    bg = img.getpixel((5, 5))  # inside any border
    a = np.asarray(img).astype(int)
    diff = np.abs(a - np.array(bg)).sum(axis=2)
    sep = (a[:, :, 0] < 10) & (a[:, :, 1] < 10) & (a[:, :, 2] > 200)
    m = (diff >= 12) & ~sep
    textish = (a.min(axis=2) > 200) | (a.max(axis=2) < 40)
    lab = np.zeros((H, W), dtype=np.int32)
    comps = []
    n = 0
    ys, xs = np.nonzero(m)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if lab[y, x]:
            continue
        n += 1
        lab[y, x] = n
        q = deque([(y, x)])
        x0 = x1 = x; y0 = y1 = y; area = 0; text = 0
        while q:
            cy, cx = q.popleft()
            area += 1
            text += int(textish[cy, cx])
            if cx < x0: x0 = cx
            if cx > x1: x1 = cx
            if cy < y0: y0 = cy
            if cy > y1: y1 = cy
            for dy in (-1, 0, 1):
                ny = cy + dy
                if ny < 0 or ny >= H: continue
                for dx in (-1, 0, 1):
                    nx = cx + dx
                    if 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
        comps.append({'id': n, 'box': [x0, y0, x1 + 1, y1 + 1], 'area': area, 'text': text})
    comps = [c for c in comps if not (c['text'] == c['area'] and c['box'][3] - c['box'][1] <= 11)]
    seeds = [c for c in comps if c['area'] >= 60]
    small = [c for c in comps if c['area'] < 60]
    for c in small:
        bx = c['box']
        best = None
        for s in seeds:
            sb = s['box']
            gx = max(sb[0] - bx[2], bx[0] - sb[2], 0)
            gy = max(sb[1] - bx[3], bx[1] - sb[3], 0)
            d = max(gx, gy)
            if d <= 3 and (best is None or d < best[0]):
                best = (d, s)
        if best:
            s = best[1]
            s.setdefault('ids', [s['id']]).append(c['id'])
            sb = s['box']
            s['box'] = [min(sb[0], bx[0]), min(sb[1], bx[1]), max(sb[2], bx[2]), max(sb[3], bx[3])]
    # short shapes (spinning ears, muzzle flashes) join the tall frame they
    # hover over or beside, within 8 px
    tall = [s for s in seeds if s['box'][3] - s['box'][1] >= min_band]
    for s in seeds:
        if s in tall:
            continue
        bx = s['box']
        best = None
        for t in tall:
            tb = t['box']
            gx = max(tb[0] - bx[2], bx[0] - tb[2], 0)
            gy = max(tb[1] - bx[3], bx[1] - tb[3], 0)
            if gx <= 2 and gy <= 8 and (best is None or gy < best[0]):
                best = (gy, t)
        if best:
            t = best[1]
            t.setdefault('ids', [t['id']]).extend(s.get('ids', [s['id']]))
            tb = t['box']
            t['box'] = [min(tb[0], bx[0]), min(tb[1], bx[1]), max(tb[2], bx[2]), max(tb[3], bx[3])]
    frames = [{'box': tuple(s['box']), 'ids': s.get('ids', [s['id']])} for s in tall]
    # reading order: rows by vertical overlap, then left to right
    frames.sort(key=lambda f: f['box'][1])
    rows = []
    for f in frames:
        y0, y1 = f['box'][1], f['box'][3]
        for r in rows:
            ov = min(y1, r['y1']) - max(y0, r['y0'])
            if ov > 0.5 * (y1 - y0):
                r['f'].append(f); r['y0'] = min(r['y0'], y0); r['y1'] = max(r['y1'], y1)
                break
        else:
            rows.append({'y0': y0, 'y1': y1, 'f': [f]})
    out = []
    for r in sorted(rows, key=lambda r: r['y0']):
        out += sorted(r['f'], key=lambda f: f['box'][0])
    mask = None
    return img, bg, (lab, m), out

def anchor(own, box):
    # feet: bottom of the box; x: median of solid pixels in the lowest 35%
    import numpy as np
    x0, y0, x1, y1 = box
    ly = int((y1 - y0) * 0.65)
    xs = np.nonzero(own[ly:, :])[1]
    ax = int(np.median(xs)) if len(xs) else (x1 - x0) // 2
    return ax, y1 - y0

def main():
    path, out = sys.argv[1], sys.argv[2]
    min_band = int(sys.argv[sys.argv.index('--min-band') + 1]) if '--min-band' in sys.argv else 18
    img, bg, mask, frames = slice_sheet(path, min_band)
    # atlas: pack frames left-to-right in rows of max 1024 px
    pad = 1
    x = y = rowh = 0
    maxw = 1024
    for f in frames:
        x0, y0, x1, y1 = f['box']
        w, h = x1 - x0, y1 - y0
        if x + w + pad > maxw:
            x, y, rowh = 0, y + rowh + pad, 0
        f['at'] = (x, y)
        x += w + pad
        rowh = max(rowh, h)
    atlas = Image.new('RGBA', (maxw, y + rowh), (0, 0, 0, 0))
    meta = []
    for f in frames:
        x0, y0, x1, y1 = f['box']
        import numpy as np
        lab, m = mask
        own = np.isin(lab[y0:y1, x0:x1], f['ids'])
        rgb = np.asarray(img.crop(f['box']))
        rgba = np.dstack([rgb, (own * 255).astype(np.uint8)])
        atlas.paste(Image.fromarray(rgba, 'RGBA'), f['at'])
        ax, ay = anchor(own, f['box'])
        meta.append({'x': f['at'][0], 'y': f['at'][1], 'w': x1 - x0, 'h': y1 - y0, 'ax': ax, 'ay': ay, 'src': [x0, y0]})
    atlas.save(out + '.png')
    json.dump({'frames': meta}, open(out + '.frames.json', 'w'))
    # numbered contact sheet over the original layout
    sheet = img.copy()
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(frames):
        x0, y0, x1, y1 = f['box']
        d.rectangle((x0, y0, x1 - 1, y1 - 1), outline=(255, 255, 0))
        d.rectangle((x0, y0, x0 + 6 * len(str(i)) + 2, y0 + 10), fill=(0, 0, 0))
        d.text((x0 + 1, y0 - 1), str(i), fill=(255, 255, 0))
    sheet.save(out + '.contact.png')
    print(len(frames), 'frames ->', out + '.png', atlas.size)

if __name__ == '__main__':
    main()
