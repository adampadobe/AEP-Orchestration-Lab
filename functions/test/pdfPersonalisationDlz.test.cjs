'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const dlz = require('../pdfPersonalisationDlz');

function credentials() {
  return {
    containerName: 'dlz-ajoemailattachments',
    storageAccountName: 'sandbox-account',
    SASUri: 'https://sandbox-account.blob.core.windows.net/dlz-ajoemailattachments?sv=test&sp=rcwl&sig=redacted',
  };
}

test('builds a bounded dated DLZ object path', () => {
  assert.match(dlz.CREDENTIALS_URL, /type=ajoemailattachments$/);
  assert.equal(dlz.EXPECTED_CONTAINER, 'dlz-ajoemailattachments');
  assert.equal(
    dlz.objectPath('../../Job ID 123', new Date('2026-08-11T10:00:00Z'), '/pdf-personalisation/'),
    'pdf-personalisation/2026/08/11/job-id-123.pdf',
  );
});

test('uploads and verifies a PDF without exposing the SAS URI', async () => {
  const calls = [];
  const bytes = Buffer.from('%PDF-1.7\nfixture');
  const result = await dlz.uploadPdf({
    jobId: 'job-123',
    createdAt: new Date('2026-08-11T10:00:00Z'),
    documentName: 'Board Pack.pdf',
    pdfBuffer: bytes,
  }, {
    getDlzCredentials: async () => credentials(),
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (options.method === 'PUT') return { ok: true, status: 201 };
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'content-length' ? String(bytes.length) : null },
      };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.headers['x-ms-blob-type'], 'BlockBlob');
  assert.match(calls[0].url, /dlz-ajoemailattachments\/pdf-personalisation\/2026\/08\/11\/job-123\.pdf\?/);
  assert.equal(result.dlzObjectPath, 'pdf-personalisation/2026/08/11/job-123.pdf');
  assert.equal(result.dlzPlatformPath, 'dlz-ajoemailattachments/pdf-personalisation/2026/08/11/job-123.pdf');
  assert.equal(result.dlzUri, 'dlz://sandbox-account/dlz-ajoemailattachments/pdf-personalisation/2026/08/11/job-123.pdf');
  assert.equal(result.dlzExpiresAt, '2026-08-18T10:00:00.000Z');
  assert.equal(JSON.stringify(result).includes('sig='), false);
});

test('opens a DLZ PDF through the private gateway', async () => {
  const body = Readable.from(Buffer.from('%PDF fixture'));
  const opened = await dlz.openPdf({
    dlzContainer: 'dlz-ajoemailattachments',
    dlzObjectPath: 'pdf-personalisation/2026/08/11/job-123.pdf',
    size: 12,
  }, {
    getDlzCredentials: async () => credentials(),
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => '12' },
      body,
    }),
  });
  assert.equal(opened.stream, body);
  assert.equal(opened.contentLength, 12);
});
