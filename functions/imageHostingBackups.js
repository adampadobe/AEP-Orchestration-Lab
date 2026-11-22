'use strict';

const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const library = require('./imageHostingLibrary');
const drive = require('./imageHostingDrive');
const exportsService = require('./imageHostingExports');

const PAGE_SIZE = 100;
const WORKER_LEASE_MS = 11 * 60 * 1000;

function services(deps = {}) {
  if (!deps.db && !admin.apps.length) admin.initializeApp();
  return {
    db: deps.db || admin.firestore(),
    active: deps.active || admin.storage().bucket(library.BUCKET_NAME),
    private: deps.private || exportsService.privateBucket(),
  };
}

function backupCollection(db, uid) {
  return db.collection('imageHostingDrive').doc(drive.validUid(uid)).collection('backups');
}

function backupId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw drive.error('Invalid backup ID.');
  return value;
}

function sandboxName(value) {
  if (typeof value !== 'string' || !value || library.sandboxPrefix(value) !== value || value === 'users') {
    throw drive.error('Invalid sandbox name.');
  }
  return value;
}

function prefix(uid, id) {
  return `users/${drive.validUid(uid)}/backups/${backupId(id)}/`;
}

async function* pages(bucket, options) {
  let pageToken;
  do {
    const [files, next, response] = await bucket.getFiles({ ...options, autoPaginate: false, maxResults: PAGE_SIZE, pageToken });
    yield { files, response: response || {} };
    pageToken = next?.pageToken;
  } while (pageToken);
}

async function sandboxesUsed(workspaceSlug, deps = {}) {
  const { active } = services(deps);
  const name = sandboxName(workspaceSlug);
  let fileCount = 0;
  for await (const page of pages(active, { prefix: `${library.libraryRoot(name)}/` })) {
    fileCount += page.files.filter((file) => !file.name.endsWith(`/${library.LIBRARY_FOLDER_MARKER}`)).length;
  }
  return { sandboxes: [{ name, fileCount }] };
}

async function create(uid, sandboxes, deps = {}) {
  if (!Array.isArray(sandboxes) || !sandboxes.length || sandboxes.length > 100) throw drive.error('sandboxes[] is required.');
  const selected = [...new Set(sandboxes.map(sandboxName))];
  const { db } = services(deps);
  const id = randomUUID();
  await backupCollection(db, uid).doc(id).create({
    status: 'queued', sandboxes: selected, fileCount: 0, bytes: 0,
    progress: { done: 0, total: 0 }, createdAt: new Date().toISOString(),
    completedAt: null, error: null,
  });
  return { backupId: id };
}

async function get(uid, id, deps = {}) {
  const { db } = services(deps);
  const snap = await backupCollection(db, uid).doc(backupId(id)).get();
  if (!snap.exists) throw drive.error('Backup not found.', 404);
  return { id: snap.id, ...snap.data() };
}

async function list(uid, deps = {}) {
  const { db } = services(deps);
  const snap = await backupCollection(db, uid).orderBy('createdAt', 'desc').get();
  const backups = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return { backups, totalBytes: backups.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0) };
}

async function process(uid, id, deps = {}) {
  const { db, active, private: bucket } = services(deps);
  const ref = backupCollection(db, uid).doc(backupId(id));
  const owner = randomUUID();
  const job = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (data.status === 'complete' || data.status === 'failed') return null;
    if (data.status === 'running' && data.leaseUntil > Date.now()) throw new Error('Backup worker lease is held.');
    tx.update(ref, { status: 'running', worker: owner, leaseUntil: Date.now() + WORKER_LEASE_MS });
    return data;
  });
  if (!job) return;
  try {
    const objects = [];
    for (const sandbox of job.sandboxes) {
      const root = `${library.libraryRoot(sandboxName(sandbox))}/`;
      for await (const page of pages(active, { prefix: root })) {
        for (const file of page.files) {
          const relPath = file.name.slice(root.length);
          if (!relPath || relPath.endsWith(`/${library.LIBRARY_FOLDER_MARKER}`) || relPath === library.LIBRARY_FOLDER_MARKER) continue;
          if (drive.pathOf(relPath) !== relPath) throw new Error('Invalid library object path.');
          const md = file.metadata || {};
          if (!md.generation) throw new Error(`Missing object generation: ${sandbox}/${relPath}`);
          objects.push({ sandbox, relPath, size: Number(md.size) || 0, contentType: md.contentType || 'application/octet-stream',
            md5: md.md5Hash || null, crc32c: md.crc32c || null, generation: String(md.generation),
            metadata: md.metadata || {} });
        }
      }
    }
    await ref.update({ progress: { done: 0, total: objects.length } });
    let bytes = 0;
    for (let offset = 0; offset < objects.length; offset += 4) {
      const group = objects.slice(offset, offset + 4);
      const results = await Promise.allSettled(group.map(async (item) => {
        const source = active.file(`${library.libraryRoot(item.sandbox)}/${item.relPath}`, { generation: item.generation });
        const target = bucket.file(`${prefix(uid, id)}${item.sandbox}/${item.relPath}`);
        await source.copy(target, { contentType: item.contentType, cacheControl: 'private, no-store', metadata: item.metadata });
        const [md] = await target.getMetadata();
        if (!md.generation || Number(md.size) !== item.size
          || (item.md5 && item.md5 !== md.md5Hash) || (item.crc32c && item.crc32c !== md.crc32c)) {
          throw new Error(`Backup verification failed: ${item.sandbox}/${item.relPath}`);
        }
        item.backupGeneration = String(md.generation);
      }));
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      bytes += group.reduce((sum, item) => sum + item.size, 0);
      await ref.update({ fileCount: offset + group.length, bytes, progress: { done: offset + group.length, total: objects.length } });
    }
    await bucket.file(`${prefix(uid, id)}manifest.json`).save(JSON.stringify({ version: 1, files: objects }), {
      contentType: 'application/json', resumable: false, metadata: { cacheControl: 'private, no-store' },
    });
    await ref.update({ status: 'complete', completedAt: new Date().toISOString(), error: null,
      worker: admin.firestore.FieldValue.delete(), leaseUntil: admin.firestore.FieldValue.delete() });
  } catch (e) {
    console.error('[imageHostingBackups] backup failed:', e.message);
    await ref.update({ status: 'failed', completedAt: new Date().toISOString(), error: e.message,
      worker: admin.firestore.FieldValue.delete(), leaseUntil: admin.firestore.FieldValue.delete() });
  }
}

