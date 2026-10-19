"""Web server for the game, plus the party-mode relay.

Serves this folder with caching disabled (so edits to JavaScript modules always
load fresh) and relays party-mode messages over a WebSocket at /ws: a host
creates a room and gets a 4-letter code, up to four more players join with it
(or pick it from the room list), and every message from one player goes to
the others, marked with the sender's slot (1-5; the host is 1).

    python serve.py [port]           this computer only (127.0.0.1)
    python serve.py [port] --lan     reachable from other computers on your network
    python serve.py --public         the same, on all interfaces, for a server on
                                     the internet (the port can also come from $PORT)

Standard library only.
"""

import base64
import functools
import hashlib
import http.server
import json
import os
import random
import socket
import struct
import sys
import threading
import zipfile

WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
MAX_FRAME = 64 * 1024  # party messages are small; anything bigger ends the connection
# Room-code letters: no I/O (look like 1/0) and no M/P (the game's mute and
# pause keys, which players type while entering a code).
CODE_LETTERS = 'ABCDEFGHJKLNQRSTUVWXYZ'
MAX_PLAYERS = 5
# code -> {'players': {slot: (conn, name)}, 'title', 'password', 'playing', 'mode'}
rooms = {}
rooms_lock = threading.Lock()


def room_info(code, room):
    """What the room list shows about a room."""
    return {'code': code, 'title': room['title'], 'players': len(room['players']), 'max': MAX_PLAYERS,
            'locked': bool(room['password']), 'playing': room['playing'], 'mode': room['mode']}


def roster(room):
    return [{'id': slot, 'name': name} for slot, (_, name) in sorted(room['players'].items())]


def clean(text, limit):
    return ''.join(ch for ch in str(text or '') if ch.isprintable())[:limit].strip()


def lan_addresses(port):
    """Best-effort list of this machine's LAN URLs, shown to the host."""
    found = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            found.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return [f'http://{ip}:{port}/' for ip in sorted(found) if not ip.startswith('127.')]


