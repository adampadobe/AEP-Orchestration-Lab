'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../pdfJourneyTemplateStore');

function harness() {
  const records = new Map();
  const objects = new Map();
  function ref(id) {
    return {
      async get() {
        const value = records.get(id);
        return { exists: !!value, data: () => structuredClone(value) };
      },
      async set(value, options) {
        records.set(id, options && options.merge
          ? { ...(records.get(id) || {}), ...structuredClone(value) }
          : structuredClone(value));
      },
    };
  }
  const collection = {
    doc: ref,
    where(field, _operator, expected) {
      return {
        async get() {
          return {
            docs: Array.from(records.values())
              .filter((value) => value[field] === expected)
              .map((value) => ({ data: () => structuredClone(value) })),
          };
        },
      };
    },
  };
  return {
    records,
    objects,
    deps: {
      firestore: { collection: () => collection },
      bucket: {
        file(path) {
          return {
            async save(bytes) { objects.set(path, Buffer.from(bytes)); },
            async download() { return [Buffer.from(objects.get(path))]; },
          };
        },
      },
      now: () => new Date('2026-08-11T19:30:00.000Z'),
    },
  };
}

test('stores, lists, resolves, and loads an owner-scoped HTML journey template', async () => {
  const fixture = harness();
  const html = '<!doctype html><html><body>Hello {{data.firstName}}</body></html>';
  const saved = await store.saveTemplate({
    ownerUid: 'user-1',
    templateName: 'airport-welcome',
    label: 'Airport welcome',
    subject: 'Welcome to your flight',
    documentName: 'airport-welcome.pdf',
    sourceFile: {
      fileName: 'airport-welcome.html',
      mimeType: 'text/html',
      base64: Buffer.from(html).toString('base64'),
    },
  }, fixture.deps);
  assert.equal(saved.templateName, 'airport-welcome');
  assert.equal(saved.kind, 'html');
  assert.equal(saved.objectPath, undefined);
  assert.equal((await store.listUploadedTemplates('user-1', fixture.deps)).length, 1);
  assert.equal((await store.listUploadedTemplates('user-2', fixture.deps)).length, 0);

  const metadata = await store.resolveTemplateMetadata('airport-welcome', 'user-1', fixture.deps);
  assert.equal(metadata.source, 'uploaded');
  const loaded = await store.loadTemplateSource({
    templateSource: metadata.source,
    templateName: metadata.templateName,
    templateKind: metadata.kind,
    templateObjectPath: metadata.objectPath,
    templateSourceHash: metadata.sourceHash,
    templateSourceName: metadata.sourceFileName,
    templateMimeType: metadata.mimeType,
  }, fixture.deps);
  assert.match(loaded.htmlTemplate, /data\.firstName/);
});

test('supports document templates and archives only the owner copy', async () => {
  const fixture = harness();
  const saved = await store.saveTemplate({
    ownerUid: 'user-1',
    templateName: 'terms-document',
    sourceFile: {
      fileName: 'terms.txt',
      mimeType: 'text/plain',
      base64: Buffer.from('Travel terms').toString('base64'),
    },
  }, fixture.deps);
  assert.equal(saved.kind, 'document');
  const metadata = await store.resolveTemplateMetadata('terms-document', 'user-1', fixture.deps);
  const loaded = await store.loadTemplateSource({
    templateSource: 'uploaded',
    templateKind: 'document',
    templateObjectPath: metadata.objectPath,
    templateSourceHash: metadata.sourceHash,
    templateSourceName: metadata.sourceFileName,
    templateMimeType: metadata.mimeType,
  }, fixture.deps);
  assert.equal(Buffer.from(loaded.sourceDocument.base64, 'base64').toString(), 'Travel terms');
  await assert.rejects(
    store.archiveTemplate('user-2', 'terms-document', fixture.deps),
    (error) => error.code === 'PDF_JOURNEY_TEMPLATE_NOT_FOUND',
  );
  assert.equal((await store.archiveTemplate('user-1', 'terms-document', fixture.deps)).archived, true);
  assert.equal((await store.listUploadedTemplates('user-1', fixture.deps)).length, 0);
});

test('versions a validated replacement while preserving its runtime mapping', async () => {
  const fixture = harness();
  const base = {
    ownerUid: 'user-1',
    templateName: 'boarding-pass',
    fieldDefinitions: [{ name: 'PassengerName', type: 'text' }],
    fieldMappings: [{ target: 'PassengerName', source: 'passengerName', required: true, type: 'text' }],
    inputSchema: [{ name: 'passengerName', label: 'Passenger name', dataType: 'string', required: true }],
    sampleData: { passengerName: 'Adam Palmer', Barcode: `data:image/png;base64,${'A'.repeat(60_000)}` },
    expectedPageCount: 1,
    validation: { pageCount: 1, validatedAt: '2026-08-11T20:00:00.000Z' },
    sourceFile: {
      fileName: 'boarding-pass.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: Buffer.from('first-version').toString('base64'),
    },
  };
  const first = await store.saveTemplate(base, fixture.deps);
  assert.equal(first.version, 1);
  assert.equal(first.fieldMappings[0].source, 'passengerName');
  assert.equal(first.inputSchema[0].name, 'passengerName');
  assert.deepEqual(first.sampleData, { passengerName: 'Adam Palmer' });
  const second = await store.saveTemplate({
    ...base,
    replace: true,
    sourceFile: { ...base.sourceFile, base64: Buffer.from('second-version').toString('base64') },
  }, fixture.deps);
  assert.equal(second.version, 2);
  const metadata = await store.resolveTemplateMetadata('boarding-pass', 'user-1', fixture.deps);
  assert.equal(metadata.version, 2);
  assert.equal(metadata.expectedPageCount, 1);
});

test('removes large image data from persisted template samples', () => {
  assert.deepEqual(store.sanitizeSampleData({
    Barcode: `data:image/png;base64,${'A'.repeat(10_000)}`,
    flightNumber: 'RX 401',
    ignored: 'not in schema',
  }, [
    { name: 'Barcode' },
    { name: 'flightNumber' },
  ]), { Barcode: '', flightNumber: 'RX 401' });
});

test('protects built-in names and resolves built-ins without an owner', async () => {
  const fixture = harness();
  const builtIn = await store.resolveTemplateMetadata('booking-confirmation', null, fixture.deps);
  assert.equal(builtIn.source, 'builtin');
  assert.equal(builtIn.kind, 'html');
  await assert.rejects(
    store.saveTemplate({
      ownerUid: 'user-1',
      templateName: 'booking-confirmation',
      sourceFile: { fileName: 'x.html', base64: Buffer.from('<html>x</html>').toString('base64') },
    }, fixture.deps),
    (error) => error.code === 'PDF_JOURNEY_TEMPLATE_NAME_RESERVED',
  );
});
