'use strict';

/**
 * Verifies the in-memory archiver pattern used by
 * functions/imageHostingLibrary.js → buildLibraryZipBuffer produces a ZIP
 * that:
 *   - has the PK\x03\x04 local-file-header at the start
 *   - has the PK\x05\x06 end-of-central-directory marker near the end
 *   - parses cleanly via the same `unzipper` library that the server
 *     uses on the restore path
 *   - round-trips entry bytes exactly
 *
 * This is what a working browser-side download must produce — when
 * archiver was being piped straight into the Express response the central
 * directory was being truncated by the Hosting layer's chunked re-framing
 * and macOS Archive Utility refused to open the .zip ("Error 2").
 */

const test = require('node:test');
const assert = require('node:assert');
const archiver = require('archiver');
const { Writable } = require('stream');
const unzipper = require('unzipper');
const Module = require('node:module');

let activeBucket;
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'firebase-admin') {
    return { apps: [{}], storage: () => ({ bucket: () => activeBucket }) };
  }
  return originalLoad.call(this, request, ...args);
};
let restoreLibraryFromZip;
let listLibrary;
let batchUpload;
let replaceLibraryObject;
try {
  ({ restoreLibraryFromZip, listLibrary, batchUpload, replaceLibraryObject } = require('../imageHostingLibrary'));
} finally {
  Module._load = originalLoad;
}

function fakeBucket(failPath) {
  const objects = new Map([
    ['test/library/old.png', Buffer.from('old')],
    ['test/library/keep.jpg', Buffer.from('before')],
  ]);
  const actions = [];
  const metadata = new Map();
  function file(name) {
    return {
      name,
      get metadata() { return metadata.get(name) || {}; },
      async exists() { return [objects.has(name)]; },
      async getMetadata() { return [metadata.get(name) || {}]; },
      async save(bytes, options = {}) {
        actions.push(`save:${name}`);
        if (name === failPath) throw new Error('injected failure');
        objects.set(name, bytes);
        metadata.set(name, { contentType: options.contentType, size: String(bytes.length),
          updated: new Date().toISOString(), metadata: options.metadata?.metadata || {} });
      },
      async makePublic() {},
      async delete() { actions.push(`delete:${name}`); objects.delete(name); },
    };
  }
  return {
    objects,
    actions,
    metadata,
    file,
    async getFiles({ prefix }) { return [[...objects.keys()].filter((name) => name.startsWith(prefix)).map(file)]; },
  };
}

async function buildZipBufferFromEntries(entries) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
  });
  const sinkDone = new Promise((resolve, reject) => {
    sink.once('finish', resolve);
    sink.once('error', reject);
    archive.once('error', reject);
  });
  archive.pipe(sink);
  for (const e of entries) {
    archive.append(e.buffer, { name: e.name });
  }
  await archive.finalize();
  await sinkDone;
  return Buffer.concat(chunks);
}

test('in-memory ZIP buffer starts with PK header and ends with central directory marker', async () => {
  const buf = await buildZipBufferFromEntries([
    { name: 'logo.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { name: 'hero/banner.jpg', buffer: Buffer.from('JFIF-mock-bytes', 'utf8') },
    { name: 'README.txt', buffer: Buffer.from('hello world\r\n', 'utf8') },
  ]);

  assert.ok(buf.length > 100, 'ZIP should be larger than 100 bytes for 3 small entries');
  assert.deepStrictEqual([buf[0], buf[1], buf[2], buf[3]], [0x50, 0x4b, 0x03, 0x04],
    'ZIP must begin with PK\\x03\\x04 local-file-header magic');

  // End-of-central-directory record: PK\x05\x06 within the last ~64KB.
  const tail = buf.slice(Math.max(0, buf.length - 256));
  let foundEocd = false;
  for (let i = 0; i + 4 <= tail.length; i += 1) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      foundEocd = true;
      break;
    }
  }
  assert.ok(foundEocd, 'ZIP must end with PK\\x05\\x06 end-of-central-directory marker');
});

