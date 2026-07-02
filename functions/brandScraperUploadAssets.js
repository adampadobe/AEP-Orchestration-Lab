/**
 * Persist uploaded HTML/ZIP bundles for demo website generation (site-clone from save-page uploads).
 * Stored under scrapes/{sandbox}/{scrapeId}/upload-assets/ so Re-analyse / Regenerate demo
 * can rebuild without re-posting the zip from the browser.
 */
'use strict';

const admin = require('firebase-admin');
const unzipper = require('unzipper');
const uploadedHtml = require('./brandScraperUploadedHtml');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const MANIFEST_NAME = 'manifest.json';
const BUNDLE_NAME = 'bundle.zip';

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function safeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'default';
}

function uploadAssetsPrefix(sandbox, scrapeId) {
  return `scrapes/${safeSlug(sandbox)}/${safeSlug(scrapeId)}/upload-assets/`;
}

function isSafeRelPath(name) {
  const n = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return n && !n.includes('..');
}

/**
 * @param {string} sandbox
 * @param {string} scrapeId
 * @param {{ uploadPayload?: object, entries?: Array }} opts
 * @returns {Promise<string|null>} GCS prefix when saved
 */
async function persistUploadAssets(sandbox, scrapeId, opts = {}) {
  const entries = opts.entries || [];
  const uploadPayload = opts.uploadPayload || null;
  if (!entries.length && !(uploadPayload && uploadPayload.zipBase64)) return null;

  const prefix = uploadAssetsPrefix(sandbox, scrapeId);
  const bucket = getBucket();
  const manifest = {
    savedAt: new Date().toISOString(),
    entryCount: entries.length,
    kind: 'files',
  };

  if (uploadPayload && uploadPayload.zipBase64) {
    const buf = uploadedHtml.decodeBase64Payload(uploadPayload.zipBase64);
    if (buf.length) {
      await bucket.file(`${prefix}${BUNDLE_NAME}`).save(buf, {
        contentType: 'application/zip',
        resumable: false,
        metadata: { cacheControl: 'private, max-age=0' },
      });
      manifest.kind = 'zip';
      manifest.entryCount = entries.length || null;
      await bucket.file(`${prefix}${MANIFEST_NAME}`).save(JSON.stringify(manifest, null, 2), {
        contentType: 'application/json; charset=utf-8',
        resumable: false,
      });
      return prefix;
    }
  }

  for (const e of entries) {
    if (!e || !e.name || !e.content || !e.content.length) continue;
    const rel = String(e.name).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!isSafeRelPath(rel)) continue;
    await bucket.file(`${prefix}${rel}`).save(e.content, {
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    });
  }

  manifest.entryCount = entries.length;
  await bucket.file(`${prefix}${MANIFEST_NAME}`).save(JSON.stringify(manifest, null, 2), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
  });
  return prefix;
}

/**
 * @param {string} sandbox
 * @param {string} scrapeId
 * @param {string} [knownPrefix]
 * @returns {Promise<Array<{ name: string, content: Buffer, isHtml?: boolean }>>}
 */
async function loadUploadAssets(sandbox, scrapeId, knownPrefix, opts = {}) {
  const prefix = knownPrefix || uploadAssetsPrefix(sandbox, scrapeId);
  const bucket = getBucket();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const LOAD_CONCURRENCY = 10;

  try {
    const [zipExists] = await bucket.file(`${prefix}${BUNDLE_NAME}`).exists();
    if (zipExists) {
      if (onProgress) onProgress('Loading upload bundle from storage…');
      const [buf] = await bucket.file(`${prefix}${BUNDLE_NAME}`).download();
      const parsed = await uploadedHtml.parseUploadedPayload({
        zipBase64: buf.toString('base64'),
      });
      const entries = parsed.uploadEntries || [];
      if (onProgress && entries.length) {
        onProgress(`Loaded upload bundle (${entries.length} files)…`);
      }
      return entries;
    }
  } catch (e) {
    console.warn('[brandScraperUploadAssets] zip load failed', scrapeId, String((e && e.message) || e));
  }

  try {
    const [files] = await bucket.getFiles({ prefix, maxResults: 500 });
    const toLoad = (files || []).filter((f) => {
      const name = f.name || '';
      if (!name.startsWith(prefix)) return false;
      const rel = name.slice(prefix.length);
      return rel && rel !== MANIFEST_NAME && rel !== BUNDLE_NAME && isSafeRelPath(rel);
    });
    const entries = [];
    for (let i = 0; i < toLoad.length; i += LOAD_CONCURRENCY) {
      const batch = toLoad.slice(i, i + LOAD_CONCURRENCY);
      const done = Math.min(i + LOAD_CONCURRENCY, toLoad.length);
      if (onProgress) onProgress(`Loading upload assets (${done}/${toLoad.length})…`);
      const batchEntries = await Promise.all(batch.map(async (f) => {
        const name = f.name || '';
        const rel = name.slice(prefix.length);
        const [buf] = await f.download();
        return {
          name: rel,
          content: buf,
          isHtml: /\.html?$/i.test(rel),
        };
      }));
      entries.push(...batchEntries);
    }
    return entries;
  } catch (e) {
    console.warn('[brandScraperUploadAssets] file list load failed', scrapeId, String((e && e.message) || e));
    return [];
  }
}

function hasHtmlEntries(entries) {
  return (entries || []).some((e) => e && e.isHtml !== false && /\.html?$/i.test(e.name));
}

/**
 * Inline request entries, else GCS bundle from this scrape.
 * @param {object} record
 * @param {{ uploadEntries?: Array, sandbox?: string, scrapeId?: string }} opts
 */
async function resolveDemoUploadEntries(record, opts = {}) {
  const inline = opts.uploadEntries || [];
  if (hasHtmlEntries(inline)) return inline;

  const sandbox = opts.sandbox || (record && record.sandbox);
  const scrapeId = opts.scrapeId || (record && record.scrapeId);
  if (!sandbox || !scrapeId) return [];

  const stored = await loadUploadAssets(sandbox, scrapeId, record && record.uploadAssetsPrefix, {
    onProgress: opts.onProgress,
  });
  return hasHtmlEntries(stored) ? stored : stored;
}

module.exports = {
  uploadAssetsPrefix,
  persistUploadAssets,
  loadUploadAssets,
  resolveDemoUploadEntries,
  hasHtmlEntries,
};