class WebSocket:
    """A minimal server-side WebSocket (RFC 6455): text frames, ping, close."""

    def __init__(self, rfile, wfile):
        self.rfile, self.wfile = rfile, wfile
        self.lock = threading.Lock()
        self.closed = False

    def read_exact(self, n):
        """Exactly n bytes, or None if the connection ended first."""
        buf = b''
        while len(buf) < n:
            chunk = self.rfile.read(n - len(buf))
            if not chunk:
                return None
            buf += chunk
        return buf

    def recv(self):
        while True:
            head = self.read_exact(2)
            if head is None:
                return None
            opcode = head[0] & 0x0F
            length = head[1] & 0x7F
            if length == 126:
                ext = self.read_exact(2)
                if ext is None:
                    return None
                length = struct.unpack('>H', ext)[0]
            elif length == 127:
                ext = self.read_exact(8)
                if ext is None:
                    return None
                length = struct.unpack('>Q', ext)[0]
            if length > MAX_FRAME:
                return None
            mask = self.read_exact(4) if head[1] & 0x80 else b'\0\0\0\0'
            raw = self.read_exact(length)
            if mask is None or raw is None:
                return None
            data = bytearray(raw)
            for i in range(len(data)):
                data[i] ^= mask[i % 4]
            if opcode == 8:
                return None
            if opcode == 9:
                self.send(bytes(data), opcode=10)
                continue
            if opcode == 1:
                return data.decode('utf-8', 'replace')

    def send(self, payload, opcode=1):
        if self.closed:
            return
        if isinstance(payload, str):
            payload = payload.encode('utf-8')
        n = len(payload)
        head = bytes([0x80 | opcode])
        if n < 126:
            head += bytes([n])
        elif n < 65536:
            head += bytes([126]) + struct.pack('>H', n)
        else:
            head += bytes([127]) + struct.pack('>Q', n)
        try:
            with self.lock:
                self.wfile.write(head + payload)
                self.wfile.flush()
        except (OSError, ValueError):
            self.closed = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '/ws' in (self.path or ''):
            return
        super().log_message(fmt, *args)

    def do_GET(self):
        if self.path.split('?')[0] == '/ws' and self.headers.get('Upgrade', '').lower() == 'websocket':
            return self.relay()
        if self.path.split('?')[0] == '/levels.json':
            return self.level_list()
        return super().do_GET()

    def level_list(self):
        """The JJ2 level packs in Levels/: each folder's (or zip's) .j2l and .j2t files."""
        packs = []
        root = os.path.join(self.directory, 'Levels')
        if os.path.isdir(root):
            for name in sorted(os.listdir(root)):
                folder = os.path.join(root, name)
                if name.lower().endswith('.zip') and os.path.isfile(folder):
                    # A zipped pack: the game reads the files out of the zip itself.
                    try:
                        with zipfile.ZipFile(folder) as z:
                            files = sorted({n.split('/')[-1] for n in z.namelist() if n.split('/')[-1]})
                    except (zipfile.BadZipFile, OSError):
                        continue
                    levels = [f for f in files if f.lower().endswith('.j2l') and '-mlle-data-' not in f.lower()]
                    if levels:
                        packs.append({'zip': name, 'levels': levels, 'files': files,
                                      'tilesets': [f for f in files if f.lower().endswith('.j2t')]})
                    continue
                if not os.path.isdir(folder):
                    continue
                files = sorted(os.listdir(folder))
                levels = [f for f in files if f.lower().endswith('.j2l') and '-mlle-data-' not in f.lower()]
                if levels:
                    packs.append({'dir': name, 'levels': levels, 'files': files,
                                  'tilesets': [f for f in files if f.lower().endswith('.j2t')]})
        body = json.dumps(packs).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def relay(self):
        key = self.headers.get('Sec-WebSocket-Key', '')
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.send_response_only(101)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        http.server.BaseHTTPRequestHandler.end_headers(self)
        ws = WebSocket(self.rfile, self.wfile)
        code, slot = None, None
        try:
            while True:
                try:
                    text = ws.recv()
                except (OSError, ValueError):
                    break
                if text is None:
                    break
                try:
                    msg = json.loads(text)
                except ValueError:
                    continue
                if not isinstance(msg, dict):
                    continue
                kind = msg.get('t')
                if kind == 'rooms':
                    with rooms_lock:
                        listing = [room_info(c, r) for c, r in rooms.items()]
                    ws.send(json.dumps({'t': 'rooms', 'list': listing}))
                elif kind == 'host' and code is None:
                    name = clean(msg.get('name'), 12) or 'PLAYER 1'
                    with rooms_lock:
                        code = ''.join(random.choice(CODE_LETTERS) for _ in range(4))
                        while code in rooms:
                            code = ''.join(random.choice(CODE_LETTERS) for _ in range(4))
                        rooms[code] = {'players': {1: (ws, name)}, 'title': clean(msg.get('title'), 24) or f"{name}'s game",
                                       'password': clean(msg.get('password'), 12), 'playing': False, 'mode': msg.get('mode', 'treasure')}
                        players = roster(rooms[code])
                    slot = 1
                    ws.send(json.dumps({'t': 'hosted', 'code': code, 'id': 1, 'players': players,
                                        'urls': lan_addresses(self.server.server_address[1])}))
                elif kind == 'join' and code is None:
                    want = str(msg.get('code', '')).upper()
                    why = None
                    with rooms_lock:
                        room = rooms.get(want)
                        if room is None:
                            why = 'No room with that code.'
                        elif room['password'] and clean(msg.get('password'), 12) != room['password']:
                            why = 'Wrong password.'
                        elif room['playing']:
                            why = 'That game has already started.'
                        elif len(room['players']) >= MAX_PLAYERS:
                            why = 'That room is full.'
                        else:
                            slot = next(i for i in range(2, MAX_PLAYERS + 1) if i not in room['players'])
                            name = clean(msg.get('name'), 12) or f'PLAYER {slot}'
                            room['players'][slot] = (ws, name)
                            others = [c for i, (c, _) in room['players'].items() if i != slot]
                            players = roster(room)
                    if why:
                        ws.send(json.dumps({'t': 'error', 'why': why}))
                        slot = None
                        continue
                    code = want
                    ws.send(json.dumps({'t': 'joined', 'code': code, 'id': slot, 'players': players}))
                    for other in others:
                        other.send(json.dumps({'t': 'peer', 'id': slot, 'name': name, 'players': players}))
                elif code is not None and kind == 'password':
                    # The host locks (or opens) the room.
                    if slot == 1:
                        with rooms_lock:
                            if code in rooms:
                                rooms[code]['password'] = clean(msg.get('password'), 12)
                elif code is not None:
                    # Everything else goes to the room, marked with the sender;
                    # `to` sends it to one player only.
                    msg['from'] = slot
                    with rooms_lock:
                        room = rooms.get(code)
                        if room and slot == 1 and kind in ('start', 'lobby', 'settings'):
                            room['playing'] = kind == 'start'
                            if msg.get('mode'):
                                room['mode'] = msg['mode']
                        targets = [] if not room else [c for i, (c, _) in room['players'].items()
                                                        if i != slot and (msg.get('to') is None or msg.get('to') == i)]
                    out = json.dumps(msg)
                    for other in targets:
                        other.send(out)
        finally:
            ws.closed = True
            if code is not None:
                with rooms_lock:
                    room = rooms.get(code)
                    targets = []
                    if room:
                        room['players'].pop(slot, None)
                        targets = [c for c, _ in room['players'].values()]
                        # The host leaving ends the room.
                        if slot == 1 or not room['players']:
                            rooms.pop(code, None)
                for other in targets:
                    other.send(json.dumps({'t': 'left', 'id': slot, 'closed': slot == 1}))
            self.close_connection = True


class Server(http.server.ThreadingHTTPServer):
    # Five browsers loading the game at once open dozens of connections; the
    # default backlog of 5 refuses some of them.
    request_queue_size = 128
    daemon_threads = True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    lan = '--lan' in sys.argv or '--public' in sys.argv
    port = int(args[0]) if args else int(os.environ.get('PORT', 8770))
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)
    with Server(('0.0.0.0' if lan else '127.0.0.1', port), handler) as server:
        print(f'Serving on http://localhost:{port}/')
        if lan:
            for url in lan_addresses(port):
                print(f'Party mode: other players open {url}')
        server.serve_forever()


if __name__ == '__main__':
    main()