test('in-memory ZIP buffer round-trips through unzipper with exact bytes', async () => {
  const inputs = [
    { name: 'logo.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]) },
    { name: 'folder/nested/banner.jpg', buffer: Buffer.from('JFIF-mock-bytes-with-binary\x00\x01\x02\x03', 'binary') },
    { name: 'README-empty-library.txt', buffer: Buffer.from('hello world\r\n', 'utf8') },
  ];
  const buf = await buildZipBufferFromEntries(inputs);

  const directory = await unzipper.Open.buffer(buf);
  assert.strictEqual(directory.files.filter((f) => f.type === 'File').length, inputs.length,
    'unzipper should see exactly the entries we appended');

  const byName = Object.create(null);
  for (const f of directory.files) byName[f.path] = f;
  for (const input of inputs) {
    const entry = byName[input.name];
    assert.ok(entry, 'entry ' + input.name + ' must be present in the ZIP');
    const round = await entry.buffer();
    assert.deepStrictEqual(round, input.buffer, 'entry ' + input.name + ' bytes must round-trip exactly');
  }
});

test('empty-but-with-README ZIP is still a valid archive', async () => {
  const buf = await buildZipBufferFromEntries([
    { name: 'README-empty-library.txt', buffer: Buffer.from('library is empty\r\n', 'utf8') },
  ]);
  assert.deepStrictEqual([buf[0], buf[1], buf[2], buf[3]], [0x50, 0x4b, 0x03, 0x04]);
  const directory = await unzipper.Open.buffer(buf);
  const files = directory.files.filter((f) => f.type === 'File');
  assert.strictEqual(files.length, 1);
  assert.strictEqual(files[0].path, 'README-empty-library.txt');
});

test('ZIP replace writes accepted images before deleting stale files', async () => {
  activeBucket = fakeBucket();
  const zip = await buildZipBufferFromEntries([
    { name: 'keep.jpg', buffer: Buffer.from('after') },
    { name: 'new.png', buffer: Buffer.from('new') },
    { name: 'ignored.html', buffer: Buffer.from('not an image') },
  ]);
  const restored = await restoreLibraryFromZip('test', zip, { replace: true });
  assert.deepStrictEqual(restored.map((item) => item.relPath), ['keep.jpg', 'new.png']);
  assert.deepStrictEqual(activeBucket.actions, [
    'save:test/library/keep.jpg', 'save:test/library/new.png', 'delete:test/library/old.png',
  ]);
  assert.strictEqual(activeBucket.objects.has('test/library/ignored.html'), false);
  assert.equal(activeBucket.metadata.get('test/library/keep.jpg').metadata.changeType, 'updated');
  assert.equal(activeBucket.metadata.get('test/library/new.png').metadata.changeType, 'new');
});

test('uploads classify new and replaced files and list their shared change metadata', async () => {
  activeBucket = fakeBucket();
  const input = (name, body, contentType) => ({ name, base64: Buffer.from(body).toString('base64'), contentType });
  const first = await batchUpload('test', [input('logo.gif', 'GIF89a', 'image/gif')], { keepFilename: true, convertToPng: true });
  assert.equal(first.uploaded[0].changeType, 'new');
  assert.equal(activeBucket.objects.get('test/library/logo.gif').toString(), 'GIF89a');
  const second = await batchUpload('test', [input('logo.gif', 'GIF89b', 'image/gif')], { keepFilename: true, onConflict: 'replace' });
  assert.equal(second.uploaded[0].changeType, 'updated');
  const item = (await listLibrary('test')).find((entry) => entry.relPath === 'logo.gif');
  assert.equal(item.changeType, 'updated');
  assert.ok(Number.isFinite(Date.parse(item.changedAt)));
  const replaced = await replaceLibraryObject('test', 'logo.gif', Buffer.from('GIF89c'), 'image/gif');
  assert.equal(replaced.changeType, 'updated');
  const created = await replaceLibraryObject('test', 'missing.gif', Buffer.from('GIF89c'), 'image/gif');
  assert.equal(created.changeType, 'new');
  assert.equal(activeBucket.objects.get('test/library/missing.gif').toString(), 'GIF89c');
  assert.equal(activeBucket.metadata.get('test/library/missing.gif').metadata.changeType, 'new');
});

test('upload converts supported images, preserves non-image files and reports conversion errors', async () => {
  activeBucket = fakeBucket();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>';
  const entries = [
    { name: 'hero.svg', contentType: 'application/octet-stream', base64: Buffer.from(svg).toString('base64') },
    { name: 'document.pdf', contentType: 'application/pdf', base64: Buffer.from('pdf').toString('base64') },
    { name: 'bad.jpg', contentType: 'image/jpeg', base64: Buffer.from('not an image').toString('base64') },
  ];
  const result = await batchUpload('test', entries, { keepFilename: true, convertToPng: true });
  assert.deepEqual(result.uploaded.map((item) => item.relPath), ['hero.png', 'document.pdf']);
  assert.deepEqual(activeBucket.objects.get('test/library/hero.png').subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
  assert.equal(activeBucket.objects.get('test/library/document.pdf').toString(), 'pdf');
  assert.match(result.errors[0].error, /PNG conversion failed/);
  assert.equal(activeBucket.objects.has('test/library/bad.jpg'), false);
});

test('auto-named ZIP upload extracts image entries and converts them into the library', async () => {
  activeBucket = fakeBucket();
  const zip = await buildZipBufferFromEntries([
    { name: 'nested/hero.svg', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>') },
    { name: 'readme.txt', buffer: Buffer.from('not an image') },
  ]);
  const result = await batchUpload('test', [{ name: 'assets.zip', contentType: 'application/zip', base64: zip.toString('base64') }], { convertToPng: true });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.uploaded.map((item) => item.relPath), ['hero-banner.png']);
  assert.deepEqual(activeBucket.objects.get('test/library/hero-banner.png').subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
});

test('ZIP replace does not delete stale files when any upload fails', async () => {
  activeBucket = fakeBucket('test/library/new.png');
  const zip = await buildZipBufferFromEntries([
    { name: 'keep.jpg', buffer: Buffer.from('after') },
    { name: 'new.png', buffer: Buffer.from('new') },
  ]);
  await assert.rejects(restoreLibraryFromZip('test', zip, { replace: true }), { name: 'PartialRestoreError' });
  assert.strictEqual(activeBucket.objects.has('test/library/old.png'), true);
  assert.ok(activeBucket.actions.every((action) => !action.startsWith('delete:')));
});

test('ZIP containing only disallowed files cannot replace the library', async () => {
  activeBucket = fakeBucket();
  const zip = await buildZipBufferFromEntries([{ name: 'payload.html', buffer: Buffer.from('html') }]);
  await assert.rejects(restoreLibraryFromZip('test', zip, { replace: true }), { name: 'EmptyZipError' });
  assert.deepStrictEqual(activeBucket.actions, []);
});

test('library listing preserves public paths and exposes opt-in GCS pagination', async () => {
  const calls = [];
  activeBucket = {
    async getFiles(options) {
      calls.push(options);
      return [[{ name: 'test/library/logo/logo.png', metadata: { size: '4', contentType: 'image/png' } }],
        options.autoPaginate === false ? { pageToken: 'next-page' } : undefined];
    },
  };
  const all = await listLibrary('test');
  assert.equal(all[0].path, 'test/library/logo/logo.png');
  assert.equal(all[0].cdnUrl, '/cdn/test/logo/logo.png');
  const page = await listLibrary('test', { limit: 25, cursor: 'first-page' });
  assert.equal(page.items[0].relPath, 'logo/logo.png');
  assert.equal(page.nextCursor, 'next-page');
  assert.deepStrictEqual(calls, [
    { prefix: 'test/library/' },
    { prefix: 'test/library/', autoPaginate: false, maxResults: 25, pageToken: 'first-page' },
  ]);
});
