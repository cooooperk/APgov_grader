"""
Proxy server for AP Gov Essay Grader.
Forwards /api/chat to Ollama Cloud so the browser avoids CORS.
Run with:  python server.py
Then open http://localhost:3000/ in your browser.
"""

import json
import os
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get('PORT', 3000))
OLLAMA_CHAT = 'https://ollama.com/api/chat'
HTML_FILE = 'ap-gov-grader.html'


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path in ('/', '/index.html', '/ap-gov-grader.html'):
            try:
                with open(HTML_FILE, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(data)
            except FileNotFoundError:
                self.send_error(404, 'ap-gov-grader.html not found')
            return
        self.send_error(404)

    def do_POST(self):
        if self.path != '/api/chat':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {'error': 'Invalid JSON body'})
            return
        api_key = payload.get('apiKey')
        if not api_key or not isinstance(api_key, str):
            self.send_json(400, {'error': 'Missing apiKey in body'})
            return
        model = payload.get('model', 'gpt-oss:20b-cloud')
        stream = payload.get('stream', False) if 'stream' in payload else False
        messages = payload.get('messages', [])
        ollama_body = json.dumps({'model': model, 'stream': stream, 'messages': messages}).encode('utf-8')
        req = urllib.request.Request(
            OLLAMA_CHAT,
            data=ollama_body,
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + api_key,
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'application/json'))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(e.read() if e.fp else b'{}')
        except Exception as e:
            self.send_json(502, {'error': 'Proxy failed: ' + str(e)})

    def send_json(self, code, obj):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode('utf-8'))

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))


if __name__ == '__main__':
    server = HTTPServer(('', PORT), Handler)
    print('AP Gov Essay Grader server at http://localhost:%s/' % PORT)
    print('Open that URL in your browser. (Uses Python; no Node.js required.)')
    server.serve_forever()
