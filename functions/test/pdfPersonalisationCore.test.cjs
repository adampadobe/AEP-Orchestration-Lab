'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const unzipper = require('unzipper');
const core = require('../pdfPersonalisationCore');

test('renders Emirates-style nested fields and loops with HTML escaping', () => {
  const template = `<!doctype html><html><body>
    <h1>{{data.bookingReference}}</h1>
    <p>{{data.passenger.firstName}}</p>
    {{#each data.flightDetails}}<span>{{flightNumber}} {{departureAirport}}</span>{{/each}}
  </body></html>`;
  const result = core.renderHtmlTemplate(template, {
    bookingReference: '<EK123>',
    passenger: { firstName: 'Ada & Co' },
    flightDetails: [{ flightNumber: 'EK 1', departureAirport: 'DXB' }],
  });
  assert.match(result.renderedHtml, /&lt;EK123&gt;/);
  assert.match(result.renderedHtml, /Ada &amp; Co/);
  assert.match(result.renderedHtml, /EK 1 DXB/);
  assert.equal(result.templateHash.length, 64);
});

test('supports deterministic date and currency helpers', () => {
  const result = core.renderHtmlTemplate(
    '<p>{{formatDate data.date}} | {{formatCurrency data.total data.currency}}</p>',
    { date: '2026-08-06T10:00:00Z', total: 1234.5, currency: 'GBP' },
    { locale: 'en-GB', timeZone: 'UTC' },
  );
  assert.match(result.renderedHtml, /6 Aug 2026/);
  assert.match(result.renderedHtml, /£1,234\.50/);
});

test('blocks active content and private or insecure resource URLs', () => {
  assert.throws(
    () => core.validateHtmlTemplate('<script>alert(1)</script>'),
    (error) => error.code === 'PDF_TEMPLATE_ACTIVE_CONTENT_BLOCKED',
  );
  assert.throws(
    () => core.validateHtmlTemplate('<img src="http://example.com/a.png">'),
    (error) => error.code === 'PDF_TEMPLATE_RESOURCE_URL_INVALID',
  );
  assert.throws(
    () => core.validateHtmlTemplate('<img src="https://127.0.0.1/a.png">'),
    (error) => error.code === 'PDF_TEMPLATE_PRIVATE_URL_BLOCKED',
  );
  assert.doesNotThrow(
    () => core.validateHtmlTemplate('<img src="https://example.com/a.png"><img src="data:image/png;base64,AA==">'),
  );
});

test('blocks active content injected by an unescaped personalised value', () => {
  assert.throws(
    () => core.renderHtmlTemplate(
      '<!doctype html><html><body>{{{data.customerNote}}}</body></html>',
      { customerNote: '<script>alert(1)</script>' },
    ),
    (error) => error && error.code === 'PDF_TEMPLATE_ACTIVE_CONTENT_BLOCKED',
  );
});

test('packages rendered HTML as a top-level index.html ZIP entry', async () => {
  const html = '<!doctype html><html><body>Ready</body></html>';
  const zip = await core.createHtmlZip(html);
  const directory = await unzipper.Open.buffer(zip);
  assert.deepEqual(directory.files.map((file) => file.path), ['index.html']);
  assert.equal((await directory.files[0].buffer()).toString('utf8'), html);
});

test('submits ZIP to HTMLToPDFJob and validates returned PDF bytes', async () => {
  class Stub { constructor(value) { Object.assign(this, value); } }
  const calls = [];
  const pdfServices = {
    async upload(input) { calls.push(['upload', input.mimeType]); return { id: 'input' }; },
    async submit(input) { calls.push(['submit', input.job.inputAsset.id]); return 'poll-url'; },
    async getJobResult(input) { calls.push(['poll', input.pollingURL]); return { result: { asset: { id: 'pdf' } } }; },
    async getContent() { calls.push(['content']); return { readStream: Readable.from(Buffer.from('%PDF-1.7\nfixture')) }; },
  };
  const pdfSdk = {
    ServicePrincipalCredentials: Stub,
    PageLayout: Stub,
    HTMLToPDFParams: Stub,
    HTMLToPDFJob: Stub,
    HTMLToPDFResult: class HTMLToPDFResult {},
    MimeType: { ZIP: 'application/zip' },
  };
  const pdf = await core.convertHtmlZipToPdf(
    Buffer.from('zip'),
    {},
    { clientId: 'client', clientSecret: 'secret' },
    { pdfSdk, pdfServices },
  );
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.deepEqual(calls, [
    ['upload', 'application/zip'],
    ['submit', 'input'],
    ['poll', 'poll-url'],
    ['content'],
  ]);
});

