'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable, Writable } = require('node:stream');
const unzipper = require('unzipper');
const { streamExport } = require('../imageHostingExports');

function fakeBucket() {
  const deleted = [];
  const chunks = [];
  const bucket = {
    deleted,
    chunks,
    path: '',
    async getFiles({ prefix }) {
      assert.equal(prefix, 'users/user123/exports/');
      return [[{
        metadata: { timeCreated: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
        async delete() { deleted.push('expired'); },
      }], null];
    },
    file(path) {
      bucket.path = path;
      return {
        createWriteStream() {
          return new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } });
        },
        async getSignedUrl() { return ['https://example.test/signed']; },
        async delete() { deleted.push('incomplete'); },
      };
    },
  };
  return bucket;
}

test('streams a ZIP to a private per-user export and returns a signed URL', async () => {
  const bucket = fakeBucket();
  const source = { createReadStream: () => Readable.from([Buffer.from('image bytes')]) };
  const result = await streamExport('user123', [{ file: source, name: 'folder/image.png' }], 'library.zip', { bucket });
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://example.test/signed');
  assert.match(bucket.path, /^users\/user123\/exports\/[^/]+\.zip$/);
  assert.deepEqual(bucket.deleted, ['expired']);
  const zip = await unzipper.Open.buffer(Buffer.concat(bucket.chunks));
  assert.equal(zip.files[0].path, 'folder/image.png');
  assert.equal((await zip.files[0].buffer()).toString(), 'image bytes');
});

test('failed source streams delete the incomplete export', async () => {
  const bucket = fakeBucket();
  const source = { createReadStream: () => Readable.from((async function* () { throw new Error('source failed'); })()) };
  await assert.rejects(streamExport('user123', [{ file: source, name: 'image.png' }], 'library.zip', { bucket }), /source failed/);
  assert.deepEqual(bucket.deleted, ['expired', 'incomplete']);
});

test('rejects unsafe ZIP paths', async () => {
  const bucket = fakeBucket();
  await assert.rejects(streamExport('user123', [{ file: {}, name: '../image.png' }], 'library.zip', { bucket }), /Invalid export entry path/);
  assert.deepEqual(bucket.deleted, ['expired', 'incomplete']);
});