async function manifest(uid, id, deps = {}) {
  const { private: bucket } = services(deps);
  const record = await get(uid, id, deps);
  if (record.status !== 'complete') throw drive.error('Backup is not complete.', 409);
  const [data] = await bucket.file(`${prefix(uid, id)}manifest.json`).download();
  const parsed = JSON.parse(data.toString('utf8'));
  if (parsed.version !== 1 || !Array.isArray(parsed.files)) throw new Error('Invalid backup manifest.');
  for (const item of parsed.files) {
    if (!item || sandboxName(item.sandbox) !== item.sandbox || drive.pathOf(item.relPath) !== item.relPath
      || !/^\d+$/.test(String(item.generation || '')) || !/^\d+$/.test(String(item.backupGeneration || ''))
      || !Number.isSafeInteger(item.size) || item.size < 0 || typeof item.contentType !== 'string'
      || !item.metadata || typeof item.metadata !== 'object' || Array.isArray(item.metadata)) {
      throw new Error('Invalid backup manifest entry.');
    }
  }
  return parsed.files;
}

async function files(uid, id, cursor, deps = {}) {
  const { private: bucket } = services(deps);
  const all = await manifest(uid, id, deps);
  if (cursor && !/^\d+$/.test(cursor)) throw drive.error('Invalid cursor.');
  const offset = cursor ? Number(cursor) : 0;
  if (!Number.isSafeInteger(offset) || offset > all.length) throw drive.error('Invalid cursor.');
  const root = prefix(uid, id);
  const items = await Promise.all(all.slice(offset, offset + PAGE_SIZE).map(async (item) => {
    const file = bucket.file(`${root}${item.sandbox}/${item.relPath}`, { generation: item.backupGeneration });
    const [previewUrl] = await file.getSignedUrl({ action: 'read', version: 'v4', expires: Date.now() + 15 * 60 * 1000 });
    return { sandbox: item.sandbox, relPath: item.relPath, size: item.size, contentType: item.contentType, previewUrl };
  }));
  return { items, nextCursor: offset + PAGE_SIZE < all.length ? String(offset + PAGE_SIZE) : null };
}

function selectedFiles(all, filters = {}) {
  if (filters.sandboxes !== undefined && (!Array.isArray(filters.sandboxes) || filters.sandboxes.some((s) => sandboxName(s) !== s))) {
    throw drive.error('Invalid sandbox filter.');
  }
  if (filters.paths !== undefined && (!Array.isArray(filters.paths) || filters.paths.some((p) => typeof p !== 'string' || drive.pathOf(p) !== p))) {
    throw drive.error('Invalid path filter.');
  }
  const sandboxSet = filters.sandboxes === undefined ? null : new Set(filters.sandboxes);
  const pathSet = filters.paths === undefined ? null : new Set(filters.paths);
  return all.filter((item) => (!sandboxSet || sandboxSet.has(item.sandbox)) && (!pathSet || pathSet.has(`${item.sandbox}/${item.relPath}`)));
}

