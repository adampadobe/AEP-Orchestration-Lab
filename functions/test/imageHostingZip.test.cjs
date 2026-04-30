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
