"""Numbered preview of a 10-wide, 32 px tileset (index = row * 10 + col).
usage: python tilegrid.py TILESET OUT_PREFIX [rows_per_image]"""
import sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 24
im = Image.open(src).convert('RGB')
cols, rows = im.width // 32, im.height // 32
G = 34
for part, r0 in enumerate(range(0, rows, per)):
    n = min(per, rows - r0)
    sheet = Image.new('RGB', (cols * G, n * G), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for r in range(n):
        for c in range(cols):
            t = im.crop((c * 32, (r0 + r) * 32, c * 32 + 32, (r0 + r) * 32 + 32))
            sheet.paste(t, (c * G, r * G))
            i = (r0 + r) * cols + c
            d.rectangle((c * G, r * G, c * G + 6 * len(str(i)), r * G + 9), fill=(0, 0, 0))
            d.text((c * G + 1, r * G - 1), str(i), fill=(255, 255, 0))
    sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
    sheet.save(f'{out}_{part}.png')
print(cols, rows)
