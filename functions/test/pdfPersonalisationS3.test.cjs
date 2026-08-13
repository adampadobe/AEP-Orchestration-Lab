'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const s3 = require('../pdfPersonalisationS3');

function deps(overrides = {}) {
  return {
    outputStoreMode: 'dual',
    s3Bucket: 'adobe-demo-emea-ajo-pdf',
    s3Region: 'us-east-1',
    s3Prefix: 'pdf-personalisation',
    getS3AccessKeyId: () => 'test-access-key',
    getS3SecretAccessKey: () => 'test-secret-key',
    ...overrides,
  };
}

test('normalises output modes and builds a bounded dated S3 key', () => {
  assert.equal(s3.outputStoreMode(deps()), 'dual');
  assert.equal(s3.usesS3('dual'), true);
  assert.equal(s3.usesGcs('dual'), true);
  assert.equal(
    s3.objectKey('../../Job ID 123', new Date('2026-08-06T10:00:00Z'), '/pdf-personalisation/'),
    'pdf-personalisation/2026/08/06/job-id-123.pdf',
  );
});

test('uploads PDF bytes with private metadata and checksum', async () => {
  let command;
  const result = await s3.uploadPdf({
    jobId: 'job-123',
    createdAt: new Date('2026-08-06T10:00:00Z'),
    documentName: 'Board Pack.pdf',
    pdfBuffer: Buffer.from('%PDF-1.7\nfixture'),
    principalIdHash: 'principal-hash',
    conversionMode: 'document',
    requestHash: 'request-hash',
    expiresAt: '2026-08-20T10:00:00.000Z',
  }, deps({
    s3Client: {
      async send(value) {
        command = value;
        return { ETag: '"etag-value"', ChecksumSHA256: 'checksum-value' };
      },
    },
  }));

  assert.equal(command.input.Bucket, 'adobe-demo-emea-ajo-pdf');
  assert.equal(command.input.Key, 'pdf-personalisation/2026/08/06/job-123.pdf');
  assert.equal(command.input.ContentType, 'application/pdf');
  assert.match(command.input.ContentDisposition, /Board-Pack\.pdf/);
  assert.equal(command.input.Metadata.conversionmode, 'document');
  assert.ok(command.input.ChecksumSHA256);
  assert.equal(result.s3Uri, 's3://adobe-demo-emea-ajo-pdf/pdf-personalisation/2026/08/06/job-123.pdf');
  assert.equal(result.s3ETag, 'etag-value');
});

test('opens an S3 PDF as a stream for the existing download gateway', async () => {
  const stream = Readable.from(Buffer.from('%PDF-1.7\nfixture'));
  const opened = await s3.openPdf({
    s3Bucket: 'adobe-demo-emea-ajo-pdf',
    s3Region: 'us-east-1',
    s3Key: 'pdf-personalisation/2026/08/06/job-123.pdf',
    size: 16,
  }, deps({
    s3Client: { async send() { return { Body: stream, ContentLength: 16 }; } },
  }));
  assert.equal(opened.stream, stream);
  assert.equal(opened.contentLength, 16);
});
