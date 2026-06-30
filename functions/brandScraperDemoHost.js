/**
 * Serve brand-scraper generated demo sites from GCS at /demos/<slug>/web/**.
 * Firebase Hosting rewrites /demos/** to imageHostingAsset, which delegates here.
 * Committed files under web/demos/ are served as static assets first.
 */
'use strict';

const path = require('path');
const admin = require('firebase-admin');
const demoPolish = require('./brandScraperDemoHtmlPolish');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const DEMO_GCS_PREFIX = 'demo-websites';
const PV_DEMO_GCS_PREFIX = 'profile-viewer-demos';

/** Retired /demos/<slug>/web/* — always 404 (legacy GCS copies may still exist). */
const RETIRED_DEMO_SLUGS = new Set(['news']);

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

function gcsProfileViewerDemoKey(fileSlug, relFile) {
  return `${PV_DEMO_GCS_PREFIX}/${fileSlug}/${relFile}`;
}

const CUSTOMER_LOGO_ASSET_RE = /-demo-assets\/_brand\/customer-logo\.(png|svg|webp|jpe?g)$/i;

async function readDemoMetadata(fileSlug) {
  try {
    const file = getBucket().file(gcsProfileViewerDemoKey(fileSlug, 'demo-metadata.json'));
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    return JSON.parse(buf.toString('utf8'));
  } catch (_e) {
    return null;
  }
}

async function readNavEntryForDemo(fileSlug) {
  try {
    const file = getBucket().file(`${PV_DEMO_GCS_PREFIX}/brand-scraper-demo-nav.json`);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    const data = JSON.parse(buf.toString('utf8'));
    const slug = safeSlugPart(fileSlug);
    const href = `${slug}-demo.html`;
    return (data.entries || []).find((e) => (
      safeSlugPart(e && e.fileSlug) === slug
      || String((e && e.href) || '').replace(/^\/profile-viewer\//, '') === href
    )) || null;
  } catch (_e) {
    return null;
  }
}

async function resolveDemoLogoContext(fileSlug) {
  const meta = await readDemoMetadata(fileSlug);
  let sandbox = meta && meta.sandbox;
  let scrapeId = meta && meta.scrapeId;
  let storedPath = meta && meta.customerLogoStoredPath;

  if (!sandbox || !scrapeId) {
    const navEntry = await readNavEntryForDemo(fileSlug);
    if (navEntry) {
      sandbox = sandbox || navEntry.sandbox || null;
      scrapeId = scrapeId || navEntry.scrapeId || null;
    }
  }

  if (!storedPath && sandbox && scrapeId) {
    storedPath = `scrapes/${safeSlugPart(sandbox)}/${safeSlugPart(scrapeId)}/customer-logo.png`;
  }

  return { sandbox, scrapeId, storedPath };
}

async function tryServeCustomerLogoFallback(req, fileSlug, res) {
  const { sandbox, scrapeId, storedPath } = await resolveDemoLogoContext(fileSlug);
  if (!sandbox && !scrapeId && !storedPath) return false;

  const asset = await demoPolish.downloadScrapeCustomerLogo(sandbox, scrapeId, storedPath);
  if (!asset || !asset.buffer || !asset.buffer.length) return false;

  const ct = contentTypeFor(`logo${asset.ext}`, asset.contentType);
  res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  res.setHeader('Content-Length', String(asset.buffer.length));
  if (req.method === 'HEAD') {
    res.status(200).end();
    return true;
  }
  res.status(200).end(asset.buffer);

  void demoPolish.syncCustomerLogoToExistingDemo({
    fileSlug,
    record: { customerLogo: { storedPath: asset.objectPath }, scrapeId, sandbox },
    sandbox,
    scrapeId,
  }).catch(() => {});

  return true;
}

/**
 * Parse /profile-viewer/<slug>-demo.html or …/<slug>-demo-assets/**
 * @returns {{ fileSlug: string, relFile: string } | null}
 */
function parseProfileViewerDemoPath(reqPath) {
  const p = String(reqPath || '').replace(/\/+$/, '');
  let m = p.match(/^\/profile-viewer\/([a-z0-9-]+)-demo\.html$/i);
  if (m) {
    const fileSlug = safeSlugPart(m[1]);
    if (!fileSlug) return null;
    return { fileSlug, relFile: `${fileSlug}-demo.html` };
  }
  m = p.match(/^\/profile-viewer\/([a-z0-9-]+)-demo-assets\/(.*)$/i);
  if (m) {
    const fileSlug = safeSlugPart(m[1]);
    if (!fileSlug) return null;
    const rel = safeRelFile(m[2] || 'index.html');
    return { fileSlug, relFile: `${fileSlug}-demo-assets/${rel}` };
  }
  if (p === '/profile-viewer/brand-scraper-demo-nav.json') {
    return { fileSlug: '__nav__', relFile: 'brand-scraper-demo-nav.json' };
  }
  return null;
}

async function handleProfileViewerDemoRequest(req, res) {
  const parsed = parseProfileViewerDemoPath(req.path);
  if (!parsed) {
    res.status(404).send('not found');
    return;
  }

  const relPath = parsed.fileSlug === '__nav__'
    ? 'profile-viewer-demos/brand-scraper-demo-nav.json'
    : gcsProfileViewerDemoKey(parsed.fileSlug, parsed.relFile);
  const file = getBucket().file(relPath);
  const [exists] = await file.exists();
  if (!exists) {
    if (CUSTOMER_LOGO_ASSET_RE.test(parsed.relFile)) {
      const served = await tryServeCustomerLogoFallback(req, parsed.fileSlug, res);
      if (served) return;
    }
    res.status(404).send('not found');
    return;
  }

  const [md] = await file.getMetadata().catch(() => [null]);
  const ct = contentTypeFor(parsed.relFile, md && md.contentType);
  res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', parsed.fileSlug === '__nav__' ? 'public, max-age=60' : 'public, max-age=300, must-revalidate');
  if (md && md.size) res.setHeader('Content-Length', String(md.size));
  if (md && md.etag) res.setHeader('ETag', md.etag);

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  file.createReadStream().on('error', (e) => {
    console.error('[brandScraperDemoHost] profile-viewer stream', String((e && e.message) || e));
    if (!res.headersSent) res.status(500).send('read error');
  }).pipe(res);
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
  if (RETIRED_DEMO_SLUGS.has(slug)) {
    res.status(404).send('not found');
    return;
  }

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
  parseProfileViewerDemoPath,
  gcsObjectKey,
  gcsProfileViewerDemoKey,
  CUSTOMER_LOGO_ASSET_RE,
  RETIRED_DEMO_SLUGS,
  resolveDemoLogoContext,
  readNavEntryForDemo,
  handleDemoHostRequest,
  handleProfileViewerDemoRequest,
};