test('normalises a supported source document and derives its PDF name', () => {
  const input = core.normaliseGenerateRequest({
    conversionMode: 'document',
    sourceDocument: {
      fileName: '../../Board Pack.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: Buffer.from('docx fixture').toString('base64'),
    },
    idempotencyKey: 'document-board-pack-1',
  });
  assert.equal(input.conversionMode, 'document');
  assert.equal(input.sourceDocument.fileName, 'Board-Pack.docx');
  assert.equal(input.sourceDocument.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(input.sourceDocument.buffer.toString('utf8'), 'docx fixture');
  assert.equal(input.sourceDocument.sha256.length, 64);
  assert.equal(input.documentName, 'Board-Pack.pdf');
  assert.equal(input.htmlTemplate, '');
});

test('rejects unsupported or mismatched source documents', () => {
  assert.throws(
    () => core.normaliseSourceDocument({ fileName: 'payload.exe', base64: 'YQ==' }),
    (error) => error.code === 'PDF_SOURCE_DOCUMENT_TYPE_UNSUPPORTED',
  );
  assert.throws(
    () => core.normaliseSourceDocument({ fileName: 'report.docx', mimeType: 'image/png', base64: 'YQ==' }),
    (error) => error.code === 'PDF_SOURCE_DOCUMENT_MIME_MISMATCH',
  );
  assert.throws(
    () => core.normaliseSourceDocument({ fileName: 'report.docx', base64: 'not-base64' }),
    (error) => error.code === 'PDF_SOURCE_DOCUMENT_BASE64_INVALID',
  );
});

test('submits source documents with CreatePDFJob', async () => {
  class Stub { constructor(value) { Object.assign(this, value); } }
  const calls = [];
  const pdfServices = {
    async upload(input) { calls.push(['upload', input.mimeType]); return { id: 'source' }; },
    async submit(input) { calls.push(['submit', input.job.inputAsset.id]); return 'create-poll-url'; },
    async getJobResult(input) { calls.push(['poll', input.pollingURL]); return { result: { asset: { id: 'pdf' } } }; },
    async getContent() { calls.push(['content']); return { readStream: Readable.from(Buffer.from('%PDF-1.7\nfixture')) }; },
  };
  const pdfSdk = {
    ServicePrincipalCredentials: Stub,
    CreatePDFJob: Stub,
    CreatePDFResult: class CreatePDFResult {},
  };
  const sourceDocument = core.normaliseSourceDocument({
    fileName: 'report.docx',
    base64: Buffer.from('fixture').toString('base64'),
  });
  const pdf = await core.convertDocumentToPdf(
    sourceDocument,
    { clientId: 'client', clientSecret: 'secret' },
    { pdfSdk, pdfServices },
  );
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.deepEqual(calls, [
    ['upload', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['submit', 'source'],
    ['poll', 'create-poll-url'],
    ['content'],
  ]);
});

test('normalises document options and enforces idempotency keys', () => {
  const input = core.normaliseGenerateRequest({
    htmlTemplate: '<p>{{data.name}}</p>',
    data: { name: 'Ada' },
    documentName: '../../Boarding Pass.pdf',
    idempotencyKey: 'booking-EK123',
    options: { pageWidth: 999, pageHeight: 1, waitTimeToLoad: -4 },
  });
  assert.equal(input.documentName, 'Boarding-Pass.pdf');
  assert.equal(input.options.pageWidth, 20);
  assert.equal(input.options.pageHeight, 3);
  assert.equal(input.options.waitTimeToLoad, 0);
  assert.throws(
    () => core.normaliseGenerateRequest({ htmlTemplate: '<p>x</p>', data: {}, idempotencyKey: 'short' }),
    (error) => error.code === 'PDF_IDEMPOTENCY_KEY_INVALID',
  );
});
