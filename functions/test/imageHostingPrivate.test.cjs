'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const drive = require('../imageHostingDrive');
const backups = require('../imageHostingBackups');

function fakeFirestore() {
  const data = new Map();
  function snapshot(path) {
    return { id: path.split('/').pop(), exists: data.has(path), data: () => data.get(path) };
  }
  function doc(path) {
    return {
      path, id: path.split('/').pop(),
      collection: (name) => collection(`${path}/${name}`),
      get: async () => snapshot(path),
      create: async (value) => { if (data.has(path)) throw new Error('Already exists'); data.set(path, value); },
      set: async (value, options) => data.set(path, options?.merge ? { ...data.get(path), ...value } : value),
      update: async (value) => { if (!data.has(path)) throw new Error('Missing document'); data.set(path, { ...data.get(path), ...value }); },
      delete: async () => data.delete(path),
    };
  }
  function collection(path) {
    const config = {};
    const query = {
      doc: (id) => doc(`${path}/${id}`),
      where: (field, _op, value) => { config.field = field; config.value = value; return query; },
      orderBy: (field) => { config.order = typeof field === 'string' ? field : '__name__'; return query; },
      startAt: (value) => { config.start = value; return query; },
      endAt: (value) => { config.end = value; return query; },
      startAfter: (value) => { config.after = value; return query; },
      limit: (value) => { config.limit = value; return query; },
      async get() {
        let docs = [...data.keys()].filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')).map(snapshot);
        if (config.field) docs = docs.filter((item) => item.data()[config.field] === config.value);
        const key = (item) => config.order === '__name__' ? item.id : item.data()[config.order];
        if (config.order) docs.sort((a, b) => String(key(a)).localeCompare(String(key(b))));
        if (config.start !== undefined) docs = docs.filter((item) => key(item) >= config.start);
        if (config.end !== undefined) docs = docs.filter((item) => key(item) <= config.end);
        if (config.after !== undefined) docs = docs.filter((item) => key(item) > config.after);
        if (config.limit !== undefined) docs = docs.slice(0, config.limit);
        return { docs, size: docs.length };
      },
    };
    return query;
  }
  const db = {
    data,
    collection,
    async runTransaction(work) {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, value, options) => { ref.set(value, options); },
        update: (ref, value) => { ref.update(value); },
      };
      return work(tx);
    },
    batch() {
      const work = [];
      return {
        create: (ref, value) => work.push(() => ref.create(value)),
        delete: (ref) => work.push(() => ref.delete()),
        async commit() { for (const action of work) await action(); },
      };
    },
  };
  return db;
}

let generation = 0;
function fakeBucket(name) {
  const objects = new Map();
  function file(path, options = {}) {
    return {
      name: path,
      get metadata() { return objects.get(path)?.metadata; },
      async save(bytes, opts = {}) {
        const previous = objects.get(path);
        const expected = opts.preconditionOpts?.ifGenerationMatch;
        if (expected !== undefined && String(expected) !== String(previous?.metadata.generation || 0)) throw new Error('Generation conflict');
        const contents = Buffer.from(bytes);
        objects.set(path, { contents, metadata: { generation: String(++generation), size: String(contents.length),
          contentType: opts.contentType || 'application/octet-stream',
          md5Hash: createHash('md5').update(contents).digest('base64'),
          metadata: opts.metadata || {} } });
      },
      async copy(destination, opts = {}) {
        const source = objects.get(path);
        if (!source || (options.generation && String(options.generation) !== source.metadata.generation)) throw new Error('Source missing');
        await destination.save(source.contents, { contentType: opts.contentType || source.metadata.contentType,
          metadata: opts.metadata || source.metadata.metadata, preconditionOpts: opts.preconditionOpts });
      },
      async exists() { return [objects.has(path)]; },
      async getMetadata() { if (!objects.has(path)) throw new Error('Missing object'); return [objects.get(path).metadata]; },
      async download() { if (!objects.has(path)) throw new Error('Missing object'); return [objects.get(path).contents]; },
      async setMetadata(changes) { Object.assign(objects.get(path).metadata, changes); },
      async delete() { objects.delete(path); },
      async getSignedUrl() { return [`https://private.example/${path}`]; },
    };
  }
  return {
    name, objects, file,
    async getFiles(opts = {}) {
      let names = [...objects.keys()].filter((key) => key.startsWith(opts.prefix || '')).sort();
      let prefixes = [];
      if (opts.delimiter) {
        prefixes = [...new Set(names.filter((key) => key.includes('/')).map((key) => key.slice(0, key.indexOf('/') + 1)))];
        names = names.filter((key) => !key.includes('/'));
      }
      const offset = Number(opts.pageToken || 0);
      const max = opts.maxResults || names.length;
      const page = names.slice(offset, offset + max).map((key) => file(key));
      const next = offset + max < names.length ? { pageToken: String(offset + max) } : null;
      return [page, next, { prefixes }];
    },
  };
}

