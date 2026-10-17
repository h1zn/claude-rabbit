"""Local web server for the game, plus the party-mode relay.

Serves this folder with caching disabled (so edits to JavaScript modules always
load fresh) and relays party-mode messages over a WebSocket at /ws: a host
creates a room and gets a 4-letter code, a second player joins with it, and
every message from one is passed to the other.

    python serve.py [port]          this computer only (127.0.0.1)
    python serve.py [port] --lan    reachable from other computers on your network

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

WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
# Room-code letters: no I/O (look like 1/0) and no M/P (the game's mute and
# pause keys, which players type while entering a code).
CODE_LETTERS = 'ABCDEFGHJKLNQRSTUVWXYZ'
rooms = {}            # code -> {'host': conn, 'guest': conn or None}
rooms_lock = threading.Lock()


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

    def recv(self):
        while True:
            head = self.rfile.read(2)
            if len(head) < 2:
                return None
            opcode = head[0] & 0x0F
            length = head[1] & 0x7F
            if length == 126:
                length = struct.unpack('>H', self.rfile.read(2))[0]
            elif length == 127:
                length = struct.unpack('>Q', self.rfile.read(8))[0]
            mask = self.rfile.read(4) if head[1] & 0x80 else b'\0\0\0\0'
            data = bytearray(self.rfile.read(length))
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
        except OSError:
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
        """The JJ2 level packs in Levels/: each folder's .j2l and .j2t files."""
        packs = []
        root = os.path.join(os.getcwd(), 'Levels')
        if os.path.isdir(root):
            for name in sorted(os.listdir(root)):
                folder = os.path.join(root, name)
                if not os.path.isdir(folder):
                    continue
                files = sorted(os.listdir(folder))
                levels = [f for f in files if f.lower().endswith('.j2l') and '-mlle-data-' not in f.lower()]
                if levels:
                    packs.append({'dir': name, 'levels': levels, 'tilesets': [f for f in files if f.lower().endswith('.j2t')]})
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
        code, role = None, None
        try:
            while True:
                text = ws.recv()
                if text is None:
                    break
                try:
                    msg = json.loads(text)
                except ValueError:
                    continue
                kind = msg.get('t')
                if kind == 'host' and code is None:
                    with rooms_lock:
                        code = ''.join(random.choice(CODE_LETTERS) for _ in range(4))
                        while code in rooms:
                            code = ''.join(random.choice(CODE_LETTERS) for _ in range(4))
                        rooms[code] = {'host': ws, 'guest': None}
                    role = 'host'
                    ws.send(json.dumps({'t': 'hosted', 'code': code, 'urls': lan_addresses(self.server.server_address[1])}))
                elif kind == 'join' and code is None:
                    want = str(msg.get('code', '')).upper()
                    with rooms_lock:
                        room = rooms.get(want)
                        ok = room is not None and room['guest'] is None
                        if ok:
                            room['guest'] = ws
                    if not ok:
                        ws.send(json.dumps({'t': 'error', 'why': 'No open room with that code.'}))
                        continue
                    code, role = want, 'guest'
                    ws.send(json.dumps({'t': 'joined', 'code': code}))
                    room['host'].send(json.dumps({'t': 'peer'}))
                elif code is not None:
                    with rooms_lock:
                        room = rooms.get(code)
                    other = room and room['guest' if role == 'host' else 'host']
                    if other:
                        other.send(text)
        finally:
            ws.closed = True
            if code is not None:
                with rooms_lock:
                    room = rooms.get(code)
                    if room:
                        other = room['guest' if role == 'host' else 'host']
                        if role == 'host':
                            rooms.pop(code, None)
                        else:
                            room['guest'] = None
                    else:
                        other = None
                if other:
                    other.send(json.dumps({'t': 'left'}))
            self.close_connection = True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    lan = '--lan' in sys.argv
    port = int(args[0]) if args else 8770
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)
    with http.server.ThreadingHTTPServer(('0.0.0.0' if lan else '127.0.0.1', port), handler) as server:
        server.daemon_threads = True
        print(f'Serving on http://localhost:{port}/')
        if lan:
            for url in lan_addresses(port):
                print(f'Party mode: the second player opens {url}')
        server.serve_forever()


if __name__ == '__main__':
    main()
