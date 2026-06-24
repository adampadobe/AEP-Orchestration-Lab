/**
 * Serve brand-scraper generated demo sites from GCS at /demos/<slug>/web/**.
 * Firebase Hosting rewrites /demos/** to imageHostingAsset, which delegates here.
 * Committed files under web/demos/ are served as static assets first.
 */
'use strict';

const path = require('path');
const admin = require('firebase-admin');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const DEMO_GCS_PREFIX = 'demo-websites';

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function safeSlugPart(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function safeRelFile(raw) {
  const cleaned = String(raw || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/');
  return cleaned || 'index.html';
}

/**
 * Parse /demos/<slug>/web[/file] from Hosting rewrite path.
 * @returns {{ slug: string, relFile: string } | null}
 */
function parseDemoRequestPath(reqPath) {
  const p = String(reqPath || '').replace(/\/+$/, '');
  const m = p.match(/^\/demos\/([^/]+)\/web(?:\/(.*))?$/i);
  if (!m) return null;
  const slug = safeSlugPart(m[1]);
  if (!slug) return null;
  const relFile = safeRelFile(m[2] || 'index.html');
  return { slug, relFile };
}

function contentTypeFor(relFile, metadataType) {
  if (metadataType) return metadataType;
  const ext = path.extname(relFile).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function gcsObjectKey(slug, relFile) {
  return `${DEMO_GCS_PREFIX}/${slug}/web/${relFile}`;
}

async function handleDemoHostRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('GET only');
    return;
  }

  const parsed = parseDemoRequestPath(req.path);
  if (!parsed) {
    res.status(404).send('not found');
    return;
  }

  const { slug, relFile } = parsed;
  const file = getBucket().file(gcsObjectKey(slug, relFile));
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).send('not found');
    return;
  }

  const [md] = await file.getMetadata().catch(() => [null]);
  const ct = contentTypeFor(relFile, md && md.contentType);
  res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  if (md && md.size) res.setHeader('Content-Length', String(md.size));
  if (md && md.etag) res.setHeader('ETag', md.etag);

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  file.createReadStream().on('error', (e) => {
    console.error('[brandScraperDemoHost] stream', String((e && e.message) || e));
    if (!res.headersSent) res.status(500).send('read error');
  }).pipe(res);
}

module.exports = {
  parseDemoRequestPath,
  gcsObjectKey,
  handleDemoHostRequest,
};
