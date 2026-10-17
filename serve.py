"""Local web server for the game that disables browser caching, so edits to
JavaScript modules always load fresh. Serves this folder on 127.0.0.1 only."""

import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'Serving on http://localhost:{port}/')
        server.serve_forever()


if __name__ == '__main__':
    main()
