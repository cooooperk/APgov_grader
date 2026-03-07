/**
 * Proxy server for AP Gov Essay Grader.
 * Forwards /api/chat to Ollama Cloud so the browser avoids CORS.
 * Serve the app from this server (same origin) so "Grade Essay" works.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OLLAMA_CHAT = 'https://ollama.com/api/chat';

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function proxyToOllama(req, res, body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const apiKey = payload.apiKey;
  if (!apiKey || typeof apiKey !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing apiKey in body' }));
    return;
  }

  const { model, stream, messages } = payload;
  const ollamaBody = JSON.stringify({ model: model || 'gpt-oss:20b-cloud', stream: stream !== false, messages: messages || [] });

  const url = new URL(OLLAMA_CHAT);
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'Content-Length': Buffer.byteLength(ollamaBody, 'utf8')
    }
  };

  const proxyReq = require('https').request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error('Ollama proxy error:', e.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy failed: ' + e.message }));
  });

  proxyReq.write(ollamaBody);
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  // Allow same-origin requests from any host (when page is served from this server)
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => proxyToOllama(req, res, body));
    return;
  }

  // Static files
  if (req.url === '/' || req.url === '/index.html') {
    serveFile(res, path.join(__dirname, 'ap-gov-grader.html'), 'text/html');
    return;
  }
  if (req.url === '/ap-gov-grader.html') {
    serveFile(res, path.join(__dirname, 'ap-gov-grader.html'), 'text/html');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('AP Gov Essay Grader server at http://localhost:' + PORT + '/');
  console.log('Open that URL in your browser; grading uses the proxy and avoids CORS.');
});
