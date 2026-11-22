'use strict';

const { randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const admin = require('firebase-admin');
const archiver = require('archiver');

const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

function privateBucket() {
  if (!admin.apps.length) admin.initializeApp();
  const active = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
  const name = process.env.LAB_DEMO_ASSET_BACKUP_BUCKET || 'aep-orchestration-lab-demo-assets';
  if (name === active) throw new Error('Image Hosting exports require a separate private bucket.');
  return admin.storage().bucket(name);
}

async function cleanupExports(bucket, prefix, now) {
  let pageToken;
  do {
    const [files, next] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 100, pageToken });
    for (const file of files) {
      const created = Date.parse(file.metadata?.timeCreated || '');
      if (Number.isFinite(created) && created < now - EXPORT_TTL_MS) {
        await file.delete({ ignoreNotFound: true });
      }
    }
    pageToken = next?.pageToken;
  } while (pageToken);
}

async function streamExport(uid, entries, filename, options = {}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Invalid user identifier.');
  const bucket = options.bucket || privateBucket();
  const now = Date.now();
  const prefix = `users/${uid}/exports/`;
  try {
    await cleanupExports(bucket, prefix, now);
  } catch (error) {
    console.warn('[imageHostingExports] expired export cleanup failed:', error.message);
  }
  const file = bucket.file(`${prefix}${randomUUID()}.zip`);
  const safeName = String(filename || 'images.zip').replace(/[^A-Za-z0-9._-]/g, '-');
  const archive = archiver('zip', { zlib: { level: 6 } });
  const output = file.createWriteStream({
    resumable: false,
    contentType: 'application/zip',
    metadata: {
      contentDisposition: `attachment; filename="${safeName}"`,
      cacheControl: 'private, no-store',
    },
  });
  archive.on('warning', (error) => archive.destroy(error));
  const finished = pipeline(archive, output);
  finished.catch(() => {});
  try {
    let count = 0;
    for await (const entry of entries) {
      if (!entry.name || entry.name.includes('\\') || entry.name.split('/').some((part) => !part || part === '.' || part === '..')) {
        throw new Error('Invalid export entry path.');
      }
      const input = entry.file.createReadStream();
      input.on('error', (error) => archive.destroy(error));
      archive.append(input, { name: entry.name });
      count += 1;
    }
    if (!count) archive.append('No image files were available for export.\r\n', { name: 'README-empty-library.txt' });
    await Promise.all([archive.finalize(), finished]);
    const expires = Date.now() + SIGNED_URL_TTL_MS;
    const [url] = await file.getSignedUrl({
      action: 'read', version: 'v4', expires,
      responseDisposition: `attachment; filename="${safeName}"`,
      responseType: 'application/zip',
    });
    return { ok: true, url, expiresAt: new Date(expires).toISOString() };
  } catch (error) {
    archive.destroy(error);
    await finished.catch(() => {});
    await file.delete({ ignoreNotFound: true }).catch((cleanupError) => {
      console.error('[imageHostingExports] failed to delete incomplete export:', cleanupError.message);
    });
    throw error;
  }
}

module.exports = { privateBucket, streamExport };
