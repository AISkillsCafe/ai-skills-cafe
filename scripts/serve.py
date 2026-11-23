"""Preview the site locally the way Cloudflare serves it (/menu -> menu.html).

Run:  python scripts/serve.py      then open http://localhost:8080
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")


VISITORS = [1234]   # pretend count for the local preview; the real one lives on Cloudflare (worker/index.js)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE, **kw)

    def visitors(self, add):
        VISITORS[0] += add
        body = ('{"visitors":%d}' % VISITORS[0]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.partition("?")[0] == "/api/visitors":
            return self.visitors(0)
        return super().do_GET()

    def do_POST(self):
        if self.path.partition("?")[0] == "/api/visitors":
            return self.visitors(1)
        self.send_error(405)

    def send_head(self):
        path, _, query = self.path.partition("?")
        if "." not in path.rsplit("/", 1)[-1] and path != "/" and os.path.isfile(os.path.join(SITE, path.strip("/") + ".html")):
            self.path = path + ".html" + ("?" + query if query else "")
        elif not os.path.exists(self.translate_path(path)):
            self.path = "/404.html"
        return super().send_head()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print("Previewing http://localhost:%d (Ctrl+C to stop)" % port)
ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
