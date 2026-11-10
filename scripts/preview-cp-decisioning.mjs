import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../web/', import.meta.url));
const reads = new Set(['/api/profile/table', '/api/profile/consent', '/api/profile/audiences', '/api/profile/events',
  '/api/profile/attribute-ownership', '/api/events/generator-targets', '/api/events/config', '/api/event-config',
  '/api/decision-lab/config', '/api/catalog/config', '/api/env-bar-config', '/api/sandboxes',
  '/api/lab/user-sandbox-data', '/api/lab/user', '/api/lab/generation-prefs', '/api/tags/properties',
  '/api/tags/reactor', '/api/events/datastreams', '/api/image-hosting/library']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
export function createPreviewServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/') { res.writeHead(302, { Location: '/profile-viewer/cp-decisioning-demo.html' }).end(); return; }
      if (url.pathname.startsWith('/api/')) {
        let body;
        let allowed = req.method === 'GET' && reads.has(url.pathname);
        if (req.method === 'POST' && ['/api/aep', '/api/tags/reactor', '/api/lab/user-sandbox-data'].includes(url.pathname)) {
          let text = '';
          for await (const chunk of req) { text += chunk; if (text.length > 65536) throw new Error('Read request too large.'); }
          body = JSON.parse(text);
          allowed = body.method === 'GET' && (url.pathname === '/api/tags/reactor' ||
            url.pathname === '/api/aep' && /^\/data\/foundation\/(schemaregistry|sandbox-management)\//.test(body.path || ''));
        }
        if (!allowed) { res.writeHead(403, { 'Content-Type': 'application/json' }).end(JSON.stringify({
          ok: false, error: 'Local preview is read-only. Profile, event, AJO and configuration writes are blocked.' })); return; }
        if (url.searchParams.has('sandbox') && url.searchParams.get('sandbox') !== 'kirkham') {
          res.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":"Only kirkham is allowed in this preview."}'); return;
        }
        if (body?.platform_headers?.['x-sandbox-name'] && body.platform_headers['x-sandbox-name'] !== 'kirkham') {
          res.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":"Only kirkham is allowed in this preview."}'); return;
        }
        if (req.method === 'GET' && url.pathname !== '/api/sandboxes') url.searchParams.set('sandbox', 'kirkham');
        const upstream = await fetch('https://aep-orchestration-lab.web.app' + url.pathname + url.search, {
          method: req.method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
        res.end(Buffer.from(await upstream.arrayBuffer())); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (error.code === 'ENOENT') res.writeHead(404).end('Not found');
      else { console.error('CP preview request failed:', error.message); res.writeHead(502).end('Preview request failed: ' + error.message); }
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPreviewServer();
  server.listen(4178, '127.0.0.1', () => console.log('CP read-only preview: http://127.0.0.1:4178/profile-viewer/cp-decisioning-demo.html'));
  server.on('error', error => { console.error(error); process.exitCode = 1; });
}