function scopedRestoreFiles(all, filters, workspaceSlug) {
  if (!workspaceSlug) throw drive.error('An owned lab workspace is required to restore the published library.', 403);
  const selected = selectedFiles(all, filters);
  if (selected.some((item) => item.sandbox !== workspaceSlug)
    || (filters.sandboxes || []).some((sandbox) => sandbox !== workspaceSlug)
    || (filters.paths || []).some((path) => !path.startsWith(`${workspaceSlug}/`))) {
    throw drive.error('Restore contains files outside your workspace sandbox. Select only your workspace files.', 403);
  }
  return selected;
}

function unchanged(item, current) {
  const wanted = item.metadata || {};
  const actual = current.metadata || {};
  const keys = Object.keys(wanted);
  return current.contentType === item.contentType
    && ((item.md5 && item.md5 === current.md5Hash) || (item.crc32c && item.crc32c === current.crc32c))
    && keys.length === Object.keys(actual).length && keys.every((key) => wanted[key] === actual[key]);
}

async function preview(uid, id, filters, deps = {}) {
  const { active } = services(deps);
  const all = scopedRestoreFiles(await manifest(uid, id, deps), filters, deps.workspaceSlug);
  const counts = { add: 0, overwrite: 0, unchanged: 0 };
  const items = [];
  for (const item of all) {
    sandboxName(item.sandbox);
    if (drive.pathOf(item.relPath) !== item.relPath) throw new Error('Invalid backup object path.');
    drive.imageType(item.relPath, item.contentType);
    let action = 'add';
    const file = active.file(`${library.libraryRoot(item.sandbox)}/${item.relPath}`);
    const [exists] = await file.exists();
    if (exists) {
      const [md] = await file.getMetadata();
      action = unchanged(item, md) ? 'unchanged' : 'overwrite';
    }
    counts[action] += 1;
    items.push({ sandbox: item.sandbox, relPath: item.relPath, action });
  }
  return { items, counts };
}

async function restore(uid, id, filters, deps = {}) {
  const { active, private: bucket } = services(deps);
  if (typeof deps.acquireSandboxLock !== 'function') throw new Error('Sandbox write lock is required.');
  const selected = scopedRestoreFiles(await manifest(uid, id, deps), filters, deps.workspaceSlug);
  const bySandbox = new Map();
  for (const item of selected) {
    sandboxName(item.sandbox);
    if (drive.pathOf(item.relPath) !== item.relPath) throw new Error('Invalid backup object path.');
    drive.imageType(item.relPath, item.contentType);
    if (!bySandbox.has(item.sandbox)) bySandbox.set(item.sandbox, []);
    bySandbox.get(item.sandbox).push(item);
  }
  let restored = 0;
  let skipped = 0;
  for (const [sandbox, items] of bySandbox) {
    const release = await deps.acquireSandboxLock(sandbox);
    try {
      for (const item of items) {
        const target = active.file(`${library.libraryRoot(sandbox)}/${item.relPath}`);
        const [exists] = await target.exists();
        let generation = 0;
        if (exists) {
          const [current] = await target.getMetadata();
          if (unchanged(item, current)) {
            skipped += 1;
            continue;
          }
          generation = current.generation;
          if (!generation) throw new Error('Missing target generation.');
          const snapshot = active.file(`${library.backupsRoot(sandbox)}/restore-${id}-${randomUUID()}/${item.relPath}`);
          await active.file(target.name, { generation }).copy(snapshot, { preconditionOpts: { ifGenerationMatch: 0 } });
        }
        const source = bucket.file(`${prefix(uid, id)}${sandbox}/${item.relPath}`, { generation: item.backupGeneration });
        await source.copy(target, {
          contentType: item.contentType, metadata: item.metadata || {},
          cacheControl: 'public, max-age=0, must-revalidate',
          preconditionOpts: { ifGenerationMatch: generation },
        });
        restored += 1;
      }
    } finally {
      await release();
    }
  }
  return { restored, skipped };
}

async function download(uid, id, deps = {}) {
  const { private: bucket } = services(deps);
  const all = await manifest(uid, id, deps);
  async function* entries() {
    for (const item of all) {
      yield { name: `${sandboxName(item.sandbox)}/${drive.pathOf(item.relPath)}`,
        file: bucket.file(`${prefix(uid, id)}${item.sandbox}/${item.relPath}`, { generation: item.backupGeneration }) };
    }
  }
  return exportsService.streamExport(uid, entries(), `backup-${id}.zip`, { bucket });
}

async function remove(uid, id, deps = {}) {
  const { db, private: bucket } = services(deps);
  const record = await get(uid, id, deps);
  if (record.status === 'queued' || record.status === 'running') throw drive.error('Backup is in progress.', 409);
  for await (const page of pages(bucket, { prefix: prefix(uid, id) })) {
    for (const file of page.files) await file.delete({ ignoreNotFound: true });
  }
  await backupCollection(db, uid).doc(backupId(id)).delete();
  return { deleted: id };
}

module.exports = { create, process, get, list, files, preview, restore, download, remove, sandboxesUsed, selectedFiles, sandboxName, pages };