function harness() {
  const db = fakeFirestore();
  const active = fakeBucket('public');
  const privateBucket = fakeBucket('private');
  return { db, active, private: privateBucket, bucket: privateBucket };
}

test('drive supports private folders, conflicts, moves and deletion without crossing users', async () => {
  const deps = harness();
  await drive.folder('alice', 'Photos', deps);
  const source = [{ name: 'Beach Photo.JPG', base64: Buffer.from('one').toString('base64'), contentType: 'image/jpeg' }];
  const first = await drive.upload('alice', 'Photos', source, {}, deps);
  assert.equal(first.uploaded[0].path, 'Photos/beach-photo.jpg');
  const conflict = await drive.upload('alice', 'Photos', source, {}, deps);
  assert.equal(conflict.errors[0].status, 409);
  const replacement = await drive.upload('alice', 'Photos', [
    { ...source[0], base64: Buffer.from('new').toString('base64') },
  ], { onConflict: 'replace' }, deps);
  assert.equal(replacement.uploaded.length, 1);
  assert.equal((await deps.private.file('users/alice/drive/Photos/beach-photo.jpg').download())[0].toString(), 'new');
  const version = await drive.upload('alice', 'Photos', source, { onConflict: 'version' }, deps);
  assert.equal(version.uploaded[0].name, 'beach-photo-1.jpg');
  const other = await drive.list('bob', '', null, deps);
  assert.deepEqual(other.items, []);
  await drive.move('alice', 'Photos', 'Archive', deps);
  const listed = await drive.list('alice', 'Archive', null, deps);
  assert.equal(listed.items.length, 2);
  assert.ok(listed.items.every((item) => item.previewUrl.includes('users/alice/drive/Archive/')));
  assert.equal(deps.private.objects.has('users/alice/drive/Photos/beach-photo.jpg'), false);
  await drive.remove('alice', ['Archive'], deps);
  assert.equal(deps.private.objects.size, 0);
});

