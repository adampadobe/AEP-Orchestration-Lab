'use strict';

const { createHash, randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const { privateBucket } = require('./imageHostingExports');

const MIME_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
};
const MAX_MOVE_ENTRIES = 200;
const LOCK_MS = 15 * 60 * 1000;

function error(message, status = 400) {
  const result = new Error(message);
  result.status = status;
  return result;
}

function validUid(uid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw error('Invalid user identifier.');
  return uid;
}

function pathOf(value, allowRoot = false) {
  if (typeof value !== 'string') throw error('Invalid path.');
  const path = value.replace(/^\/+|\/+$/g, '');
  if (!path && allowRoot) return '';
  if (!path || path.length > 700 || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..')) throw error('Invalid path.');
  return path;
}

function imageType(path, contentType) {
  const ext = path.split('.').pop().toLowerCase();
  const expected = MIME_TYPES[ext];
  const actual = String(contentType || expected || '').split(';')[0].trim().toLowerCase();
  if (!expected || (actual !== expected && !(expected === 'image/jpeg' && actual === 'image/jpg'))) {
    throw error('Unsupported image extension or content type.');
  }
  return expected;
}

function idFor(path) {
  return createHash('sha256').update(path).digest('hex');
}

function parentOf(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function services(overrides = {}) {
  if (!overrides.db && !admin.apps.length) admin.initializeApp();
  return { db: overrides.db || admin.firestore(), bucket: overrides.bucket || privateBucket() };
}

function entries(db, uid) {
  return db.collection('imageHostingDrive').doc(validUid(uid)).collection('entries');
}

function objectPath(uid, path) {
  return `users/${validUid(uid)}/drive/${path}`;
}

async function withLock(db, uid, work) {
  const ref = db.collection('imageHostingDrive').doc(validUid(uid));
  const owner = randomUUID();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const lock = snapshot.data()?.driveLock;
    if (lock && lock.expiresAt > Date.now()) throw error('Another drive operation is in progress.', 409);
    tx.set(ref, { driveLock: { owner, expiresAt: Date.now() + LOCK_MS } }, { merge: true });
  });
  try {
    return await work();
  } finally {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.data()?.driveLock?.owner === owner) {
        tx.set(ref, { driveLock: admin.firestore.FieldValue.delete() }, { merge: true });
      }
    });
  }
}

async function find(collection, path) {
  const snapshot = await collection.doc(idFor(path)).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function requireParent(collection, path) {
  const parent = parentOf(path);
  if (!parent) return;
  const entry = await find(collection, parent);
  if (!entry || entry.kind !== 'folder') throw error('Parent folder not found.', 404);
}

async function list(uid, rawPath, cursor, deps = {}) {
  const path = pathOf(rawPath || '', true);
  const { db, bucket } = services(deps);
  const collection = entries(db, uid);
  if (path) {
    const folder = await find(collection, path);
    if (!folder || folder.kind !== 'folder') throw error('Folder not found.', 404);
  }
  let query = collection.where('parentPath', '==', path).orderBy(admin.firestore.FieldPath.documentId()).limit(101);
  if (cursor) {
    if (!/^[a-f0-9]{64}$/.test(cursor)) throw error('Invalid cursor.');
    query = query.startAfter(cursor);
  }
  const snapshots = (await query.get()).docs;
  const page = snapshots.slice(0, 100);
  const items = await Promise.all(page.map(async (snapshot) => {
    const data = snapshot.data();
    let previewUrl = null;
    if (data.kind === 'file') {
      [previewUrl] = await bucket.file(objectPath(uid, data.path)).getSignedUrl({
        version: 'v4', action: 'read', expires: Date.now() + 15 * 60 * 1000,
      });
    }
    return { name: data.path.split('/').pop(), path: data.path, kind: data.kind,
      size: data.size, contentType: data.contentType, updatedAt: data.updatedAt, previewUrl };
  }));
  return { items, nextCursor: snapshots.length > 100 ? page[page.length - 1].id : null };
}

async function folder(uid, rawPath, deps = {}) {
  const path = pathOf(rawPath);
  const { db } = services(deps);
  return withLock(db, uid, async () => {
    const collection = entries(db, uid);
    await requireParent(collection, path);
    if (await find(collection, path)) throw error(`Path already exists: ${path}`, 409);
    const now = new Date().toISOString();
    await collection.doc(idFor(path)).create({ path, parentPath: parentOf(path), kind: 'folder',
      size: 0, contentType: null, createdAt: now, updatedAt: now, source: 'user' });
    return { path };
  });
}

async function upload(uid, rawPath, files, options = {}, deps = {}) {
  const path = pathOf(rawPath || '', true);
  if (!Array.isArray(files) || !files.length || files.length > 20) throw error('Provide between 1 and 20 files.');
  const onConflict = options.onConflict || 'error';
  if (!['error', 'replace', 'version'].includes(onConflict)) throw error('Invalid conflict option.');
  const { db, bucket } = services(deps);
  return withLock(db, uid, async () => {
    const collection = entries(db, uid);
    if (path) {
      const entry = await find(collection, path);
      if (!entry || entry.kind !== 'folder') throw error('Folder not found.', 404);
    }
    const uploaded = [];
    const errors = [];
    for (const input of files) {
      try {
        const originalName = pathOf(input.name);
        if (originalName.includes('/')) throw error('File name must not contain a folder.');
        const originalType = imageType(originalName, input.contentType);
        const encoded = String(input.base64 || '').replace(/^data:[^,]*;base64,/, '');
        if (!encoded || encoded.length > 12 * 1024 * 1024
          || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
          throw error('Invalid image data.');
        }
        let bytes = Buffer.from(encoded, 'base64');
        if (bytes.length > 8 * 1024 * 1024) throw error('Image exceeds 8 MiB.', 413);
        let ext = originalName.split('.').pop().toLowerCase();
        let contentType = originalType;
        if (options.convertToPng === true && ext !== 'gif') {
          bytes = await require('sharp')(bytes)
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
          ext = 'png';
          contentType = 'image/png';
        }
        const stem = originalName.replace(/\.[^.]+$/, '').toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'image';
        let name = `${stem}.${ext}`;
        let target = path ? `${path}/${name}` : name;
        let previous = await find(collection, target);
        if (previous && onConflict === 'version') {
          let n = 1;
          do {
            name = `${stem}-${n++}.${ext}`;
            target = path ? `${path}/${name}` : name;
            previous = await find(collection, target);
          } while (previous && n <= 501);
          if (previous) throw error('Too many existing versions.', 409);
        }
        if (previous && (onConflict !== 'replace' || previous.kind !== 'file')) {
          throw error(`Path already exists: ${target}`, 409);
        }
        const file = bucket.file(objectPath(uid, target));
        let generation = 0;
        if (previous) {
          const [metadata] = await file.getMetadata();
          generation = metadata.generation;
          if (!generation) throw new Error('Missing existing object generation.');
        }
        await file.save(bytes, { contentType, resumable: false, preconditionOpts: { ifGenerationMatch: generation },
          metadata: { cacheControl: 'private, no-store' } });
        const now = new Date().toISOString();
        const entry = { path: target, parentPath: path, kind: 'file', size: bytes.length, contentType,
          createdAt: previous?.createdAt || now, updatedAt: now, source: 'upload' };
        if (previous) await collection.doc(idFor(target)).set(entry);
        else await collection.doc(idFor(target)).create(entry);
        uploaded.push({ name, path: target, kind: 'file', size: bytes.length, contentType, updatedAt: now });
      } catch (e) {
        errors.push({ name: input?.name || '', error: e.message, status: Number(e.status) || 500 });
      }
    }
    return { uploaded, errors };
  });
}

async function subtree(collection, path) {
  const root = await find(collection, path);
  if (!root) throw error('Path not found.', 404);
  if (root.kind !== 'folder') return [root];
  const snapshot = await collection.orderBy('path').startAt(`${path}/`).endAt(`${path}/\uf8ff`).limit(MAX_MOVE_ENTRIES + 1).get();
  if (snapshot.size >= MAX_MOVE_ENTRIES) throw error('Folder contains too many entries for one operation.', 413);
  return [root, ...snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))];
}

