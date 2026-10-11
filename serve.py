import http.server, socketserver, os, sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0].split("#")[0]
        f = "index.html" if p == "/" else p.lstrip("/")
        full = os.path.join(ROOT, f)
        if not os.path.exists(full) and os.path.exists(full + ".html"):
            f = f + ".html"
        self.path = "/" + f
        return super().do_GET()
os.chdir(ROOT)
print(f"http://127.0.0.1:{PORT}/")
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H) as s:
    s.serve_forever()
