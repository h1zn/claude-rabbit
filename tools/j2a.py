"""Read JJ2's Anims.j2a: every animation (frames as palette-indexed images
with hotspots) and every sound sample, named.

Names and the file layout follow Jazz2 Resurrection (deathkiller/jazz2-native,
Sources/Jazz2/Compatibility: JJ2Anims.cpp, AnimSetMapping.cpp and the sprite
palette in JJ2Anims.Palettes.h); tools/j2a_names.json holds the names for the
1.24 / The Secret Files file, made from AnimSetMapping.cpp by --names.

    python j2a.py list Anims.j2a                  every animation and sample
    python j2a.py names AnimSetMapping.cpp OUT    (re)build j2a_names.json
    python j2a.py sfx Anims.j2a                   the samples src/sfxmap.js names
                                                  -> assets/sfx/jj2/<Category>_<name>.wav
"""
import json
import os
import re
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


def read_j2a(path):
    """{'anims': {(set, i): {'fps', 'frames': [frame]}}, 'samples': {(set, i): {'rate', 'bits', 'data'}}}
    A frame: {'w', 'h', 'hx', 'hy', 'gx', 'gy', 'cx', 'cy', 'px': bytes (palette indices, 0 = clear)}."""
    d = open(path, 'rb').read()
    assert d[:4] == b'ALIB'
    header_len = struct.unpack_from('<I', d, 8)[0]
    count = struct.unpack_from('<i', d, 24)[0]
    addrs = struct.unpack_from('<%dI' % count, d, 28)
    anims, samples = {}, {}
    for s, at in enumerate(addrs):
        if d[at:at + 4] != b'ANIM':
            continue
        n_anims, n_samples = d[at + 4], d[at + 5]
        lens = struct.unpack_from('<8i', d, at + 12)
        pos = at + 44
        blocks = []
        for k in range(4):
            c, u = lens[k * 2], lens[k * 2 + 1]
            blocks.append(zlib.decompress(d[pos:pos + c]) if c else b'')
            pos += c
        info, frames, images, sounds = blocks
        fp = 0
        for a in range(n_anims):
            nf, fps = struct.unpack_from('<HH', info, a * 8)
            out = []
            for _ in range(nf):
                w, h, cx, cy, hx, hy, gx, gy = struct.unpack_from('<8h', frames, fp)
                img = struct.unpack_from('<i', frames, fp + 16)[0]
                fp += 24
                px = bytearray(w * h)
                p = img + 4
                n = 0
                last_empty = True
                while n < w * h:
                    op = images[p]; p += 1
                    if op < 0x80:
                        n += op
                    elif op == 0x80:
                        left = w - n % w
                        if n % w == 0 and not last_empty:
                            left = 0
                        n += left
                    else:
                        k = op & 0x7f
                        px[n:n + k] = images[p:p + k]
                        p += k; n += k
                    last_empty = op == 0x80
                out.append({'w': w, 'h': h, 'hx': hx, 'hy': hy, 'gx': gx, 'gy': gy, 'cx': cx, 'cy': cy, 'px': bytes(px[:w * h])})
            anims[(s, a)] = {'fps': fps, 'frames': out}
        sp = 0
        for i in range(n_samples):
            total, riff, chunk, fmt = struct.unpack_from('<iIiI', sounds, sp)
            asff = fmt == 0x46465341
            q = sp + 24 + 40 - (12 if asff else 0)
            mult = 0 if asff else struct.unpack_from('<H', sounds, q)[0]
            q += 2 + 2 + 4 + 8
            rate = struct.unpack_from('<I', sounds, q)[0]
            q += 4
            size = chunk - 76 + (12 if asff else 0)
            data = sounds[q:q + size]
            bps = (mult // 4) % 2 + 1
            samples[(s, i)] = {'rate': rate, 'bits': bps * 8, 'data': data}
            sp += max(total, chunk + 12) + 0
            # Resurrection reads chunk + 12 bytes, then skips the alignment gap.
            sp = sp if total > chunk + 12 else sp
    return {'header': header_len, 'anims': anims, 'samples': samples}


def wav_bytes(sample):
    """A sample as a PCM .wav (8-bit samples flip to unsigned, as Resurrection does)."""
    data = sample['data']
    bps = sample['bits'] // 8
    off = 8 if data[:4] == b'\0\0\0\0' and data[4:8] != b'\0\0\0\0' and (data[7] == 0 or data[8] == 0) else 0
    body = bytes(b ^ 0x80 for b in data[off:]) if bps == 1 else data[off:]
    if bps == 2 and len(body) % 2:
        body = body[:-1]
    rate = sample['rate']
    return (b'RIFF' + struct.pack('<I', 36 + len(body)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * bps, bps, bps * 8)
            + b'data' + struct.pack('<I', len(body)) + body)


def sprite_palette():
    """The in-game sprite palette (256 RGBA), from JJ2Anims.Palettes.h's SpritePalette."""
    return [tuple(c) for c in json.load(open(os.path.join(HERE, 'j2a_palette.json')))]


# ---------------------------------------------------------------- names

def build_names(cpp_path, version='TSF'):
    """Run AnimSetMapping.cpp's GetAnimMapping / GetSampleMapping for one version
    (a small interpreter for its m.Add / m.NextSet / ... calls and isFull blocks)."""
    src = open(cpp_path, encoding='utf-8-sig').read()
    flags = {'BaseGame': 1, 'TSF': 2, 'HH': 4, 'CC': 8, 'PlusExtension': 0x100, 'SharewareDemo': 0x200, 'All': 0xffff, 'Unknown': 0}
    ver = flags[version]

    def body(fn):
        i = src.index('AnimSetMapping AnimSetMapping::%s' % fn)
        j = src.index('} else if (version != JJ2Version::Unknown) {', i)
        depth, k = 1, j + len('} else if (version != JJ2Version::Unknown) {')
        start = k
        while depth:
            if src[k] == '{': depth += 1
            elif src[k] == '}': depth -= 1
            k += 1
        return src[start:k - 1]

    def run(code):
        entries = {}
        st = {'set': 0, 'item': 0}

        def applies(args):
            if args and args[0].startswith('JJ2Version::'):
                v = 0
                for part in args[0].split('|'):
                    v |= flags[part.strip().split('::')[1]]
                return (ver & v) != 0, args[1:]
            return True, args

        code = re.sub(r'//[^\n]*', '', code)
        # Statements and braces in order.
        tokens = re.findall(r'if \(isFull\) \{|\} else \{|\}|m\.(\w+)\(([^;]*)\);', code)
        stack = []      # True: running this block
        full = True
        for t in re.finditer(r'if \(isFull\) \{|\} else \{|\}|m\.(\w+)\(([^;]*)\);', code):
            tok = t.group(0)
            running = all(stack)
            if tok.startswith('if'):
                stack.append(full); continue
            if tok.startswith('} else'):
                stack[-1] = not stack[-1] if all(stack[:-1]) else False; continue
            if tok == '}':
                if stack: stack.pop()
                continue
            if not running:
                continue
            fn = t.group(1)
            args = [a.strip() for a in re.findall(r'"[^"]*"_s|[^,]+', t.group(2))] if t.group(2).strip() else []
            if fn == 'Add':
                ok, rest = applies(args)
                if not ok: continue
                cat, name = rest[0].split('"')[1], rest[1].split('"')[1]
                pal = 'menu' if len(rest) > 2 and 'Menu' in rest[2] else 'sprite'
                entries['%d:%d' % (st['set'], st['item'])] = [cat, name, pal]
                st['item'] += 1
            elif fn == 'DiscardItems':
                n = int(args[0]); ok, _ = applies(args[1:])
                if ok: st['item'] += n
            elif fn == 'SkipItems':
                st['item'] += int(args[0]) if args else 1
            elif fn == 'NextSet':
                n = int(args[0]) if args else 1
                ok, _ = applies(args[1:]) if len(args) > 1 else (True, None)
                if ok: st['set'] += n; st['item'] = 0
        return entries

    return {'anims': run(body('GetAnimMapping')), 'samples': run(body('GetSampleMapping'))}


def main():
    cmd = sys.argv[1]
    if cmd == 'names':
        json.dump(build_names(sys.argv[2]), open(sys.argv[3], 'w'), indent=0)
        pal_src = open(os.path.join(os.path.dirname(sys.argv[2]), 'JJ2Anims.Palettes.h'), encoding='utf-8-sig').read()
        block = pal_src[pal_src.index('SpritePalette[]'):]
        block = block[:block.index('};')]
        cols = [list(map(int, m)) for m in re.findall(r'Color\((\d+), (\d+), (\d+), (\d+)\)', block)]
        json.dump(cols, open(os.path.join(HERE, 'j2a_palette.json'), 'w'))
        print(len(cols), 'palette colours')
    elif cmd == 'sfx':
        j = read_j2a(sys.argv[2])
        names = json.load(open(os.path.join(HERE, 'j2a_names.json')))
        by_name = {'/'.join(v[:2]): k for k, v in names['samples'].items()}
        sfxmap = open(os.path.join(HERE, '..', 'src', 'sfxmap.js')).read()
        wanted = sorted(set(re.findall(r"'([A-Z][A-Za-z]+/[a-z0-9_]+)'", sfxmap)))
        out = os.path.join(HERE, '..', 'assets', 'sfx', 'jj2')
        os.makedirs(out, exist_ok=True)
        total = 0
        for n in wanted:
            if n not in by_name:
                print('no sample named', n); continue
            s, i = map(int, by_name[n].split(':'))
            data = wav_bytes(j['samples'][(s, i)])
            open(os.path.join(out, n.replace('/', '_') + '.wav'), 'wb').write(data)
            total += len(data)
        print(len(wanted), 'samples,', total // 1024, 'KB ->', os.path.normpath(out))
    elif cmd == 'list':
        j = read_j2a(sys.argv[2])
        names = json.load(open(os.path.join(HERE, 'j2a_names.json')))
        for (s, a), an in sorted(j['anims'].items()):
            n = names['anims'].get('%d:%d' % (s, a))
            print('A %3d:%-3d %-34s frames %3d fps %2d  %dx%d' % (s, a, '/'.join(n[:2]) if n else '?', len(an['frames']), an['fps'], an['frames'][0]['w'] if an['frames'] else 0, an['frames'][0]['h'] if an['frames'] else 0))
        for (s, i), sm in sorted(j['samples'].items()):
            n = names['samples'].get('%d:%d' % (s, i))
            print('S %3d:%-3d %-34s %5d Hz %2d bit %6d bytes' % (s, i, '/'.join(n[:2]) if n else '?', sm['rate'], sm['bits'], len(sm['data'])))


if __name__ == '__main__':
    main()
