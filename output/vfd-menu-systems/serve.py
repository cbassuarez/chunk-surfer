"""Local review and anonymous interpretation test. No production routes."""
import importlib.util
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = Path(__file__).resolve().parent
SKILL = Path('/home/seb/.codex/plugins/cache/openai-bundled/visualize/1.0.45/skills/visualize/scripts/render.py')
spec = importlib.util.spec_from_file_location('visualize_renderer', SKILL)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)

class Review(BaseHTTPRequestHandler):
    def do_GET(self):
        name = 'proof' if self.path == '/proof' else 'menu'
        if self.path not in ('/', '/proof', '/test'):
            self.send_error(404)
            return
        source = (HERE / f'{name}.fragment.html').read_text()
        source = source.replace('__ASSETS__', (HERE / 'assets.json').read_text())
        source = source.replace('__RENDERER__', (HERE / 'renderer.js').read_text())
        if self.path == '/test':
            source = source.replace('<div id="cs-vfd-menu">', '<div id="cs-vfd-menu" data-test-only>')
        result = wrapper._render_document(source, f'Chunk Surfer VFD — {name}').encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(result)))
        self.end_headers()
        self.wfile.write(result)

    def log_message(self, *_):
        pass

print('Menu: http://127.0.0.1:5497/\nProof: http://127.0.0.1:5497/proof\nAnonymous test: http://127.0.0.1:5497/test', flush=True)
ThreadingHTTPServer(('127.0.0.1', 5497), Review).serve_forever()