test('drive converts images to PNG only when requested', async () => {
  const deps = harness();
  const image = await require('sharp')({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const result = await drive.upload('alice', '', [
    { name: 'Image.jpg', base64: image.toString('base64'), contentType: 'image/jpeg' },
  ], { convertToPng: true }, deps);
  assert.equal(result.uploaded[0].name, 'image.png');
  const bytes = (await deps.private.file('users/alice/drive/image.png').download())[0];
  assert.equal((await require('sharp')(bytes).metadata()).format, 'png');
});

test('backup captures selected public library files and restores safely with snapshots', async () => {
  const deps = harness();
  await deps.active.file('retail/library/logo.png').save('original', { contentType: 'image/png', metadata: { aiGenerated: 'true' } });
  await deps.active.file('other/library/banner.jpg').save('banner', { contentType: 'image/jpeg' });
  await deps.active.file('retail/library/.aep-library-folder').save('{}');
  await deps.active.file('scrape-cache-images/retail/scrape/image.png').save('excluded');
  const { backupId } = await backups.create('alice', ['retail'], deps);
  await backups.process('alice', backupId, deps);
  const record = await backups.get('alice', backupId, deps);
  assert.equal(record.status, 'complete');
  assert.deepEqual(record.progress, { done: 1, total: 1 });
  assert.equal(record.fileCount, 1);
  assert.equal(deps.private.objects.has(`users/alice/backups/${backupId}/retail/logo.png`), true);
  assert.equal([...deps.private.objects.keys()].some((key) => key.includes('scrape-cache-images')), false);
  await assert.rejects(backups.get('bob', backupId, deps), { status: 404 });
  const listing = await backups.files('alice', backupId, null, deps);
  assert.equal(listing.items[0].relPath, 'logo.png');
  await deps.active.file('retail/library/logo.png').save('changed', { contentType: 'image/png' });
  await deps.active.file('retail/library/unrelated.png').save('untouched', { contentType: 'image/png' });
  const preview = await backups.preview('alice', backupId, { paths: ['retail/logo.png'] }, { ...deps, workspaceSlug: 'retail' });
  assert.deepEqual(preview.counts, { add: 0, overwrite: 1, unchanged: 0 });
  let locks = 0;
  const options = { ...deps, workspaceSlug: 'retail', acquireSandboxLock: async () => { locks += 1; return async () => { locks -= 1; }; } };
  assert.deepEqual(await backups.restore('alice', backupId, { paths: ['retail/logo.png'] }, options), { restored: 1, skipped: 0 });
  assert.equal(locks, 0);
  assert.equal((await deps.active.file('retail/library/logo.png').download())[0].toString(), 'original');
  assert.equal((await deps.active.file('retail/library/logo.png').getMetadata())[0].metadata.aiGenerated, 'true');
  assert.equal((await deps.active.file('retail/library/unrelated.png').download())[0].toString(), 'untouched');
  assert.ok([...deps.active.objects.keys()].some((key) => key.startsWith('retail/library_backups/restore-')));
  assert.deepEqual(await backups.restore('alice', backupId, {}, options), { restored: 0, skipped: 1 });
  await backups.remove('alice', backupId, deps);
  assert.equal(deps.private.objects.size, 0);
});

test('rejects unsafe paths, unsupported restore formats, and unowned backups', async () => {
  for (const path of ['../secret', 'a/../secret', 'a\\secret']) assert.throws(() => drive.pathOf(path), /Invalid path/);
  assert.throws(() => drive.imageType('payload.html', 'text/html'), /Unsupported/);
  assert.throws(() => backups.selectedFiles([], { paths: ['../secret'] }), /Invalid path/);
  const deps = harness();
  const { backupId } = await backups.create('alice', ['retail'], deps);
  await assert.rejects(backups.remove('alice', backupId, deps), { status: 409 });
  await assert.rejects(backups.get('bob', backupId, deps), { status: 404 });
});

test('backup copy failure is recorded and never reported as complete', async () => {
  const deps = harness();
  await deps.active.file('retail/library/a.png').save('a', { contentType: 'image/png' });
  const original = deps.active.file;
  deps.active.file = (path, opts) => {
    const ref = original(path, opts);
    if (path === 'retail/library/a.png' && opts?.generation) ref.copy = async () => { throw new Error('injected copy failure'); };
    return ref;
  };
  const { backupId } = await backups.create('alice', ['retail'], deps);
  await backups.process('alice', backupId, deps);
  const record = await backups.get('alice', backupId, deps);
  assert.equal(record.status, 'failed');
  assert.match(record.error, /injected copy failure/);
  assert.equal(deps.active.objects.has('retail/library/a.png'), true);
  await assert.rejects(backups.preview('alice', backupId, {}, deps), { status: 409 });
});

test('backup files paginate without exposing other users and sandbox discovery counts only library images', async () => {
  const deps = harness();
  for (let i = 0; i < 105; i += 1) {
    await deps.active.file(`retail/library/${String(i).padStart(3, '0')}.png`).save('x', { contentType: 'image/png' });
  }
  await deps.active.file('retail/library/.aep-library-folder').save('{}');
  await deps.active.file('scrape-cache-images/retail/scrape/not-library.png').save('x');
  assert.deepEqual((await backups.sandboxesUsed('retail', deps)).sandboxes, [{ name: 'retail', fileCount: 105 }]);
  assert.deepEqual((await backups.sandboxesUsed('other', deps)).sandboxes, [{ name: 'other', fileCount: 0 }]);
  const { backupId } = await backups.create('alice', ['retail'], deps);
  await backups.process('alice', backupId, deps);
  const first = await backups.files('alice', backupId, null, deps);
  const second = await backups.files('alice', backupId, first.nextCursor, deps);
  assert.ok(first.nextCursor);
  assert.equal(second.nextCursor, null);
  assert.equal(first.items.length + second.items.length, 105);
  assert.ok(first.items.every((item) => item.previewUrl.includes('users/alice/')));
  await assert.rejects(backups.files('bob', backupId, null, deps), { status: 404 });
});

test('restore rejects non-image extensions before overwriting live files', async () => {
  const deps = harness();
  await deps.active.file('retail/library/a.html').save('backup', { contentType: 'text/html' });
  const { backupId } = await backups.create('alice', ['retail'], deps);
  await backups.process('alice', backupId, deps);
  await deps.active.file('retail/library/a.html').save('current', { contentType: 'text/html' });
  await assert.rejects(backups.restore('alice', backupId, {}, {
    ...deps, workspaceSlug: 'retail', acquireSandboxLock: async () => async () => {},
  }), /Unsupported/);
  assert.equal((await deps.active.file('retail/library/a.html').download())[0].toString(), 'current');
});

test('restore never overwrites an existing object when its snapshot fails', async () => {
  const deps = harness();
  await deps.active.file('retail/library/a.png').save('backup', { contentType: 'image/png' });
  const { backupId } = await backups.create('alice', ['retail'], deps);
  await backups.process('alice', backupId, deps);
  await deps.active.file('retail/library/a.png').save('current', { contentType: 'image/png' });
  const original = deps.active.file;
  deps.active.file = (path, opts) => {
    const ref = original(path, opts);
    if (path === 'retail/library/a.png' && opts?.generation) ref.copy = async () => { throw new Error('snapshot failed'); };
    return ref;
  };
  let released = false;
  await assert.rejects(backups.restore('alice', backupId, {}, {
    ...deps, workspaceSlug: 'retail', acquireSandboxLock: async () => async () => { released = true; },
  }), /snapshot failed/);
  assert.equal(released, true);
  assert.equal((await deps.active.file('retail/library/a.png').download())[0].toString(), 'current');
});

test('legacy multi-sandbox backups cannot preview or restore other workspace files', async () => {
  const deps = harness();
  await deps.active.file('retail/library/a.png').save('retail', { contentType: 'image/png' });
  await deps.active.file('other/library/b.png').save('other', { contentType: 'image/png' });
  const { backupId } = await backups.create('alice', ['retail', 'other'], deps);
  await backups.process('alice', backupId, deps);
  const scoped = { ...deps, workspaceSlug: 'retail', acquireSandboxLock: async () => async () => {} };
  await assert.rejects(backups.preview('alice', backupId, {}, scoped), { status: 403 });
  await assert.rejects(backups.restore('alice', backupId, {}, scoped), { status: 403 });
  await assert.rejects(backups.preview('alice', backupId, { paths: ['other/b.png'] }, scoped), { status: 403 });
  assert.equal((await backups.preview('alice', backupId, { paths: ['retail/a.png'] }, scoped)).items.length, 1);
});