async function move(uid, rawFrom, rawTo, deps = {}) {
  const from = pathOf(rawFrom);
  const to = pathOf(rawTo);
  if (from === to || to.startsWith(`${from}/`)) throw error('Invalid destination.');
  const { db, bucket } = services(deps);
  return withLock(db, uid, async () => {
    const collection = entries(db, uid);
    await requireParent(collection, to);
    const moving = await subtree(collection, from);
    const targets = moving.map((item) => ({ ...item, target: to + item.path.slice(from.length) }));
    for (const item of targets) if (await find(collection, item.target)) throw error(`Path already exists: ${item.target}`, 409);
    const copied = [];
    let commitStarted = false;
    try {
      for (const item of targets.filter((item) => item.kind === 'file')) {
        const destination = bucket.file(objectPath(uid, item.target));
        await bucket.file(objectPath(uid, item.path)).copy(destination, { preconditionOpts: { ifGenerationMatch: 0 } });
        copied.push(destination);
      }
      const batch = db.batch();
      const now = new Date().toISOString();
      for (const item of targets) {
        const { id, target, ...data } = item;
        batch.create(collection.doc(idFor(target)), { ...data, path: target, parentPath: parentOf(target), updatedAt: now });
        batch.delete(collection.doc(id));
      }
      commitStarted = true;
      await batch.commit();
    } catch (e) {
      if (!commitStarted) {
        for (const file of copied) await file.delete({ ignoreNotFound: true }).catch((cleanupError) => console.error('[imageHostingDrive] move cleanup failed', cleanupError.message));
      }
      throw e;
    }
    try {
      for (const item of targets.filter((item) => item.kind === 'file')) {
        await bucket.file(objectPath(uid, item.path)).delete({ ignoreNotFound: true });
      }
    } catch (e) {
      throw new Error(`Move was saved, but old objects could not be cleaned up: ${e.message}`);
    }
    return { from, to };
  });
}

async function remove(uid, paths, deps = {}) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 100) throw error('paths[] is required.');
  const roots = [...new Set(paths.map((path) => pathOf(path)))];
  const { db, bucket } = services(deps);
  return withLock(db, uid, async () => {
    const collection = entries(db, uid);
    const all = new Map();
    for (const path of roots) for (const item of await subtree(collection, path)) all.set(item.path, item);
    if (all.size > MAX_MOVE_ENTRIES) throw error('Too many entries for one operation.', 413);
    for (const item of all.values()) {
      if (item.kind === 'file') await bucket.file(objectPath(uid, item.path)).delete({ ignoreNotFound: true });
    }
    const batch = db.batch();
    for (const item of all.values()) batch.delete(collection.doc(item.id));
    await batch.commit();
    return { deleted: all.size };
  });
}

module.exports = { list, folder, upload, move, remove, pathOf, imageType, validUid, objectPath, withLock, error };
